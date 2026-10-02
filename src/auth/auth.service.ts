import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { MerchantsService } from '../merchants/merchants.service';
import { normalizePhone } from '../common/utils/phone.util';

const SESSION_TTL_SECONDS = 24 * 60 * 60;
const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_FAILURE_TTL_SECONDS = 15 * 60;
const INVALID_CREDENTIALS = 'Phone number or password is incorrect';

@Injectable()
export class AuthService {
    constructor(
        @Inject(REDIS_CLIENT) private readonly redis: Redis,
        private readonly merchantsService: MerchantsService,
    ) {}

    async signIn(phone: string, password: string) {
        const normalizedPhone = normalizePhone(phone);
        const failuresKey = `auth:password-failures:${normalizedPhone}`;
        const failures = Number(await this.redis.get(failuresKey) ?? 0);
        if (failures >= LOGIN_FAILURE_LIMIT) throw new UnauthorizedException(INVALID_CREDENTIALS);

        const merchant = await this.merchantsService.findForPasswordAuth(normalizedPhone);
        if (!merchant?.passwordHash || !(await argon2.verify(merchant.passwordHash, password))) {
            const count = await this.redis.incr(failuresKey);
            if (count === 1) await this.redis.expire(failuresKey, LOGIN_FAILURE_TTL_SECONDS);
            throw new UnauthorizedException(INVALID_CREDENTIALS);
        }

        await this.redis.del(failuresKey);
        return this.createSession(merchant.id);
    }

    async setPassword(merchantId: string, password: string, currentPassword?: string) {
        const merchant = await this.merchantsService.findForPasswordAuthById(merchantId);
        if (!merchant) throw new UnauthorizedException();
        if (merchant.passwordHash && (!currentPassword || !(await argon2.verify(merchant.passwordHash, currentPassword)))) {
            throw new UnauthorizedException('Current password is incorrect');
        }
        return this.merchantsService.setPassword(merchantId, password);
    }

    private async createSession(merchantId: string) {
        const sessionId = randomUUID();
        await this.redis.set(
            `auth:session:${sessionId}`,
            JSON.stringify({ merchantId, createdAt: new Date().toISOString() }),
            'EX',
            SESSION_TTL_SECONDS,
        );
        return { merchantId, sessionId, expiresIn: SESSION_TTL_SECONDS };
    }

    async getSession(sessionId: string) {
        const stored = await this.redis.get(`auth:session:${sessionId}`);
        if (!stored) return null;
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
