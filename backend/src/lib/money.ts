export function centsToReais(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function reaisToCents(value: string | number): number {
  if (typeof value === 'number') {
    return Math.round(value * 100);
  }
  const trimmed = value.trim();
  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed;
  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed)) {
    throw new Error(`Valor monetário inválido: ${value}`);
  }
  return Math.round(parsed * 100);
}

/** Preço por jogador em REAIS (total em centavos ÷ jogadores), 2 casas. */
export function perPlayerPrice(totalCents: number, players: number): number {
  if (players <= 0) return 0;
  const perPlayerCents = Math.round(totalCents / players);
  return perPlayerCents / 100;
}

/** Formata para exibição: R$ 13,33 */
export function formatBRL(cents: number): string {
  return `R$ ${centsToReais(cents).replace('.', ',')}`;
}
