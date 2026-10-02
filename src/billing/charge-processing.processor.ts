import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { PaymentsService } from '../payments/payments.service';
import { Job } from 'bullmq';

@Processor('charge-processing')
export class ChargeProcessingProcessor extends WorkerHost{
    private readonly logger = new Logger(ChargeProcessingProcessor.name);

    constructor( private readonly paymentsServices: PaymentsService) {
        super();
    }

    async process(job: Job<{ subscriptionId: string}>): Promise<void> {
        try {
            await this.paymentsServices.triggerSTkPush(job.data.subscriptionId);
        } catch (error) {
            // PaymentsService persists the failed attempt and schedules the next retry.
            // Retrying this queue job immediately could create another STK prompt.
            this.logger.warn(
                `Charge request for subscription ${job.data.subscriptionId} was not sent: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }
}
