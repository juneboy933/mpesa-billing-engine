import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SignInDto {
    @ApiProperty({ example: '0712345678' })
    @IsString()
    @IsNotEmpty()
    phone: string;

    @ApiProperty({ writeOnly: true })
    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    password: string;
}
