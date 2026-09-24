import { BadRequestException } from '@nestjs/common';

export const normalizePhone = (phone: string) => {
  let normalized = phone.trim().replace(/\D/g, '');

  if (normalized.startsWith('0')) {
    normalized = '254' + normalized.slice(1);
  } else if (normalized.startsWith('+254')) {
    normalized = normalized.slice(1);
  } else if (/^[17]\d{8}$/.test(normalized)) {
    normalized = '254' + normalized;
  }

  if (!/^254[17]\d{8}$/.test(normalized)) {
    throw new BadRequestException(
      `Invalid phone number format: ${phone}. Expected format: 2547XXXXXXXX or 2541XXXXXXXX`,
    );
  }

  return normalized;
};