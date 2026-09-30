import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentAttemptStatus, SubscriptionStatus } from '../generated/prisma/enums';
import { DarajaService } from './daraja/daraja.service';
import { StkCallbackBody } from './dto/callback.dto';
import { Prisma } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { MpesaCredentialsService } from '../merchants/mpesa-credentials.service';
import { MerchantCredentials } from './daraja/daraja.service';

@Injectable()
export class PaymentsService {
    private readonly logger = new Logger(PaymentsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly daraja: DarajaService,
        private readonly notification: NotificationsService,
        private readonly mpesaCredentials: MpesaCredentialsService,
    ) {}

    private readonly RETRY_SCHEDULE_DAYS = [1, 3, 7];

    private async advanceRetryOrPastDue(
        tx: Prisma.TransactionClient,
        attempt: { id: string; attemptNumber: number; subscriptionId: string },
    ) {
        const retryIndex = attempt.attemptNumber - 1;

        if (retryIndex < this.RETRY_SCHEDULE_DAYS.length) {
            const nextRetryDate = new Date();
            nextRetryDate.setDate(nextRetryDate.getDate() + this.RETRY_SCHEDULE_DAYS[retryIndex]);

            await tx.subscription.update({
                where: { id: attempt.subscriptionId },
                data: { status: SubscriptionStatus.RETRYING, nextBillingDate: nextRetryDate },
            });

            return 'RETRYING';
        } else {
            await tx.subscription.update({
                where: { id: attempt.subscriptionId },
                data: { status: SubscriptionStatus.PAST_DUE },
            });

            return 'PAST_DUE';
        }
    }

    private async notifyFailureOutcome(
        attempt: { subscriptionId: string; attemptNumber: number },
        merchantId: string,
        outcome: 'RETRYING' | 'PAST_DUE',
        resultDesc?: string,
        ) {
            await this.notification.send(merchantId, 'payment.failed', {
                subscriptionId: attempt.subscriptionId,
                attemptNumber: attempt.attemptNumber,
                resultDesc: resultDesc ?? 'No response from customer',
            });

            if (outcome === 'PAST_DUE') {
                await this.notification.send(merchantId, 'subscription.past_due', {
                subscriptionId: attempt.subscriptionId,
                });
            }
    }

    async reconcileStuckAttempts() {
        const cutoff = new Date(Date.now() - 5 * 60 * 1000);
        const stuck = await this.prisma.paymentAttempt.findMany({
            where: { 
                status: PaymentAttemptStatus.INITIATED, 
                createdAt: { lt: cutoff } 
            },
            include: {subscription: true },
        });

        for (const attempt of stuck) {
            const outcome = await this.prisma.$transaction(async (tx) => {
                await tx.paymentAttempt.update({
                    where: { id: attempt.id },
                    data: { status: PaymentAttemptStatus.TIMED_OUT, resolvedAt: new Date() },
                });
                return await this.advanceRetryOrPastDue(tx, attempt);
            });

            await this.notifyFailureOutcome(attempt, attempt.subscription.merchantId, outcome);
        }
    }

    async getReceipts(merchantId: string, subscriptionId: string) {
        const attempts = await this.prisma.paymentAttempt.findMany({
            where: {
                subscriptionId,
                subscription: { merchantId },
            },
            orderBy: { createdAt: 'desc' },
            include: {
                subscription: {
                    select: {
                        id: true,
                        customerPhone: true,
                        plan: {
                            select: {
                                name: true,
                            },
                        },
                    },
                },
            },
        });

        if (!attempts.length) {
            throw new NotFoundException('No payment receipts found for this subscription');
        }

        const receipts = attempts.map((attempt) => ({
            id: attempt.id,
            status: attempt.status,
            amount: Number(attempt.amount),
            createdAt: attempt.createdAt,
            resolvedAt: attempt.resolvedAt,
            receiptNumber: `RCPT-${attempt.id.slice(-6).toUpperCase()}`,
        }));

        return {
            subscriptionId,
            customerPhone: attempts[0].subscription.customerPhone,
            currentPlan: attempts[0].subscription.plan.name,
            totalPayments: receipts.length,
            receipts,
        };
    }

    async getReceiptById(merchantId: string, subscriptionId: string, paymentAttemptId: string) {
        const attempt = await this.prisma.paymentAttempt.findFirst({
            where: {
                id: paymentAttemptId,
                subscriptionId,
                subscription: { merchantId },
            },
            include: {
                subscription: {
                    select: {
                        id: true,
                        customerPhone: true,
                        plan: {
                            select: {
                                name: true,
                            },
                        },
                    },
                },
            },
        });

        if (!attempt) {
            throw new NotFoundException('Receipt not found');
        }

        return {
            receiptId: attempt.id,
            subscriptionId: attempt.subscription.id,
            customerPhone: attempt.subscription.customerPhone,
            planName: attempt.subscription.plan.name,
            amount: Number(attempt.amount),
            status: attempt.status,
            createdAt: attempt.createdAt,
            resolvedAt: attempt.resolvedAt,
            receiptNumber: `RCPT-${attempt.id.slice(-6).toUpperCase()}`,
        };
    }

