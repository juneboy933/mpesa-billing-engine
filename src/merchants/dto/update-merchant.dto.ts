import { IsOptional, IsUrl } from "class-validator";

export class UpdateMerchantDto {
    @IsOptional()
    @IsUrl()
    readonly webhookUrl?: string;
}