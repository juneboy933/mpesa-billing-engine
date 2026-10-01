import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RequestOtpDto {
    @ApiProperty({ example: '0712345678' })
    @IsString()
    @IsNotEmpty()
    phone: string;
}
