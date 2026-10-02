import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { CradleVoicesService } from './cradle-voices.service';

interface CustomerSmsJob {
  message: string;
  phoneNumber: string;
}

@Processor('customer-sms')
export class CustomerSmsProcessor extends WorkerHost {
  constructor(private readonly cradleVoices: CradleVoicesService) {
    super();
  }

  async process(job: Job<CustomerSmsJob>) {
    return this.cradleVoices.sendSms(job.data.message, [job.data.phoneNumber]);
  }
}
