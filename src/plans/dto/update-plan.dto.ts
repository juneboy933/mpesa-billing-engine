import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdatePlanDto {
    @ApiPropertyOptional({
        description: 'Updated plan name',
        example: 'Premium Monthly',
    })
    @IsOptional()
    @IsString()
    readonly name?: string;

    @ApiPropertyOptional({
        description: 'Updated recurring amount in KES',
        example: 850,
        minimum: 1,
    })
    @IsOptional()
    @IsNumber()
    readonly amount?: number;
}