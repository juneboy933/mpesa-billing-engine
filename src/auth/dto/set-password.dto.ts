import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SetPasswordDto {
    @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
    @IsString()
    @MinLength(12)
    @MaxLength(128)
    password: string;

    @ApiPropertyOptional({ writeOnly: true })
    @IsOptional()
    @IsString()
    @MaxLength(128)
    currentPassword?: string;
}
