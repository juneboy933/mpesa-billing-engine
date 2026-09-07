import { BadRequestException } from "@nestjs/common";

export const normalizePhone = (phone: string) => {
    // remove all non-digit characters from the phone number
    let normalized = phone.replace(/\D/g, '');

    // if the number starts with 0, remove it and add 254
    if (normalized.startsWith('0')) {
        normalized = '254' + normalized.slice(1);
    }
    if(!/^254[17]\d{8}$/.test(normalized)) {
        throw new BadRequestException(`Invalid phone number format: ${phone}. Expected format: 2547XXXXXXXX or 2541XXXXXXXX`);
    }
    return normalized;
}