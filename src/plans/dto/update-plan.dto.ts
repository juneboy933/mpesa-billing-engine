import { IsNumber, IsOptional, IsString } from "class-validator";

export class UpdatePlanDto {
    @IsOptional()
    @IsString()
    readonly name?: string;

    @IsOptional()
    @IsNumber()
    readonly amount?: number;
}