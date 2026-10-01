import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomInt, randomUUID } from 'crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { MerchantsService } from '../merchants/merchants.service';
import { CradleVoicesService } from '../notifications/cradle-voices.service';
import { normalizePhone } from '../common/utils/phone.util';

const OTP_TTL_SECONDS = 5 * 60;
const OTP_REQUEST_WINDOW_SECONDS = 60 * 60;
const SESSION_TTL_SECONDS = 24 * 60 * 60;
const MAX_OTP_REQUESTS_PER_HOUR = 3;

@Injectable()
export class AuthService {
    constructor(
        @Inject(REDIS_CLIENT) private readonly redis: Redis,
        private readonly merchantsService: MerchantsService,
        private readonly cradleVoices: CradleVoicesService,
    ) {}

    hashCode(code: string) {
        return createHash('sha256').update(code).digest('hex');
    }

    async requestOtp(phone: string) {
        const normalizedPhone = normalizePhone(phone);
        const requestCount = await this.redis.incr(`auth:otp-requests:${normalizedPhone}`);

        if (requestCount === 1) {
            await this.redis.expire(`auth:otp-requests:${normalizedPhone}`, OTP_REQUEST_WINDOW_SECONDS);
        }
        if (requestCount > MAX_OTP_REQUESTS_PER_HOUR) {
            throw new BadRequestException('Too many OTP requests. Try again later.');
        }

        const merchant = await this.merchantsService.findByPhoneNumber(normalizedPhone);
        const genericResponse = { message: 'If the number is registered, an OTP has been sent' };
        if (!merchant) {
            return genericResponse;
        }

        const code = randomInt(100000, 1000000).toString();
        await this.redis.set(
            `auth:otp:${normalizedPhone}:current`,
            JSON.stringify({ codeHash: this.hashCode(code), merchantId: merchant.id }),
            'EX',
            OTP_TTL_SECONDS,
        );
        await this.cradleVoices.sendSms(
            `Your NiaFlow verification code is ${code}. It expires in 5 minutes. Do not share this code.`,
            [normalizedPhone],
        );

        return genericResponse;
    }

    async verifyOtp(phone: string, code: string) {
        const normalizedPhone = normalizePhone(phone);
        const otpKey = `auth:otp:${normalizedPhone}:current`;
        const stored = await this.redis.get(otpKey);
        if (!stored) {
            throw new UnauthorizedException('Invalid or expired verification code');
        }

        const otp = JSON.parse(stored) as { codeHash: string; merchantId: string };
        const attemptsKey = `auth:otp-attempts:${normalizedPhone}`;
        const attempts = await this.redis.incr(attemptsKey);
        if (attempts === 1) {
            await this.redis.expire(attemptsKey, OTP_TTL_SECONDS);
        }
        if (attempts > 5) {
            await this.redis.del(otpKey);
            throw new UnauthorizedException('Invalid or expired verification code');
        }

        if (otp.codeHash !== this.hashCode(code)) {
            throw new UnauthorizedException('Invalid or expired verification code');
        }

        const merchant = await this.merchantsService.findByPhoneNumber(normalizedPhone);
        if (!merchant || merchant.id !== otp.merchantId) {
            throw new UnauthorizedException('Invalid or expired verification code');
        }

        await this.redis.del(otpKey);
        const sessionId = randomUUID();
        await this.redis.set(
            `auth:session:${sessionId}`,
            JSON.stringify({ merchantId: merchant.id, createdAt: new Date().toISOString() }),
            'EX',
            SESSION_TTL_SECONDS,
        );

        return { merchantId: merchant.id, sessionId, expiresIn: SESSION_TTL_SECONDS };
    }

    async getSession(sessionId: string) {
        const stored = await this.redis.get(`auth:session:${sessionId}`);
        if (!stored) {
            return null;
        }

        const session = JSON.parse(stored) as { merchantId: string; createdAt: string };
        const merchant = await this.merchantsService.findById(session.merchantId);
        return merchant ? { ...session, merchant } : null;
    }

    async refreshSession(sessionId: string) {
        await this.redis.expire(`auth:session:${sessionId}`, SESSION_TTL_SECONDS);
    }

    async logout(sessionId: string) {
        await this.redis.del(`auth:session:${sessionId}`);
        return { message: 'Logged out' };
    }
}
