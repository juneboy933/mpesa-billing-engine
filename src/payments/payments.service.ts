import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentAttemptStatus, SubscriptionStatus } from '../generated/prisma/enums';
import { DarajaService } from './daraja/daraja.service';
import { StkCallbackBody } from './dto/callback.dto';
import { Prisma } from '../generated/prisma/client';

@Injectable()
export class PaymentsService {
    private readonly logger = new Logger(PaymentsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly daraja: DarajaService,
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
        } else {
            await tx.subscription.update({
                where: { id: attempt.subscriptionId },
                data: { status: SubscriptionStatus.PAST_DUE },
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
        });

        for (const attempt of stuck) {
            await this.prisma.$transaction(async (tx) => {
                await tx.paymentAttempt.update({
                    where: { id: attempt.id },
                    data: { status: PaymentAttemptStatus.TIMED_OUT, resolvedAt: new Date() },
                });
                await this.advanceRetryOrPastDue(tx, attempt);
            });
        }
    }

    async triggerSTkPush(subscriptionId: string) {
        const subscription = await this.prisma.subscription.findUnique({
            where: { id: subscriptionId },
            include: { plan: true},
        });

        if(!subscription) throw new NotFoundException('Subscription not found');
        
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
            const { CheckoutRequestID } = await this.daraja.triggerStk({
                phone: subscription.customerPhone,
                amount: Math.round(subscription.plan.amount.toNumber()),
                accountReference: subscription.plan.name,
                transactionDec: `${subscription.plan.name} subscription`
            });

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

            const retryIndex = attempt.attemptNumber - 1;

            await this.prisma.$transaction(async (tx) => {
                await tx.paymentAttempt.update({
                    where: { id: attempt.id },
                    data: { status: PaymentAttemptStatus.FAILED, resolvedAt: new Date() },
                });

                await this.advanceRetryOrPastDue(tx, attempt);
            });
            
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
    }

    private addOneMonth(date: Date): Date {
        const result = new Date(date);
        result.setMonth(result.getMonth() + 1);
        return result;
    }
}
