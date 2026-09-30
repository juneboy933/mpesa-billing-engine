import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { WebhooksController } from './webhooks/webhooks.controller';
import { DarajaModule } from './daraja/daraja.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MerchantsModule } from '../merchants/merchants.module';

@Module({
  imports: [DarajaModule, NotificationsModule, MerchantsModule],
  providers: [PaymentsService],
  controllers: [WebhooksController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
