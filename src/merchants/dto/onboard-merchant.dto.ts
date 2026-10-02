import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, Min, MinLength } from 'class-validator';

export class OnboardMerchantDto {
    @ApiProperty({
        description: 'Merchant display name',
        example: 'M-Kopa Store',
        minLength: 1,
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: '0712345678' })
    @IsString()
    @IsNotEmpty()
    phoneNumber: string;

    @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
    @IsString()
    @MinLength(12)
    @MaxLength(128)
    password: string;

    @ApiProperty({ required: false })
    @IsEmail()
    @IsOptional()
    email?: string;

    @ApiProperty({
        description: 'Optional webhook URL for merchant events',
        example: 'https://api.example.com/webhooks/merchant',
        required: false,
    })
    @IsUrl({ protocols: ['https'], require_protocol: true })
    @IsOptional()
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
    @IsInt()
    @Min(1)
    planAmount: number;

    @ApiProperty({ enum: ['WEEKLY', 'MONTHLY'], default: 'MONTHLY' })
    @IsOptional()
    @IsIn(['WEEKLY', 'MONTHLY'])
    interval?: 'WEEKLY' | 'MONTHLY';
}
