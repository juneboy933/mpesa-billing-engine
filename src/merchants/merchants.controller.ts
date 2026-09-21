import { Body, Controller, Post, Get, Patch, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { MerchantsService } from './merchants.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { Public } from '../common/decorators/public.decorator';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { Request } from 'express';

interface AuthenticatedUser extends Request {
    merchant: { id: string },
}

@ApiTags('merchants')
@Controller('merchants')
export class MerchantsController {
    constructor(private readonly merchantsService: MerchantsService) {}

    @Public()
    @Post()
    @ApiOperation({ summary: 'Register a new merchant and receive an API key (shown once)' })
    @ApiResponse({ status: 201, description: 'Merchant created; save the returned apiKey now' })
    async create(@Body() dto: CreateMerchantDto) {
        return await this.merchantsService.create(dto);
    }

    @Patch('me')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Update merchant webhook URL'})
    @ApiResponse({ status: 200, description: 'Merchant updated successfully'})
    async update(@Req() req: AuthenticatedUser, @Body() dto: UpdateMerchantDto) {
        return await this.merchantsService.update(req.merchant.id, dto);
    }

    @Post('me/rotate-webhook-secret')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Rotate the webhook signing secret — old secret is invalidated immediately' })
    @ApiResponse({ status: 201, description: 'New secret returned; save it now, it will not be shown again' })
    async rotateWebhookSecret(@Req() req: AuthenticatedUser) {
        return this.merchantsService.rotateWebhookSecret(req.merchant.id);
    }
}
