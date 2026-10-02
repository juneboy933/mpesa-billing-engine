import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

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
    @IsInt()
    @Min(1)
    readonly amount: number;

    @ApiProperty({ enum: ['WEEKLY', 'MONTHLY'], default: 'MONTHLY' })
    @IsIn(['WEEKLY', 'MONTHLY'])
    readonly interval: 'WEEKLY' | 'MONTHLY' = 'MONTHLY';
}
