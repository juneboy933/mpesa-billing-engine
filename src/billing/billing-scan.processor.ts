import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { Queue } from 'bullmq';
import { PaymentsService } from '../payments/payments.service';
import { PaymentAttemptStatus } from '../generated/prisma/enums';

@Processor('billing-scan')
export class BillingScanProcessor extends WorkerHost{
    constructor(
        @InjectQueue('charge-processing') private readonly chargeQueue: Queue,
        private readonly prisma: PrismaService,
        private readonly paymentsService: PaymentsService,
    ) {
        super();
    }

    async process() {
        await this.paymentsService.reprocessPendingCallbacks();
        await this.paymentsService.reconcileStuckAttempts();
        const due = await this.prisma.subscription.findMany({
            where: { 
                status: { in: [ 'ACTIVE', 'RETRYING' ] },
                nextBillingDate: { lte: new Date()},
                paymentAttempts: {
                    none: {
                        status: {
                            in: [
                                PaymentAttemptStatus.SCHEDULED,
                                PaymentAttemptStatus.INITIATED,
                                PaymentAttemptStatus.PENDING_CONFIRMATION,
                            ],
                        },
                    },
                },
            },
            select: { id: true },
        });

        for(const subscription of due){
            await this.chargeQueue.add('process-charge', { subscriptionId: subscription.id });
        }
    }
}
