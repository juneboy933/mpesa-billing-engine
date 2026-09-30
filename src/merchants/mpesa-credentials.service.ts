import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class MpesaCredentialsService {
    private readonly algorithm = 'aes-256-gcm';

    constructor(private readonly config: ConfigService) {}

    encrypt(value: string) {
        const keyValue = this.config.get<string>('MPESA_CREDENTIAL_ENCRYPTION_KEY');
        if (!keyValue) {
            throw new InternalServerErrorException('Missing MPESA_CREDENTIAL_ENCRYPTION_KEY');
        }

        const key = Buffer.from(keyValue, 'base64');
        if (key.length !== 32) {
            throw new InternalServerErrorException('MPESA_CREDENTIAL_ENCRYPTION_KEY must be a base64 encoded 32-byte key');
        }

        const iv = randomBytes(12);
        const cipher = createCipheriv(this.algorithm, key, iv);
        const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();

        return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
    }

    decrypt(value: string) {
        const keyValue = this.config.get<string>('MPESA_CREDENTIAL_ENCRYPTION_KEY');
        if (!keyValue) {
            throw new InternalServerErrorException('Missing MPESA_CREDENTIAL_ENCRYPTION_KEY');
        }

        const key = Buffer.from(keyValue, 'base64');
        const [ivValue, tagValue, encryptedValue] = value.split('.');
        const decipher = createDecipheriv(this.algorithm, key, Buffer.from(ivValue, 'base64'));
        decipher.setAuthTag(Buffer.from(tagValue, 'base64'));

        return Buffer.concat([
            decipher.update(Buffer.from(encryptedValue, 'base64')),
            decipher.final(),
        ]).toString('utf8');
    }
}