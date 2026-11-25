// regras puras recebem fatos e devolvem a decisão, sem acesso externo

// RN-01: quantos pontos de reputação cada evento da a cada parte do negócio.
const REPUTATION_BY_EVENT: ReadonlyMap<string, number> = new Map([["DEAL_COMPLETED", 5]]);

export function reputationDelta(eventType: string): number {
  return REPUTATION_BY_EVENT.get(eventType) ?? 0;
}
