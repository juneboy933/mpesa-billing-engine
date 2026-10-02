import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

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
        description: 'Merchant phone number used for sign-in',
        example: '0712345678',
    })
    @IsString()
    @IsNotEmpty()
    phoneNumber: string;

    @ApiProperty({ description: 'Password used for merchant sign-in', minLength: 12, maxLength: 128, writeOnly: true })
    @IsString()
    @MinLength(12)
    @MaxLength(128)
    password: string;

    @ApiProperty({ description: 'Optional contact email; password recovery is handled by support', required: false })
    @IsEmail()
    @IsOptional()
    email?: string;

    @ApiProperty({
        description: 'Optional webhook URL where merchant events will be posted',
        example: 'https://api.example.com/webhooks/merchant',
        required: false,
    })
    @IsUrl({ protocols: ['https'], require_protocol: true })
    @IsOptional()
    webhookUrl?: string;
}
