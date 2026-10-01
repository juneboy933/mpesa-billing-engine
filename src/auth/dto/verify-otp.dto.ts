import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
    @ApiProperty({ example: '0712345678' })
    @IsString()
    @IsNotEmpty()
    phone: string;

    @ApiProperty({ example: '482913', minLength: 6, maxLength: 6 })
    @IsString()
    @Length(6, 6)
    code: string;
}
