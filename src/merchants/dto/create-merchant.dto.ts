import {IsNotEmpty, IsOptional, IsString, IsUrl} from 'class-validator';

export class CreateMerchantDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsUrl()
    @IsOptional()
    @IsString()
    webhookUrl?: string;
}