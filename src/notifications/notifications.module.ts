import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor';
import { BullModule } from '@nestjs/bullmq';
import { MerchantsModule } from '../merchants/merchants.module';
import { CradleVoicesService } from './cradle-voices.service';
import { WebhookDestinationPolicy } from './webhook-destination-policy';
import { CustomerSmsProcessor } from './customer-sms.processor';

@Module({
  imports: [
    BullModule.registerQueue({name: 'webhook-delivery'}, {name: 'customer-sms'}),
    MerchantsModule,
  ],
  providers: [NotificationsService, WebhookDeliveryProcessor, CustomerSmsProcessor, CradleVoicesService, WebhookDestinationPolicy],
  exports: [NotificationsService, CradleVoicesService],
})
export class NotificationsModule {}
