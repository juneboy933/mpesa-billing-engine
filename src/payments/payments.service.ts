import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentAttemptStatus, SubscriptionStatus } from '../generated/prisma/enums';
import { DarajaService } from './daraja/daraja.service';
import { StkCallbackBody } from './dto/callback.dto';
import { Prisma } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { MpesaCredentialsService } from '../merchants/mpesa-credentials.service';
import { MerchantCredentials, StkPushOutcomeUnknownError } from './daraja/daraja.service';

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
    ): Promise<'RETRYING' | 'PAST_DUE' | 'CANCELLED'> {
        const retryIndex = attempt.attemptNumber - 1;

        if (retryIndex < this.RETRY_SCHEDULE_DAYS.length) {
            const nextRetryDate = new Date();
            nextRetryDate.setDate(nextRetryDate.getDate() + this.RETRY_SCHEDULE_DAYS[retryIndex]);

            const updated = await tx.subscription.updateMany({
                where: {
                    id: attempt.subscriptionId,
                    status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.RETRYING, SubscriptionStatus.PAST_DUE] },
                },
                data: { status: SubscriptionStatus.RETRYING, nextBillingDate: nextRetryDate },
            });

            return updated.count ? 'RETRYING' : 'CANCELLED';
        } else {
            const updated = await tx.subscription.updateMany({
                where: {
                    id: attempt.subscriptionId,
                    status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.RETRYING, SubscriptionStatus.PAST_DUE] },
                },
                data: { status: SubscriptionStatus.PAST_DUE },
            });

            return updated.count ? 'PAST_DUE' : 'CANCELLED';
        }
    }

    private async notifyFailureOutcome(
        attempt: { subscriptionId: string; attemptNumber: number },
        merchantId: string,
        outcome: 'RETRYING' | 'PAST_DUE' | 'CANCELLED',
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
            const movedToPending = await this.prisma.paymentAttempt.updateMany({
                where: { id: attempt.id, status: PaymentAttemptStatus.INITIATED },
                data: { status: PaymentAttemptStatus.PENDING_CONFIRMATION },
            });
            if (movedToPending.count) {
                this.logger.warn(`Payment attempt ${attempt.id} is awaiting provider confirmation; automatic retries are held to avoid duplicate charges`);
                await this.notifyPendingConfirmation(attempt, attempt.subscription.merchantId);
            }
        }
    }

    async reprocessPendingCallbacks() {
        const callbacks = await this.prisma.darajaCallback.findMany({
            where: { processedAt: null },
            orderBy: { receivedAt: 'asc' },
            take: 100,
        });

        for (const buffered of callbacks) {
            const attempt = await this.prisma.paymentAttempt.findUnique({
                where: { checkoutId: buffered.checkoutId },
                select: { id: true },
            });
            if (attempt) await this.processCallback(buffered.payload as unknown as StkCallbackBody);
        }
    }

    private async notifyPendingConfirmation(
        attempt: { id: string; subscriptionId: string; attemptNumber: number },
        merchantId: string,
    ) {
        await this.notification.send(merchantId, 'payment.pending_confirmation', {
            paymentAttemptId: attempt.id,
            subscriptionId: attempt.subscriptionId,
            attemptNumber: attempt.attemptNumber,
            resolutionRequired: true,
        });
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
        const attemptData = await this.prisma.$transaction(async (tx) => {
            const subscription = await tx.subscription.findUnique({
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

            if (!subscription) throw new NotFoundException('Subscription not found');
            if (subscription.status === SubscriptionStatus.CANCELLED) {
                throw new ConflictException('Cancelled subscriptions cannot be charged');
            }
            const planAmount = subscription.plan.amount.toNumber();
            if (!Number.isInteger(planAmount) || planAmount < 1) {
                throw new BadRequestException('Plan amount must be a positive whole KES amount');
            }
            if (![SubscriptionStatus.ACTIVE, SubscriptionStatus.RETRYING, SubscriptionStatus.PAST_DUE].includes(subscription.status)) {
                throw new ConflictException('Subscription is not eligible for payment');
            }

            const merchant = subscription.merchant;
            if (
                !merchant || merchant.mpesaSetupStatus !== 'COMPLETED' ||
                !merchant.mpesaConsumerKeyEncrypted || !merchant.mpesaConsumerSecretEncrypted ||
                !merchant.mpesaShortcode || !merchant.mpesaPasskeyEncrypted
            ) {
                throw new BadRequestException('Complete M-Pesa setup before collecting payments');
            }

            // This conditional write serializes the charge claim against cancellation.
            const claim = await tx.subscription.updateMany({
                where: {
                    id: subscription.id,
                    status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.RETRYING, SubscriptionStatus.PAST_DUE] },
                },
                data: { updatedAt: new Date() },
            });
            if (!claim.count) throw new ConflictException('Subscription is no longer eligible for payment');

            const lastAttempt = await tx.paymentAttempt.findFirst({
                where: { subscriptionId },
                orderBy: { createdAt: 'desc' },
            });
            const attemptNumber =
                lastAttempt?.status === PaymentAttemptStatus.FAILED ||
                lastAttempt?.status === PaymentAttemptStatus.TIMED_OUT
                    ? lastAttempt.attemptNumber + 1
                    : 1;
            const idempotencyKey = `charge:${subscriptionId}:${subscription.nextBillingDate.toISOString()}:${attemptNumber}`;

            const attempt = await tx.paymentAttempt.create({
                data: {
                    subscriptionId,
                    idempotencyKey,
                    status: PaymentAttemptStatus.SCHEDULED,
                    amount: planAmount,
                    attemptNumber,
                },
            });

            return { subscription, attempt };
        }).catch((error) => {
            if (error instanceof Object && 'code' in error && error.code === 'P2002') {
                throw new ConflictException('A payment attempt already exists for this billing cycle');
            }
            throw error;
        });

        const { subscription, attempt } = attemptData;

        // Recheck cancellation immediately before crossing the provider boundary.
        const initiated = await this.prisma.$transaction(async (tx) => {
            const claim = await tx.subscription.updateMany({
                where: {
                    id: subscriptionId,
                    status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.RETRYING, SubscriptionStatus.PAST_DUE] },
                },
                data: { updatedAt: new Date() },
            });
            if (!claim.count) return false;
            const updated = await tx.paymentAttempt.updateMany({
                where: { id: attempt.id, status: PaymentAttemptStatus.SCHEDULED },
                data: { status: PaymentAttemptStatus.INITIATED },
            });
            return updated.count === 1;
        });
        if (!initiated) {
            await this.prisma.paymentAttempt.updateMany({
                where: { id: attempt.id, status: PaymentAttemptStatus.SCHEDULED },
                data: { status: PaymentAttemptStatus.FAILED, resolvedAt: new Date() },
            });
            throw new ConflictException('Subscription was cancelled before payment could be sent');
        }

        try {
            const merchant = subscription.merchant!;
            const merchantCredentials: MerchantCredentials = {
                consumerKey: this.mpesaCredentials.decrypt(merchant.mpesaConsumerKeyEncrypted!),
                consumerSecret: this.mpesaCredentials.decrypt(merchant.mpesaConsumerSecretEncrypted!),
                shortcode: merchant.mpesaShortcode!,
                passkey: this.mpesaCredentials.decrypt(merchant.mpesaPasskeyEncrypted!),
            };
            const stkPayload = {
                phone: subscription.customerPhone,
                amount: subscription.plan.amount.toNumber(),
                accountReference: subscription.plan.name,
                transactionDec: `${subscription.plan.name} subscription`,
            };
            const { CheckoutRequestID } = await this.daraja.triggerStk(stkPayload, merchantCredentials);

            await this.prisma.paymentAttempt.updateMany({
                where: { id: attempt.id, status: PaymentAttemptStatus.INITIATED },
                data: { checkoutId: CheckoutRequestID },
            });
            const bufferedCallback = await this.prisma.darajaCallback.findUnique({
                where: { checkoutId: CheckoutRequestID },
            });
            if (bufferedCallback && !bufferedCallback.processedAt) {
                await this.processCallback(bufferedCallback.payload as unknown as StkCallbackBody);
            }
        } catch (error) {
            if (error instanceof StkPushOutcomeUnknownError) {
                const pending = await this.prisma.paymentAttempt.updateMany({
                    where: { id: attempt.id, status: PaymentAttemptStatus.INITIATED },
                    data: { status: PaymentAttemptStatus.PENDING_CONFIRMATION },
                });
                if (pending.count) await this.notifyPendingConfirmation(attempt, subscription.merchantId);
                throw error;
            }
            const failed = await this.prisma.$transaction(async (tx) => {
                const transitioned = await tx.paymentAttempt.updateMany({
                    where: { id: attempt.id, status: PaymentAttemptStatus.INITIATED },
                    data: { status: PaymentAttemptStatus.FAILED, resolvedAt: new Date() },
                });
                if (!transitioned.count) return null;
                const outcome = await this.advanceRetryOrPastDue(tx, attempt);
                return outcome;
            });

            if (failed) {
                await this.notifyFailureOutcome(attempt, subscription.merchantId, failed, error instanceof Error ? error.message : undefined);
            }
            throw error;
        }
    }

    async processCallback(callback: StkCallbackBody) {
        const stkCallback = callback.Body.stkCallback;

        const attempt = await this.prisma.paymentAttempt.findUnique({
            where: { checkoutId: stkCallback.CheckoutRequestID},
            include: { subscription: { include: { plan: true } } },
        });

        if(!attempt) {
            this.logger.warn(`Callback for unknown CheckoutRequestId: ${stkCallback.CheckoutRequestID}`);
            await this.prisma.darajaCallback.upsert({
                where: { checkoutId: stkCallback.CheckoutRequestID },
                create: {
                    checkoutId: stkCallback.CheckoutRequestID,
                    payload: callback as unknown as Prisma.InputJsonValue,
                },
                update: {},
            });
            return { received: true, pending: true };
        }

        if(stkCallback.ResultCode !== 0) {
            this.logger.error(`Payment not successfull - ResultCode: ${stkCallback.ResultCode}, Desc: ${stkCallback.ResultDesc}`);

            const outcome = await this.prisma.$transaction(async (tx) => {
                const transitioned = await tx.paymentAttempt.updateMany({
                    where: {
                        id: attempt.id,
                        status: { in: [PaymentAttemptStatus.INITIATED, PaymentAttemptStatus.PENDING_CONFIRMATION] },
                    },
                    data: { status: PaymentAttemptStatus.FAILED, resolvedAt: new Date() },
                });
                if (!transitioned.count) {
                    await tx.darajaCallback.updateMany({
                        where: { checkoutId: stkCallback.CheckoutRequestID, processedAt: null },
                        data: { processedAt: new Date() },
                    });
                    return null;
                }
                const outcome = await this.advanceRetryOrPastDue(tx, attempt);
                await tx.darajaCallback.updateMany({
                    where: { checkoutId: stkCallback.CheckoutRequestID, processedAt: null },
                    data: { processedAt: new Date() },
                });
                return outcome;
            });
            
            if (outcome) {
                await this.notifyFailureOutcome(
                    attempt,
                    attempt.subscription.merchantId,
                    outcome,
                    stkCallback.ResultDesc,
                );
            }

            return { received: true, duplicate: !outcome };
        }

        const processed = await this.prisma.$transaction(async (tx) => {
            const transitioned = await tx.paymentAttempt.updateMany({
                where: {
                    id: attempt.id,
                    status: {
                        in: [PaymentAttemptStatus.INITIATED, PaymentAttemptStatus.PENDING_CONFIRMATION, PaymentAttemptStatus.TIMED_OUT],
                    },
                },
                data: { status: PaymentAttemptStatus.SUCCEEDED, resolvedAt: new Date() },
            });
            if (!transitioned.count) {
                await tx.darajaCallback.updateMany({
                    where: { checkoutId: stkCallback.CheckoutRequestID, processedAt: null },
                    data: { processedAt: new Date() },
                });
                return false;
            }

            await tx.subscription.updateMany({
                where: {
                    id: attempt.subscriptionId,
                    status: { not: SubscriptionStatus.CANCELLED },
                },
                data: {
                    status: SubscriptionStatus.ACTIVE,
                    nextBillingDate: this.addInterval(attempt.subscription.nextBillingDate, attempt.subscription.plan.interval),
                },
            });
            await tx.darajaCallback.updateMany({
                where: { checkoutId: stkCallback.CheckoutRequestID, processedAt: null },
                data: { processedAt: new Date() },
            });
            return true;
        });

        if (!processed) return { received: true, duplicate: true };

        await this.notification.send(attempt.subscription.merchantId, 'payment.succeeded', {
            subscriptionId: attempt.subscriptionId,
            attemptNumber: Number(attempt.attemptNumber),
            amount: Number(attempt.amount),
        })
        return { received: true };
    }

    private addInterval(date: Date, interval: string): Date {
        const result = new Date(date);
        if (interval === 'WEEKLY') {
            result.setUTCDate(result.getUTCDate() + 7);
            return result;
        }

        const originalDay = result.getUTCDate();
        result.setUTCDate(1);
        result.setUTCMonth(result.getUTCMonth() + 1);
        const lastDayOfTargetMonth = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
        result.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
        return result;
    }
}
