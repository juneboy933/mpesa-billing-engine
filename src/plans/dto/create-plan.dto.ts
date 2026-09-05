import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class CreatePlanDto {
    @IsString()
    @IsNotEmpty()
    readonly name: string;

    @IsNotEmpty()
    @IsNumber()
    readonly amount: number;
}