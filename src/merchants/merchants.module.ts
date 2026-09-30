import { Module } from '@nestjs/common';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';
import { DarajaModule } from '../payments/daraja/daraja.module';
import { MpesaCredentialsService } from './mpesa-credentials.service';

@Module({
  imports: [DarajaModule],
  controllers: [MerchantsController],
  providers: [MerchantsService, MpesaCredentialsService],
  exports: [MerchantsService, MpesaCredentialsService],
})
export class MerchantsModule {}
