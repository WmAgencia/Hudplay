import { describe, expect, it } from 'vitest';
import { diffMinutes, overlaps } from '../src/modules/matches/pricing.js';

describe('overlaps', () => {
  it('detecta sobreposição parcial', () => {
    expect(overlaps('18:00', '20:00', '19:00', '21:00')).toBe(true);
  });
  it('detecta sobreposição total', () => {
    expect(overlaps('18:00', '20:00', '18:30', '19:00')).toBe(true);
  });
  it('detecta horários idênticos', () => {
    expect(overlaps('18:00', '20:00', '18:00', '20:00')).toBe(true);
  });
  it('não detecta sobreposição em horários consecutivos', () => {
    expect(overlaps('18:00', '20:00', '20:00', '22:00')).toBe(false);
  });
  it('não detecta sobreposição em horários distantes', () => {
    expect(overlaps('08:00', '10:00', '14:00', '16:00')).toBe(false);
  });
});

describe('diffMinutes', () => {
  it('calcula duração em minutos', () => {
    expect(diffMinutes('18:00', '20:00')).toBe(120);
    expect(diffMinutes('18:30', '20:00')).toBe(90);
    expect(diffMinutes('06:00', '23:00')).toBe(1020);
  });
});
