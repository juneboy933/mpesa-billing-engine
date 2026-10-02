import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

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
    @IsInt()
    @Min(1)
    readonly amount?: number;

    @ApiPropertyOptional({ enum: ['WEEKLY', 'MONTHLY'] })
    @IsOptional()
    @IsIn(['WEEKLY', 'MONTHLY'])
    readonly interval?: 'WEEKLY' | 'MONTHLY';
}
