import { Inject, Injectable, InternalServerErrorException, Logger, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHash } from 'crypto';
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

export class StkPushOutcomeUnknownError extends Error {
    constructor() {
        super('Daraja did not confirm whether the STK request was accepted');
        this.name = 'StkPushOutcomeUnknownError';
    }
}

export class StkPushRejectedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StkPushRejectedError';
    }
}

const TOKEN_CACHE_PREFIX = 'daraja:access_token';

@Injectable()
export class DarajaService {
    private readonly logger = new Logger(DarajaService.name);
    constructor(
        @Inject(REDIS_CLIENT) 
        private readonly redis: Redis,
        private readonly config: ConfigService,
    ) {}

    private localCredentials(): MerchantCredentials {
        const nodeEnv = this.config.get<string>('NODE_ENV');
        if (nodeEnv !== 'development' && nodeEnv !== 'test') {
            throw new InternalServerErrorException('Merchant M-Pesa credentials are required outside local development and tests');
        }

        const consumerKey = this.config.get<string>('CONSUMER_KEY');
        const consumerSecret = this.config.get<string>('CONSUMER_SECRET');
        const shortcode = this.config.get<string>('SHORT_CODE');
        const passkey = this.config.get<string>('PASSKEY');
        if (!consumerKey || !consumerSecret || !shortcode || !passkey) {
            throw new InternalServerErrorException('Local Daraja test credentials are incomplete');
        }

        return { consumerKey, consumerSecret, shortcode, passkey };
    }

    private tokenCacheKey(tokenUrl: string, consumerKey: string, consumerSecret: string) {
        const fingerprint = createHash('sha256')
            .update(tokenUrl)
            .update('\0')
            .update(consumerKey)
            .update('\0')
            .update(consumerSecret)
            .digest('hex');
        return `${TOKEN_CACHE_PREFIX}:${fingerprint}`;
    }

    async getAccessToken(credentials?: MerchantCredentials) {
        const tokenUrl = this.config.get('MPESA_TOKEN_URL');
        if (!tokenUrl) {
            throw new InternalServerErrorException('Missing M-Pesa token URL');
        }

        const resolvedCredentials = credentials ?? this.localCredentials();
        const consumer = resolvedCredentials.consumerKey;
        const secret = resolvedCredentials.consumerSecret;

        if (!consumer || !secret) {
            throw new InternalServerErrorException('M-Pesa consumer key and secret are required');
        }

        const cacheKey = this.tokenCacheKey(tokenUrl, consumer, secret);

        try {
            const cached = await this.redis.get(cacheKey);
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
                await this.redis.set(cacheKey, token, 'EX', Math.max(1, Math.floor(expiresIn - 60)));
            } catch (error) {
                this.logger.warn(`Failed to cache token in Redis: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
            return token;
        } catch {
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
        const local = shortcode && passkey ? undefined : this.localCredentials();
        const shortCode = shortcode ?? local?.shortcode;
        const configuredPasskey = passkey ?? local?.passkey;

        if(!shortCode || !configuredPasskey) {
            throw new InternalServerErrorException('Missing shortCode or passkey in your environment variables');
        }

        const timestamp = this.generateTimestamp();
        const password = Buffer.from(`${shortCode}${configuredPasskey}${timestamp}`).toString('base64');

        return password;
    }

    async triggerStk(dto: CreateStkDto, credentials?: MerchantCredentials): Promise <StkResponse> {
        const stkPushUrl = this.config.get('STK_PUSH_URL');
        const callback = this.config.get('MPESA_CALLBACK_URL');
        const resolvedCredentials = credentials ?? this.localCredentials();
        const shortCode = resolvedCredentials.shortcode;

        if(!stkPushUrl || !shortCode || !callback) {
            throw new InternalServerErrorException('Missing stkPushUrl or shortCode or callback from the environment variables');
        }

        const token = await this.getAccessToken(resolvedCredentials);
        const timestamp = this.generateTimestamp();
        const password = this.generatePassword(shortCode, resolvedCredentials.passkey);

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
                },
                timeout: 30_000,
            });
            if (result.data.ResponseCode !== '0') {
                throw new StkPushRejectedError(result.data.ResponseDescription || 'Daraja rejected the STK request');
            }
            return result.data;
        } catch (error) {
            if (error instanceof StkPushRejectedError) throw error;
            if (axios.isAxiosError(error) && error.response && error.response.status < 500) {
                throw new StkPushRejectedError('Daraja rejected the STK request');
            }
            throw new StkPushOutcomeUnknownError();
        }
    }

}
