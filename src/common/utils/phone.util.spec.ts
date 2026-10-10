import { normalizePhone } from './phone.util';

describe('normalizePhone', () => {
  it.each([
    ['9876543210', '919876543210'],
    ['98765 43210', '919876543210'],
    ['098765-43210', '919876543210'],
    ['+91 98765 43210', '919876543210'],
    ['919876543210', '919876543210'],
    ['0091 9876543210', '919876543210'],
    ['+1 (415) 555-0100', '14155550100'],
    ['+44 20 7946 0958', '442079460958'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', '   ', '12345', 'call me', '98765x43210', '+0 98765 43210', '1234567890123456'])(
    'rejects %p',
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );

  it('rejects non-strings', () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(9876543210)).toBeNull();
  });
});
