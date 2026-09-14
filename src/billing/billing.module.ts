import { Module } from '@nestjs/common';
import { BillingSchedulerService } from './billing-scheduler.service';
import { BillingScanProcessor } from './billing-scan.processor';
import { ChargeProcessingProcessor } from './charge-processing.processor';
import { BullModule } from '@nestjs/bullmq';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    BullModule.registerQueue({name: 'billing-scan'}, {name: 'charge-processing'}),
    PaymentsModule,
  ],
  providers: [BillingSchedulerService, BillingScanProcessor, ChargeProcessingProcessor]
})
export class BillingModule {}
