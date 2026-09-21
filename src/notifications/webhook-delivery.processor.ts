import { Processor, WorkerHost } from "@nestjs/bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { MerchantsService } from "../merchants/merchants.service";
import { Job } from "bullmq";
import * as crypto from 'crypto';
import axios from "axios";
import { WebhookDeliveryStatus } from "../generated/prisma/enums";
import { Logger } from "@nestjs/common";

@Processor('webhook-delivery')
export class WebhookDeliveryProcessor extends WorkerHost {
    private readonly logger = new Logger(WebhookDeliveryProcessor.name);
    
    constructor(
        private readonly prisma: PrismaService,
        private readonly merchantsService: MerchantsService,
    ) {
        super();
    }

    async process(job: Job<{ deliveryId: string }>): Promise<void> {
        const delivery = await this.prisma.webhookDelivery.findUnique({
            where: { id: job.data.deliveryId },
        });

        if(!delivery) return;

        const merchant = await this.merchantsService.findWebhookConfig(delivery.merchantId);
        if(!merchant?.webhookUrl || !merchant.webhookSecret) return;

        const rawBody = JSON.stringify(delivery.payload);
        const signature = crypto
        .createHmac('sha256', merchant.webhookSecret)
        .update(rawBody)
        .digest('hex')

        try {
            await axios.post(merchant.webhookUrl, delivery.payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Signature': signature,
                },
                timeout: 5000,
            });

            await this.prisma.webhookDelivery.update({
                where: { id: delivery.id },
                data: { status: WebhookDeliveryStatus.DELIVERED, deliveredAt: new Date(), attempts: { increment: 1 } },
            });
        } catch (error) {
            this.logger.error(
                `Webhook delivery failed for merchant ${delivery.merchantId}, event ${delivery.eventType}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
            await this.prisma.webhookDelivery.update({
                where: { id: delivery.id },
                data: { attempts: { increment: 1 } },
            });

        const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
        if (isLastAttempt) {
            await this.prisma.webhookDelivery.update({
                where: { id: delivery.id },
                data: { status: WebhookDeliveryStatus.FAILED },
            });
        }

        throw error; // re-throw so BullMQ actually triggers its own retry/backoff
        }
    }
}
