import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import type { Request } from 'express';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { ApiOperation, ApiTags, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { MemberPortalService } from './member-portal.service';

interface AuthenticatedRequest extends Request {
    merchant: { id: string };
}

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
    constructor(
        private readonly subscriptionsService: SubscriptionsService,
        private readonly memberPortal: MemberPortalService,
    ) {}

    @Post()
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Create a new subscription for the authenticated merchant' })
    @ApiResponse({ status: 201, description: 'Subscription created successfully' })
    async createSubscription(
        @Req() req: AuthenticatedRequest,
        @Body() dto: CreateSubscriptionDto,
    ) {
        return await this.subscriptionsService.createSubscription(req.merchant.id, dto);
    }

    @Get()
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Get a page of up to 20 subscriptions for the authenticated merchant' })
    @ApiResponse({ status: 200, description: 'A paginated list with total counts and page metadata' })
    async getAllSubscriptions(@Req() req: AuthenticatedRequest, @Query('page') page?: string) {
        const requestedPage = page === undefined ? 1 : Number(page);
        return await this.subscriptionsService.getManagementOverview(req.merchant.id, requestedPage);
    }

    @Get('management')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Get the merchant subscription management overview with plan details' })
    @ApiResponse({ status: 200, description: 'Subscription management overview retrieved successfully' })
    async getManagementOverview(@Req() req: AuthenticatedRequest, @Query('page') page?: string) {
        const requestedPage = page === undefined ? 1 : Number(page);
        return await this.subscriptionsService.getManagementOverview(req.merchant.id, requestedPage);
    }

    @Get(':subscriptionId/receipts')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Get all payment receipts for a subscription' })
    @ApiResponse({ status: 200, description: 'Receipts retrieved successfully' })
    async getReceipts(
        @Req() req: AuthenticatedRequest,
        @Param('subscriptionId') subscriptionId: string,
    ) {
        return await this.subscriptionsService.getReceipts(req.merchant.id, subscriptionId);
    }

    @Post(':subscriptionId/member-link')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Send the member an SMS link to view subscription and payment history' })
    @ApiResponse({ status: 201, description: 'Expiring member link queued by SMS' })
    async sendMemberPortalLink(
        @Req() req: AuthenticatedRequest,
        @Param('subscriptionId') subscriptionId: string,
    ) {
        return this.memberPortal.issueLinkAndSendSms(req.merchant.id, subscriptionId);
    }

    @Get(':subscriptionId/receipts/:receiptId')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Get a single payment receipt for a subscription' })
    @ApiResponse({ status: 200, description: 'Receipt retrieved successfully' })
    async getReceiptById(
        @Req() req: AuthenticatedRequest,
        @Param('subscriptionId') subscriptionId: string,
        @Param('receiptId') receiptId: string,
    ) {
        return await this.subscriptionsService.getReceiptById(req.merchant.id, subscriptionId, receiptId);
    }

    @Get('retry-queue')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Get the merchant retry queue for subscriptions needing collection recovery' })
    @ApiResponse({ status: 200, description: 'Retry queue retrieved successfully' })
    async getRetryQueue(@Req() req: AuthenticatedRequest) {
        return await this.subscriptionsService.getRetryQueue(req.merchant.id);
    }

    @Post(':subscriptionId/retry')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Trigger an immediate retry for a subscription in the dunning queue' })
    @ApiResponse({ status: 200, description: 'Retry payment request sent successfully' })
    async triggerRetry(
        @Req() req: AuthenticatedRequest,
        @Param('subscriptionId') subscriptionId: string,
    ) {
        return await this.subscriptionsService.triggerRetry(req.merchant.id, subscriptionId);
    }

    @Get(':subscriptionId')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Get a specific subscription by ID for the authenticated merchant' })
    @ApiResponse({ status: 200, description: 'Subscription retrieved successfully' })
    async getSubscriptionById(
        @Req() req: AuthenticatedRequest,
        @Param('subscriptionId') subscriptionId: string,
    ) {
        return await this.subscriptionsService.getSubscriptionById(req.merchant.id, subscriptionId);
    }

    @Get(':subscriptionId/portal')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Get the customer billing portal view for a subscription' })
    @ApiResponse({ status: 200, description: 'Customer billing portal retrieved successfully' })
    async getCustomerPortal(
        @Req() req: AuthenticatedRequest,
        @Param('subscriptionId') subscriptionId: string,
    ) {
        return await this.subscriptionsService.getCustomerPortal(req.merchant.id, subscriptionId);
    }

    @Post(':subscriptionId/pay-now')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Trigger an immediate M-Pesa billing attempt for the customer' })
    @ApiResponse({ status: 200, description: 'Payment request sent successfully' })
    async payNow(
        @Req() req: AuthenticatedRequest,
        @Param('subscriptionId') subscriptionId: string,
    ) {
        return await this.subscriptionsService.payNow(req.merchant.id, subscriptionId);
    }

    @Patch(':subscriptionId/cancel')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Cancel a subscription for the authenticated merchant' })
    @ApiResponse({ status: 200, description: 'Subscription canceled successfully' })
    async cancelSubscription(
        @Req() req: AuthenticatedRequest,
        @Param('subscriptionId') subscriptionId: string,
    ) {
        return await this.subscriptionsService.cancelSubscription(req.merchant.id, subscriptionId);
    }
}
