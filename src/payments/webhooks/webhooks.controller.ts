import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from '../payments.service';
import { StkCallbackEnvelopeDto, type StkCallbackBody } from '../dto/callback.dto';
import { Public } from '../../common/decorators/public.decorator';
import { WebhookGuard } from '../guards/webhook.guard';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
    constructor(private readonly paymentsService: PaymentsService) {}

    @Public()
    @HttpCode(200)
    @UseGuards(WebhookGuard)
    @Post('/daraja/callback/:token')
    @ApiOperation({ summary: 'Receive M-Pesa Daraja STK callback payloads' })
    @ApiParam({
        name: 'token',
        description: 'Shared callback token used to validate the webhook request',
        example: 'sample-callback-token',
    })
    @ApiBody({ type: StkCallbackEnvelopeDto })
    @ApiResponse({ status: 200, description: 'Callback accepted and processed successfully' })
    async handleCallback(@Param('token') token: string, @Body() payload: StkCallbackBody) {
        await this.paymentsService.processCallback(payload);
        return { ResultCode: 0, ResultDesc: 'Accepted', token };
    }
}
