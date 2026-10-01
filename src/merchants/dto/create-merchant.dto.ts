import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateMerchantDto {
    @ApiProperty({
        description: 'Merchant display name',
        example: 'M-Kopa Store',
        minLength: 1,
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Merchant phone number used for passwordless login',
        example: '0712345678',
        required: false,
    })
    @IsString()
    @IsOptional()
    phoneNumber?: string;

    @ApiProperty({
        description: 'Optional webhook URL where merchant events will be posted',
        example: 'https://api.example.com/webhooks/merchant',
        required: false,
    })
    @IsUrl()
    @IsOptional()
    @IsString()
    webhookUrl?: string;
}