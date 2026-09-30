import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreatePlanDto {
    @ApiProperty({
        description: 'Name of the billing plan',
        example: 'Basic Monthly',
        minLength: 1,
    })
    @IsString()
    @IsNotEmpty()
    readonly name: string;

    @ApiProperty({
        description: 'Recurring amount in KES for the plan',
        example: 500,
        minimum: 1,
    })
    @IsNotEmpty()
    @IsNumber()
    readonly amount: number;
}