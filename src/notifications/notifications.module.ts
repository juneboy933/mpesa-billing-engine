import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor';
import { BullModule } from '@nestjs/bullmq';
import { MerchantsModule } from '../merchants/merchants.module';

@Module({
  imports: [
    BullModule.registerQueue({name: 'webhook-delivery'}),
    MerchantsModule,
  ],
  providers: [NotificationsService, WebhookDeliveryProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
