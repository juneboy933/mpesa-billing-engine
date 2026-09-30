import { Body, Controller, Post, Get, Patch, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { MerchantsService } from './merchants.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { Public } from '../common/decorators/public.decorator';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { Request } from 'express';
import { OnboardMerchantDto } from './dto/onboard-merchant.dto';
import { SetupMpesaDto } from './dto/setup-mpesa.dto';
import { CreatePlanDto } from '../plans/dto/create-plan.dto';

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

    @Public()
    @Post('onboarding/start')
    @ApiOperation({ summary: 'Start guided merchant onboarding' })
    @ApiResponse({ status: 201, description: 'Merchant created; continue with PayBill setup' })
    async startOnboarding(@Body() dto: CreateMerchantDto) {
        return await this.merchantsService.startOnboarding(dto);
    }

    @Get('analytics')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Get merchant revenue and retention analytics for the active account' })
    @ApiResponse({ status: 200, description: 'Analytics summary retrieved successfully' })
    async getAnalyticsSummary(@Req() req: AuthenticatedUser) {
        return await this.merchantsService.getAnalyticsSummary(req.merchant.id);
    }

    @Get('dashboard')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Get the merchant dashboard summary' })
    @ApiResponse({ status: 200, description: 'Dashboard summary retrieved successfully' })
    async getDashboard(@Req() req: AuthenticatedUser) {
        return await this.merchantsService.getDashboard(req.merchant.id);
    }

    @Public()
    @Post('onboard')
    @ApiOperation({ summary: 'Create a merchant and their first default billing plan in one onboarding flow' })
    @ApiResponse({ status: 201, description: 'Merchant and default plan created successfully' })
    async onboard(@Body() dto: OnboardMerchantDto) {
        return await this.merchantsService.onboard(dto);
    }

    @Post('me/mpesa-setup')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Validate and save the merchant PayBill Daraja credentials' })
    @ApiResponse({ status: 201, description: 'M-Pesa setup completed successfully' })
    async setupMpesa(@Req() req: AuthenticatedUser, @Body() dto: SetupMpesaDto) {
        return await this.merchantsService.setupMpesa(req.merchant.id, dto);
    }

    @Get('me/mpesa-setup')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Get the authenticated merchant M-Pesa setup status' })
    @ApiResponse({ status: 200, description: 'M-Pesa setup status retrieved successfully' })
    async getMpesaSetupStatus(@Req() req: AuthenticatedUser) {
        return await this.merchantsService.getMpesaSetupStatus(req.merchant.id);
    }

    @Get('me/onboarding')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Get guided onboarding progress for the authenticated merchant' })
    @ApiResponse({ status: 200, description: 'Onboarding progress retrieved successfully' })
    async getOnboardingStatus(@Req() req: AuthenticatedUser) {
        return await this.merchantsService.getOnboardingStatus(req.merchant.id);
    }

    @Post('me/onboarding/plan')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Create the first membership plan after PayBill setup' })
    @ApiResponse({ status: 201, description: 'Onboarding completed with the first plan' })
    async completeOnboarding(@Req() req: AuthenticatedUser, @Body() dto: CreatePlanDto) {
        return await this.merchantsService.completeOnboarding(req.merchant.id, dto);
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