    async triggerSTkPush(subscriptionId: string) {
        const subscription = await this.prisma.subscription.findUnique({
            where: { id: subscriptionId },
            include: {
                plan: true,
                merchant: {
                    select: {
                        mpesaConsumerKeyEncrypted: true,
                        mpesaConsumerSecretEncrypted: true,
                        mpesaShortcode: true,
                        mpesaPasskeyEncrypted: true,
                        mpesaSetupStatus: true,
                    },
                },
            },
        });

        if(!subscription) throw new NotFoundException('Subscription not found');

        if (subscription.merchant && subscription.merchant.mpesaSetupStatus !== 'COMPLETED') {
            throw new BadRequestException('Complete M-Pesa setup before collecting payments');
        }
        
        const lastAttempt = await this.prisma.paymentAttempt.findFirst({
            where: { subscriptionId },
            orderBy: { createdAt: 'desc' },
        });

        const attemptNumber =
            lastAttempt?.status === PaymentAttemptStatus.FAILED ||
            lastAttempt?.status === PaymentAttemptStatus.TIMED_OUT
            ? lastAttempt.attemptNumber + 1
            : 1;

        const idempotencyKey = `charge:${subscriptionId}:${subscription.nextBillingDate.toISOString()}`;

        let attempt;
        try {
            attempt = await this.prisma.paymentAttempt.create({
                data: {
                    subscriptionId,
                    idempotencyKey,
                    status: PaymentAttemptStatus.SCHEDULED,
                    amount: subscription.plan.amount.toNumber(),
                    attemptNumber,
                }
            });
            
        } catch (error) {
            if (error instanceof Object && 'code' in error && error.code === 'P2002') {
                throw new ConflictException('A payment attempt already exists for this billing cycle');
            }
            throw error;
        }

        try {
            const merchantCredentials = subscription.merchant?.mpesaSetupStatus === 'COMPLETED'
                ? {
                    consumerKey: this.mpesaCredentials.decrypt(subscription.merchant.mpesaConsumerKeyEncrypted!),
                    consumerSecret: this.mpesaCredentials.decrypt(subscription.merchant.mpesaConsumerSecretEncrypted!),
                    shortcode: subscription.merchant.mpesaShortcode!,
                    passkey: this.mpesaCredentials.decrypt(subscription.merchant.mpesaPasskeyEncrypted!),
                } satisfies MerchantCredentials
                : undefined;

            const stkPayload = {
                phone: subscription.customerPhone,
                amount: Math.round(subscription.plan.amount.toNumber()),
                accountReference: subscription.plan.name,
                transactionDec: `${subscription.plan.name} subscription`,
            };
            const { CheckoutRequestID } = merchantCredentials
                ? await this.daraja.triggerStk(stkPayload, merchantCredentials)
                : await this.daraja.triggerStk(stkPayload);

            await this.prisma.paymentAttempt.update({
                where: { id: attempt.id },
                data: { status: PaymentAttemptStatus.INITIATED, checkoutId: CheckoutRequestID },
            });
        } catch (error) {
            await this.prisma.paymentAttempt.update({
                where: { id: attempt.id },
                data: { status: PaymentAttemptStatus.FAILED, resolvedAt: new Date() }
            });

            throw error;
        }
    }

    async processCallback(callback: StkCallbackBody) {
        const stkCallback = callback.Body.stkCallback;

        const attempt = await this.prisma.paymentAttempt.findUnique({
            where: { checkoutId: stkCallback.CheckoutRequestID},
            include: { subscription: true },
        });

        if(!attempt) {
            this.logger.warn(`Callback for unknown CheckoutRequestId: ${stkCallback.CheckoutRequestID}`);
            return { received: true }
        }

        if(stkCallback.ResultCode !== 0) {
            this.logger.error(`Payment not successfull - ResultCode: ${stkCallback.ResultCode}, Desc: ${stkCallback.ResultDesc}`);

            const outcome = await this.prisma.$transaction(async (tx) => {
                await tx.paymentAttempt.update({
                    where: { id: attempt.id },
                    data: { status: PaymentAttemptStatus.FAILED, resolvedAt: new Date() },
                });

                return this.advanceRetryOrPastDue(tx, attempt);
            });
            
           await this.notifyFailureOutcome(
                attempt, 
                attempt.subscription.merchantId, 
                outcome, 
                stkCallback.ResultDesc
            );

            return { received: true }
        }

        const newNextBillingDate = this.addOneMonth(attempt.subscription.nextBillingDate);

        await this.prisma.$transaction([
            this.prisma.paymentAttempt.update({
                where: { id: attempt.id },
                data: { status: PaymentAttemptStatus.SUCCEEDED, resolvedAt: new Date()},
            }),

            this.prisma.subscription.update({
                where: { id: attempt.subscriptionId },
                data: { 
                    status: SubscriptionStatus.ACTIVE,
                    nextBillingDate: newNextBillingDate,
                }
            })

        ])

        await this.notification.send(attempt.subscription.merchantId, 'payment.succeeded', {
            subscriptionId: attempt.subscriptionId,
            attemptNumber: Number(attempt.attemptNumber),
            amount: Number(attempt.amount),
        })
    }

    private addOneMonth(date: Date): Date {
        const result = new Date(date);
        result.setMonth(result.getMonth() + 1);
        return result;
    }
}
