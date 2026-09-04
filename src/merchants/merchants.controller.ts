import { Body, Controller, Post, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { MerchantsService } from './merchants.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { Public } from '../common/decorators/public.decorator';

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

    // @Get()
    // @ApiSecurity('x-api-key')
    // @ApiOperation({ summary: 'Get all merchants (for testing purposes)' })
    // @ApiResponse({ status: 200, description: 'List of merchants' })
    // async findAll() {
    //     return await this.merchantsService.findAll();
    // }
}
