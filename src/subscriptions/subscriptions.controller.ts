import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import type { Request } from 'express';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { ApiOperation, ApiTags, ApiResponse, ApiSecurity } from '@nestjs/swagger';

interface AuthenticatedRequest extends Request {
    merchant: { id: string };
}

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
    constructor(private readonly subscriptionsService: SubscriptionsService) {}

    @Post()
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Create a new subscription for the authenticated merchant' })
    @ApiResponse({ status: 201, description: 'Subscription created successfully' })
    async createSubscription(
        @Req() req: AuthenticatedRequest, 
        @Body() dto: CreateSubscriptionDto
    ) {
        return await this.subscriptionsService.createSubscription(req.merchant.id, dto);
    }

    @Get()
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Get all subscriptions for the authenticated merchant' })
    @ApiResponse({ status: 200, description: 'Subscriptions retrieved successfully' })
    async getAllSubscriptions(@Req() req: AuthenticatedRequest) {
        return await this.subscriptionsService.getAllSubscriptions(req.merchant.id);
    }

    @Get(':subscriptionId')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Get a specific subscription by ID for the authenticated merchant' })
    @ApiResponse({ status: 200, description: 'Subscription retrieved successfully' })
    async getSubscriptionById(
        @Req() req: AuthenticatedRequest, 
        @Param('subscriptionId') subscriptionId: string
    ) {
        return await this.subscriptionsService.getSubscriptionById(
            req.merchant.id, 
            subscriptionId
        );
    }

    @Patch(':subscriptionId/cancel')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Cancel a subscription for the authenticated merchant' })
    @ApiResponse({ status: 200, description: 'Subscription canceled successfully' })
    async cancelSubscription(
        @Req() req: AuthenticatedRequest, 
        @Param('subscriptionId') subscriptionId: string
    ) {
        return await this.subscriptionsService.cancelSubscription(
            req.merchant.id, 
            subscriptionId
        );
    }
}
