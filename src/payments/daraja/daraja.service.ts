import { Inject, Injectable, InternalServerErrorException, Logger, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CreateStkDto } from '../dto/stk.dto';
import { normalizePhone } from '../../common/utils/phone.util';

export interface StkResponse {
    MerchantRequestID: string;
    CheckoutRequestID: string;
    ResponseCode: string;
    ResponseDescription: string;
    CustomerMessage: string;
}

export interface MerchantCredentials {
    consumerKey: string;
    consumerSecret: string;
    shortcode: string;
    passkey: string;
}

const TOKEN_CACHE_KEY = 'daraja:access_token';

@Injectable()
export class DarajaService {
    private readonly logger = new Logger(DarajaService.name);
    constructor(
        @Inject(REDIS_CLIENT) 
        private readonly redis: Redis,
        private readonly config: ConfigService,
    ) {}

    async getAccessToken(credentials?: MerchantCredentials) {
        const tokenUrl = this.config.get('MPESA_TOKEN_URL');
        const consumer = credentials?.consumerKey ?? this.config.get('CONSUMER_KEY');
        const secret = credentials?.consumerSecret ?? this.config.get('CONSUMER_SECRET');

        if(!tokenUrl || !consumer || !secret) {
            throw new InternalServerErrorException('Missing tokenUrl or consumer key or consumer secret in your environment variables');
        }

        try {
            const cached = await this.redis.get(TOKEN_CACHE_KEY);
            if(cached) return cached;
        } catch (error) {
            this.logger.warn(`Redis unavailable for token cache, fetching fresh: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        const auth = Buffer.from(`${consumer}:${secret}`).toString('base64');

        try {
            const result = await axios.get<{ access_token: string, expires_in: string}>(tokenUrl, {
                headers: {
                    Authorization: `Basic ${auth}`,
                }
            });

            const token = result.data.access_token;
            const expiresIn = Number(result.data.expires_in);

            try {
                await this.redis.set(TOKEN_CACHE_KEY, token, 'EX', expiresIn - 60);
            } catch (error) {
                this.logger.warn(`Failed to cache token in Redis: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
            return token;
        } catch (error) {
            throw new ServiceUnavailableException('Failed to retrieve M-Pesa access token');
        }
    }

    async validateCredentials(credentials: MerchantCredentials) {
        const tokenUrl = this.config.get('MPESA_TOKEN_URL');
        if (!tokenUrl) {
            throw new InternalServerErrorException('Missing M-Pesa token URL');
        }

        try {
            await axios.get(tokenUrl, {
                headers: {
                    Authorization: `Basic ${Buffer.from(`${credentials.consumerKey}:${credentials.consumerSecret}`).toString('base64')}`,
                },
            });
            return { valid: true };
        } catch {
            return { valid: false, message: 'Invalid Daraja credentials' };
        }
    }

    generateTimestamp() {
        const d = new Date();
        return (
            d.getFullYear() +
            String(d.getMonth() + 1).padStart(2, '0') +
            String(d.getDate()).padStart(2, '0') +
            String(d.getHours()).padStart(2, '0') +
            String(d.getMinutes()).padStart(2, '0') +
            String(d.getSeconds()).padStart(2, '0')
        );
    }

    generatePassword(shortcode?: string, passkey?: string) {
        const shortCode = shortcode ?? this.config.get('SHORT_CODE');
        const configuredPasskey = passkey ?? this.config.get('PASSKEY');

        if(!shortCode || !configuredPasskey) {
            throw new InternalServerErrorException('Missing shortCode or passkey in your environment variables');
        }

        const timestamp = this.generateTimestamp();
        const password = Buffer.from(`${shortCode}${configuredPasskey}${timestamp}`).toString('base64');

        return password;
    }

    async triggerStk(dto: CreateStkDto, credentials?: MerchantCredentials): Promise <StkResponse> {
        const stkPushUrl = this.config.get('STK_PUSH_URL');
        const shortCode = credentials?.shortcode ?? this.config.get('SHORT_CODE');
        const callback = this.config.get('MPESA_CALLBACK_URL');

        if(!stkPushUrl || !shortCode || !callback) {
            throw new InternalServerErrorException('Missing stkPushUrl or shortCode or callback from the environment variables');
        }

        const token = await this.getAccessToken(credentials);
        const timestamp = this.generateTimestamp();
        const password = this.generatePassword(shortCode, credentials?.passkey);

        const normalizedPhone = normalizePhone(dto.phone);
        const payload = {
            BusinessShortCode: shortCode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerPayBillOnline',
            Amount: dto.amount.toString(),
            PartyA: normalizedPhone,
            PartyB: shortCode,
            PhoneNumber: normalizedPhone,
            CallBackURL: callback,
            AccountReference: dto.accountReference,
            TransactionDesc: dto.transactionDec,
        };

        try {
            const result = await axios.post<StkResponse>(stkPushUrl, payload, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            return result.data;
        } catch (error) {
            throw new ServiceUnavailableException('Failed to trigger STK push');
        }
    }

}
