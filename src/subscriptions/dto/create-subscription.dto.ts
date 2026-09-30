import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateSubscriptionDto {
    @ApiProperty({
        description: 'Identifier of the plan to subscribe to',
        example: 'plan_123456',
    })
    @IsString()
    @IsNotEmpty()
    readonly planId: string;

    @ApiProperty({
        description: 'Customer phone number to charge for the subscription',
        example: '+254712345678',
    })
    @IsString()
    @IsNotEmpty()
    readonly customerPhone: string;
}