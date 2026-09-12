import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { WebhooksController } from './webhooks/webhooks.controller';
import { DarajaModule } from './daraja/daraja.module';

@Module({
  imports: [DarajaModule],
  providers: [PaymentsService],
  controllers: [WebhooksController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
