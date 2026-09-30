import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl } from 'class-validator';

export class OnboardMerchantDto {
    @ApiProperty({
        description: 'Merchant display name',
        example: 'M-Kopa Store',
        minLength: 1,
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Optional webhook URL for merchant events',
        example: 'https://api.example.com/webhooks/merchant',
        required: false,
    })
    @IsUrl()
    @IsOptional()
    @IsString()
    webhookUrl?: string;

    @ApiProperty({
        description: 'Name of the first plan created during onboarding',
        example: 'Starter Monthly',
        minLength: 1,
    })
    @IsString()
    @IsNotEmpty()
    planName: string;

    @ApiProperty({
        description: 'Amount in KES for the first plan',
        example: 500,
        minimum: 1,
    })
    @IsNumber()
    @IsNotEmpty()
    planAmount: number;
}
