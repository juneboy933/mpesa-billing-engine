import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateStkDto {
    @ApiProperty({
        description: 'Phone number to debit in E.164 or local format',
        example: '+254712345678',
    })
    @IsString()
    @IsNotEmpty()
    readonly phone: string;

    @ApiProperty({
        description: 'Charge amount in KES',
        example: 500,
        minimum: 1,
    })
    @IsNumber()
    @IsNotEmpty()
    readonly amount: number;

    @ApiProperty({
        description: 'Reference label shown to the customer in the STK prompt',
        example: 'Subscription',
    })
    @IsString()
    @IsNotEmpty()
    readonly accountReference: string;

    @ApiProperty({
        description: 'Description of the transaction for the customer',
        example: 'Monthly plan renewal',
    })
    @IsString()
    @IsNotEmpty()
    readonly transactionDec: string;
}