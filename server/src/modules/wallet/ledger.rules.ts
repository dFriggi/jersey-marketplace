import { DomainError, invalidTransition } from "../../core/errors";
import { isValidCents, sumCents } from "../../core/money";
import type { Hold, Journal, LedgerLine } from "./wallet.types";

// regras puras da carteira: decidem as linhas de cada lançamento, sem tocar no banco

export const ESCROW_ACCOUNT = "escrow";

export function availableAccount(userId: string): string {
  return `user:${userId}:available`;
}

export function heldAccount(userId: string): string {
  return `user:${userId}:held`;
}

// RN-W01: todo valor movimentado é um inteiro de centavos maior que zero
export function assertValidAmount(amountCents: number): void {
  if (!isValidCents(amountCents) || amountCents === 0) {
    throw new DomainError("validation", "invalid_amount", "O valor deve ser um inteiro de centavos maior que zero", {
      amountCents,
    });
  }
}

// RN-W02: as linhas de um lançamento somam zero (nenhum centavo some ou aparece)
export function balancedJournal(type: Journal["type"], lines: LedgerLine[]): Journal {
  // linhas desbalanceadas são erro de programação, não de quem usa o sistema
  if (sumCents(lines.map((line) => line.amountCents)) !== 0) throw new Error(`Lançamento ${type} não soma zero`);

  return { type, lines };
}

// RN-W03: reter tira do disponível e põe no retido do mesmo usuário
export function holdJournal(userId: string, amountCents: number): Journal {
  assertValidAmount(amountCents);

  return balancedJournal("HOLD", [
    { account: availableAccount(userId), amountCents: -amountCents },
    { account: heldAccount(userId), amountCents },
  ]);
}

export interface ReleaseDecision {
  // true quando o dinheiro já estava no escrow e volta para quem pagou
  refund: boolean;
  journal: Journal;
}

// RN-W04: liberar uma retenção ACTIVE devolve o retido; uma IN_ESCROW devolve do escrow (estorno)
// RN-W05: retenção RELEASED ou SETTLED não pode ser liberada de novo
export function decideRelease(hold: Pick<Hold, "userId" | "amountCents" | "status">): ReleaseDecision {
  if (hold.status === "ACTIVE") {
    return {
      refund: false,
      journal: balancedJournal("RELEASE", [
        { account: heldAccount(hold.userId), amountCents: -hold.amountCents },
        { account: availableAccount(hold.userId), amountCents: hold.amountCents },
      ]),
    };
  }

  if (hold.status === "IN_ESCROW") {
    return {
      refund: true,
      journal: balancedJournal("REFUND", [
        { account: ESCROW_ACCOUNT, amountCents: -hold.amountCents },
        { account: availableAccount(hold.userId), amountCents: hold.amountCents },
      ]),
    };
  }

  throw invalidTransition("hold", hold.status, "RELEASED");
}
