import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SetupMpesaDto {
    @ApiProperty({ description: 'Safaricom Daraja consumer key' })
    @IsString()
    @IsNotEmpty()
    consumerKey: string;

    @ApiProperty({ description: 'Safaricom Daraja consumer secret' })
    @IsString()
    @IsNotEmpty()
    consumerSecret: string;

    @ApiProperty({ description: 'Safaricom PayBill shortcode' })
    @IsString()
    @IsNotEmpty()
    shortcode: string;

    @ApiProperty({ description: 'Safaricom Daraja passkey' })
    @IsString()
    @IsNotEmpty()
    passkey: string;
}