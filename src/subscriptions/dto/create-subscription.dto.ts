import { IsNotEmpty, IsString } from "class-validator";

export class CreateSubscriptionDto {
    @IsString()
    @IsNotEmpty()
    readonly planId: string;

    @IsString()
    @IsNotEmpty()
    readonly customerPhone: string;
}