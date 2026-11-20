import type { HoldReasonType, HoldStatus } from "./hold.model";
import type { LedgerEntryType } from "./ledger-entry.model";

// a carteira como o wallet enxerga
export interface Account {
  id: string;
  userId: string;
  availableCents: number;
  heldCents: number;
  version: number;
}

// a retenção como o wallet enxerga
export interface Hold {
  id: string;
  userId: string;
  amountCents: number;
  reason: { type: HoldReasonType; refId: string };
  status: HoldStatus;
  dealId?: string;
  beneficiaryId?: string;
  version: number;
}

// uma linha do lançamento: negativo sai da conta, positivo entra
export interface LedgerLine {
  account: string;
  amountCents: number;
}

// um lançamento em partidas dobradas: as linhas somam zero
export interface Journal {
  type: LedgerEntryType;
  lines: LedgerLine[];
}
