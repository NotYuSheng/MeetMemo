import { describe, it, expect } from 'vitest';
import { formatTime } from './timeFormat';

describe('formatTime', () => {
  it('formats whole minutes and seconds as M:SS', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(600)).toBe('10:00');
    expect(formatTime(3661)).toBe('61:01');
  });

  it('floors fractional seconds', () => {
    expect(formatTime(59.9)).toBe('0:59');
    expect(formatTime(90.4)).toBe('1:30');
  });

  it('returns 0:00 for non-finite or nullish input', () => {
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(Infinity)).toBe('0:00');
    expect(formatTime(null)).toBe('0:00');
    expect(formatTime(undefined)).toBe('0:00');
  });
});
