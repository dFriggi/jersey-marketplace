import { invalidTransition } from "../../core/errors";
import type { ShirtSummary } from "./catalog.types";

// regras puras do catalog: decidem sem tocar no banco nem no relógio

export interface TransferInput {
  toUserId: string;
  via: "PURCHASE" | "TRADE";
  dealId: string;
}

// a entrada nova da procedência da camisa
export interface OwnerEntry {
  userId: string;
  acquiredAt: Date;
  via: "PURCHASE" | "TRADE";
  dealId: string;
}

// RN-C04: só camisa RESERVED muda de dono; ganha uma entrada na procedência com a data do negócio
export function decideTransfer(shirt: Pick<ShirtSummary, "state">, input: TransferInput, now: Date): OwnerEntry {
  if (shirt.state !== "RESERVED") throw invalidTransition("shirt", shirt.state, "FREE");

  return { userId: input.toUserId, acquiredAt: now, via: input.via, dealId: input.dealId };
}
