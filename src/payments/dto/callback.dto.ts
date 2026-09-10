export interface StkCallbackMetadataItem {
    Name: string;
    Value: string | number;
}

export interface StkCallbackBody {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: StkCallbackMetadataItem[];
      };
    };
  };
}
