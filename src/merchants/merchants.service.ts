import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';

const merchantSelect = {
    id: true,
    name: true, 
    webhookUrl: true,
    createdAt: true,
}

@Injectable()
export class MerchantsService {
    constructor(private readonly prisma: PrismaService) {}

    async create(dto: CreateMerchantDto) {
        const rawApiKey = `mk_${crypto.randomBytes(32).toString('hex')}`;
        const apiKeyHash = await argon2.hash(rawApiKey);

        const merchant = await this.prisma.merchant.create({
            data: {
                name: dto.name,
                webhookUrl: dto.webhookUrl,
                apiKeyHash: apiKeyHash
            },
            select: merchantSelect
        });

        return { merchant, apiKey: rawApiKey };
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
}
