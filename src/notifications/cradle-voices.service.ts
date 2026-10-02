import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface CradleSmsResponse {
    [key: string]: unknown;
}

@Injectable()
export class CradleVoicesService {
    constructor(private readonly config: ConfigService) {}

    async sendSms(message: string, phoneNumbers: string[]): Promise<CradleSmsResponse> {
        const url = this.config.get<string>('CRADLE_URL');
        const token = this.config.get<string>('CRADLE_TOKEN');

        if (!url || !token) {
            throw new InternalServerErrorException('Cradle Voices SMS configuration is incomplete');
        }

        const response = await axios.post<CradleSmsResponse>(
            url,
            {
                token,
                message,
                phone: phoneNumbers,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'NiaFlow-billing-Engine/1.0', // Custom User-Agent to pass security rules
                },
            },
        );

        return response.data;
    }
}
