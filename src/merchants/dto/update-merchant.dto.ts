import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUrl } from 'class-validator';

export class UpdateMerchantDto {
    @ApiPropertyOptional({
        description: 'Updated webhook URL for the merchant',
        example: 'https://api.example.com/webhooks/merchant',
    })
    @IsOptional()
    @IsUrl({ protocols: ['https'], require_protocol: true })
    readonly webhookUrl?: string;
}
