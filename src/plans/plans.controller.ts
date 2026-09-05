import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PlansService} from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

interface AuthenticatedRequest extends Request {
    merchant: { id: string };
}

@ApiTags('plans')
@Controller('plans')
export class PlansController {
    constructor(private readonly plansServices: PlansService) {}

    @Post()
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Create a new plan for the authenticated merchant' })
    @ApiResponse({ status: 201, description: 'Plan created successfully' })
    async create(@Req() req: AuthenticatedRequest, @Body() dto: CreatePlanDto) {
        return await this.plansServices.create(req.merchant.id, dto);
    }

    @Get()
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Retrieve all plans for the authenticated merchant' })
    @ApiResponse({ status: 200, description: 'Plans retrieved successfully' })
    async findAll(@Req() req: AuthenticatedRequest) {
        return await this.plansServices.findAll(req.merchant.id);
    }

    @Get(':planId')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Retrieve a specific plan by ID for the authenticated merchant' })
    @ApiResponse({ status: 200, description: 'Plan retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Plan not found' })
    async findById(@Req() req: AuthenticatedRequest, @Param('planId') planId: string) {
        return await this.plansServices.findById(req.merchant.id, planId);
    }

    @Patch(':planId')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Update a specific plan by ID for the authenticated merchant' })
    @ApiResponse({ status: 200, description: 'Plan updated successfully' })
    @ApiResponse({ status: 404, description: 'Plan not found' })
    async update(@Req() req: AuthenticatedRequest, @Param('planId') planId: string, @Body() dto: UpdatePlanDto) {
        return await this.plansServices.update(req.merchant.id, planId, dto);
    }

    @Delete(':planId')
    @ApiSecurity('api-key')
    @ApiOperation({ summary: 'Delete a specific plan by ID for the authenticated merchant' })
    @ApiResponse({ status: 200, description: 'Plan deleted successfully' })
    @ApiResponse({ status: 404, description: 'Plan not found' })
    async delete(@Req() req: AuthenticatedRequest, @Param('planId') planId: string) {
        return await this.plansServices.delete(req.merchant.id, planId);
    }
}
