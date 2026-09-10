import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { WebhooksController } from './webhooks/webhooks.controller';
import { DarajaModule } from './daraja/daraja.module';

@Module({
  providers: [PaymentsService],
  controllers: [WebhooksController],
  imports: [DarajaModule],
  exports: [PaymentsService],
})
export class PaymentsModule {}
