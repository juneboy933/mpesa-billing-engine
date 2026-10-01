import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor';
import { BullModule } from '@nestjs/bullmq';
import { MerchantsModule } from '../merchants/merchants.module';
import { CradleVoicesService } from './cradle-voices.service';

@Module({
  imports: [
    BullModule.registerQueue({name: 'webhook-delivery'}),
    MerchantsModule,
  ],
  providers: [NotificationsService, WebhookDeliveryProcessor, CradleVoicesService],
  exports: [NotificationsService, CradleVoicesService],
})
export class NotificationsModule {}
