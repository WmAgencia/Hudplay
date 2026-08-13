import { describe, expect, it } from 'vitest';
import { centsToReais, formatBRL, perPlayerPrice, reaisToCents } from '../src/lib/money.js';

describe('money helpers', () => {
  it('converte centavos para reais', () => {
    expect(centsToReais(12000)).toBe('120.00');
    expect(centsToReais(1333)).toBe('13.33');
    expect(centsToReais(5)).toBe('0.05');
  });

  it('converte reais para centavos (string com vírgula)', () => {
    expect(reaisToCents('13,33')).toBe(1333);
    expect(reaisToCents('120.00')).toBe(12000);
    expect(reaisToCents('0,50')).toBe(50);
  });

  it('calcula preço por jogador sem erro de ponto flutuante', () => {
    // R$240 / 18 = R$13,33
    expect(perPlayerPrice(24000, 18)).toBe(13.33);
    // R$120 / 6 = R$20
    expect(perPlayerPrice(12000, 6)).toBe(20);
  });

  it('arredonda corretamente', () => {
    expect(perPlayerPrice(10000, 3)).toBe(33.33);
  });

  it('formata moeda brasileira', () => {
    expect(formatBRL(1333)).toBe('R$ 13,33');
  });
});
