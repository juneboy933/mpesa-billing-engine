import { ApiProperty } from '@nestjs/swagger';

export class StkCallbackMetadataItemDto {
  @ApiProperty({ description: 'Metadata field name', example: 'Amount' })
  Name: string;

  @ApiProperty({ description: 'Metadata field value', example: 5000 })
  Value: string | number;
}

export class StkCallbackMetadataDto {
  @ApiProperty({
    description: 'List of metadata entries returned by Safaricom',
    type: () => [StkCallbackMetadataItemDto],
  })
  Item: StkCallbackMetadataItemDto[];
}

export class StkCallbackResultDto {
  @ApiProperty({ description: 'Merchant request identifier', example: '123456789' })
  MerchantRequestID: string;

  @ApiProperty({ description: 'Checkout request identifier', example: 'ws_CO_1234567890' })
  CheckoutRequestID: string;

  @ApiProperty({ description: 'Result code returned by Safaricom', example: 0 })
  ResultCode: number;

  @ApiProperty({ description: 'Result description returned by Safaricom', example: 'The service request is processed successfully.' })
  ResultDesc: string;

  @ApiProperty({
    description: 'Additional callback metadata returned by Safaricom',
    type: () => StkCallbackMetadataDto,
    required: false,
  })
  CallbackMetadata?: StkCallbackMetadataDto;
}

export class StkCallbackBodyDto {
  @ApiProperty({ type: () => StkCallbackResultDto, description: 'STK callback payload' })
  stkCallback: StkCallbackResultDto;
}

export class StkCallbackEnvelopeDto {
  @ApiProperty({ type: () => StkCallbackBodyDto })
  Body: StkCallbackBodyDto;
}

export type StkCallbackBody = StkCallbackEnvelopeDto;
