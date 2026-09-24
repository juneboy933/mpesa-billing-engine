import { BadRequestException } from '@nestjs/common';
import { normalizePhone } from './phone.util';

describe('normalizePhone', () => {
  it('normalizes a local Kenyan format with leading zero', () => {
    expect(normalizePhone('0712345678')).toBe('254712345678');
  });

  it('normalizes a local Kenyan format without leading zero', () => {
    expect(normalizePhone('712345678')).toBe('254712345678');
  });

  it('normalizes a full international number already prefixed with 254', () => {
    expect(normalizePhone('+254712345678')).toBe('254712345678');
  });

  it('normalizes a mixed-format input with punctuation and whitespace', () => {
    expect(normalizePhone('(254) 712-345-678')).toBe('254712345678');
  });

  it('throws for garbage input', () => {
    expect(() => normalizePhone('abc')).toThrow(BadRequestException);
  });
});
