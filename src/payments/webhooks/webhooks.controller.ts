import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { PaymentsService } from '../payments.service';
import type { StkCallbackBody } from '../dto/callback.dto';
import { Public } from '../../common/decorators/public.decorator';
import { WebhookGuard } from '../guards/webhook.guard';

@Controller('webhooks')
export class WebhooksController {
    constructor(private readonly paymentsService: PaymentsService) {}

    @Public()
    @HttpCode(200)
    @UseGuards(WebhookGuard)
    @Post('/daraja/callback/:token')
    async handleCallback(@Body() payload: StkCallbackBody) {
        await this.paymentsService.processCallback(payload);
        return { ResultCode: 0, ResultDesc: 'Accepted' }
    }
}
