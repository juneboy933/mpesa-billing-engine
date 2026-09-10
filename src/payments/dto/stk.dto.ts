import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class CreateStkDto {
    @IsString()
    @IsNotEmpty()
    readonly phone: string;

    @IsNumber()
    @IsNotEmpty()
    readonly amount: number;

    @IsString()
    @IsNotEmpty()
    readonly accountReference: string;

    @IsString()
    @IsNotEmpty()
    readonly transactionDec: string;
}