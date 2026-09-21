import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { MerchantsService } from '../merchants/merchants.service';
import * as crypto from 'crypto';
import { Prisma } from '../generated/prisma/client';
import { WebhookDeliveryStatus } from '../generated/prisma/enums';

type WebhookEventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'subscription.past_due'
  | 'subscription.cancelled';

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);

    constructor(
        @InjectQueue('webhook-delivery') private readonly deliveryQueue: Queue,
        private readonly prisma: PrismaService,
        private readonly merchantsService: MerchantsService,
    ) {}

    async send(merchantId: string, eventType: WebhookEventType, data: Record< string, unknown >) {
        const merchant = await this.merchantsService.findWebhookConfig(merchantId);

        if(!merchant?.webhookUrl || !merchant.webhookSecret) {
            this.logger.debug(`Merchant ${merchant?.id} has no webhook configured - skipping ${eventType}`);
            return;
        }

        const payload = {
            id: `event_${crypto.randomBytes(16).toString('hex')}`,
            type: eventType,
            createdAt: new Date().toISOString(),
            data,
        };

        const delivery = await this.prisma.webhookDelivery.create({
            data: {
                merchantId,
                eventType,
                payload: payload as Prisma.InputJsonValue,
                status: WebhookDeliveryStatus.PENDING
            }
        });

        await this.deliveryQueue.add(
            'deliver', 
            { deliveryId: delivery.id}, 
            { attempts: 5, backoff: {type: 'exponential', delay: 2000}}
        );
    }
}
