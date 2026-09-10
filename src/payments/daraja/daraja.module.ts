import { Module } from '@nestjs/common';
import { DarajaService } from './daraja.service';

@Module({
  providers: [DarajaService],
  exports: [DarajaService],
})
export class DarajaModule {}
