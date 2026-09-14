import { Processor, WorkerHost } from '@nestjs/bullmq';
import { PaymentsService } from '../payments/payments.service';
import { Job } from 'bullmq';

@Processor('charge-processing')
export class ChargeProcessingProcessor extends WorkerHost{
    constructor( private readonly paymentsServices: PaymentsService) {
        super();
    }

    async process(job: Job<{ subscriptionId: string}>): Promise<void> {
        await this.paymentsServices.triggerSTkPush(job.data.subscriptionId);
    }
}
