import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentAttemptStatus } from '../generated/prisma/enums';
import { DarajaService } from './daraja/daraja.service';
import { StkCallbackBody } from './dto/callback.dto';

@Injectable()
export class PaymentsService {
    private readonly logger = new Logger(PaymentsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly daraja: DarajaService,
    ) {}

    async triggerSTkPush(subscriptionId: string) {
        const subscription = await this.prisma.subscription.findUnique({
            where: { id: subscriptionId },
            include: { plan: true},
        });

        if(!subscription) throw new NotFoundException('Subscription not found');
        const idempotencyKey = `charge:${subscriptionId}:${subscription.nextBillingDate.toISOString()}`;

        let attempt;
        try {
            attempt = await this.prisma.paymentAttempt.create({
                data: {
                    subscriptionId,
                    idempotencyKey,
                    status: PaymentAttemptStatus.SCHEDULED,
                    amount: subscription.plan.amount.toNumber(),
                    attemptNumber: 1,
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
        });

        if(!attempt) {
            this.logger.warn(`Callback for unknown CheckoutRequestId: ${stkCallback.CheckoutRequestID}`);
            return { received: true }
        }

        if(stkCallback.ResultCode !== 0) {
            this.logger.error(`Payment not successfull - ResultCode: ${stkCallback.ResultCode}, Desc: ${stkCallback.ResultDesc}`);

            await this.prisma.paymentAttempt.update({
                where: { id: attempt.id },
                data: { status: PaymentAttemptStatus.FAILED, resolvedAt: new Date()},
            });
            
            return { received: true }
        }


        await this.prisma.paymentAttempt.update({
            where: { id: attempt.id },
            data: { status: PaymentAttemptStatus.SUCCEEDED, resolvedAt: new Date()},
        })
    }
}
