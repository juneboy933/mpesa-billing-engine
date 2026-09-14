// billing-scheduler.service.ts
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class BillingSchedulerService implements OnModuleInit {
  constructor(@InjectQueue('billing-scan') private readonly scanQueue: Queue) {}

  async onModuleInit() {
    await this.scanQueue.upsertJobScheduler(
      'billing-scan-repeat',     
      { every: 5 * 60 * 1000 },       
      { name: 'scan', data: {} },
    );
  }
}