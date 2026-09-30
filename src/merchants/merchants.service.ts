import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { OnboardMerchantDto } from './dto/onboard-merchant.dto';

const merchantSelect = {
    id: true,
    name: true, 
    webhookUrl: true,
    createdAt: true,
}

const merchantSelectWithSecrets = {
    id: true,
    webhookUrl: true,
    webhookSecret: true,
}

@Injectable()
export class MerchantsService {
    constructor(private readonly prisma: PrismaService) {}

    async create(dto: CreateMerchantDto) {
        const rawApiKey = `mk_${crypto.randomBytes(32).toString('hex')}`;
        const apiKeyHash = await argon2.hash(rawApiKey);
        const webhookSecret = `whsec_${crypto.randomBytes(32).toString('hex')}`;

        const merchant = await this.prisma.merchant.create({
            data: {
                name: dto.name,
                webhookUrl: dto.webhookUrl,
                apiKeyHash: apiKeyHash,
                webhookSecret,
            },
            select: merchantSelect
        });

        return { merchant, apiKey: rawApiKey, webhookSecret };
    }

    async onboard(dto: OnboardMerchantDto) {
        const rawApiKey = `mk_${crypto.randomBytes(32).toString('hex')}`;
        const apiKeyHash = await argon2.hash(rawApiKey);
        const webhookSecret = `whsec_${crypto.randomBytes(32).toString('hex')}`;

        const result = await this.prisma.$transaction(async (tx) => {
            const merchant = await tx.merchant.create({
                data: {
                    name: dto.name,
                    webhookUrl: dto.webhookUrl,
                    apiKeyHash,
                    webhookSecret,
                },
                select: merchantSelect,
            });

            const plan = await tx.plan.create({
                data: {
                    name: dto.planName.trim(),
                    amount: dto.planAmount,
                    merchantId: merchant.id,
                },
                select: {
                    id: true,
                    name: true,
                    amount: true,
                    interval: true,
                    createdAt: true,
                },
            });

            return { merchant, plan };
        });

        return {
            ...result,
            apiKey: rawApiKey,
            webhookSecret,
        };
    }

    async findById( id: string) {
        return await this.prisma.merchant.findUnique({ 
            where: { id }, 
            select: merchantSelect 
        });
    }

    async findAllForAuth() {
        return await this.prisma.merchant.findMany({
            select: {
                id: true,
                name: true,
                apiKeyHash: true,
            }
        })
    }

    async findWebhookConfig(merchantId: string) {
        return await this.prisma.merchant.findUnique({
            where: { id: merchantId },
            select: merchantSelectWithSecrets,
        });
    }

    async update(merchantId: string, dto: UpdateMerchantDto) {
        return await this.prisma.merchant.update({
            where: { id: merchantId },
            data: { webhookUrl: dto.webhookUrl },
            select: { id: true, name: true, webhookUrl: true, updatedAt: true }, 
        });
    }

    async rotateWebhookSecret(merchantId: string) {
        const webhookSecret = `whsec_${crypto.randomBytes(32).toString('hex')}`;

        await this.prisma.merchant.update({
            where: { id: merchantId },
            data: { webhookSecret },
            select: { id: true },
        });

        return { webhookSecret };
    }
}
