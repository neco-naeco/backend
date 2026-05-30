import { toSeoulIso } from './date.util';

describe('toSeoulIso', () => {
  it('serializes with a dot fractional separator for ISO 8601 compliance', () => {
    expect(toSeoulIso(new Date('2026-05-28T12:36:30.168Z'))).toBe(
      '2026-05-28T21:36:30.168+09:00',
    );
  });
});
