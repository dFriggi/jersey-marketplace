import { runInTransaction } from "../../core/database/transaction";
import { DomainError, invalidTransition } from "../../core/errors";
import { AccountRepository } from "./account.repository";
import { HoldRepository } from "./hold.repository";
import { LedgerRepository } from "./ledger.repository";
import { decideRelease, holdJournal } from "./ledger.rules";

const accounts = new AccountRepository();
const holds = new HoldRepository();
const ledger = new LedgerRepository();

export interface HoldInput {
  userId: string;
  amountCents: number;
  reason: { type: "PROPOSAL"; refId: string };
}

// disponível -> retido, com o lançamento HOLD; tudo numa transação (reaproveita a de quem chama)
export async function hold(input: HoldInput): Promise<{ holdId: string }> {
  const journal = holdJournal(input.userId, input.amountCents);

  return runInTransaction(async () => {
    const account = await accounts.moveAvailableToHeld(input.userId, input.amountCents);

    if (!account) {
      throw new DomainError("business_rule", "insufficient_balance", "Saldo insuficiente", {
        amountCents: input.amountCents,
      });
    }

    const created = await holds.create(input);
    await ledger.append(journal, { holdId: created.id, proposalId: input.reason.refId });

    return { holdId: created.id };
  });
}

// ACTIVE -> RELEASED devolve o retido (RELEASE); IN_ESCROW -> RELEASED devolve do escrow (REFUND)
export async function release(holdId: string): Promise<void> {
  await runInTransaction(async () => {
    const current = await holds.findById(holdId);
    if (!current) throw new DomainError("not_found", "hold_not_found", "Retenção não encontrada", { holdId });

    const decision = decideRelease(current);

    // compare-and-set: se outra chamada liberou antes, esta perde
    const released = await holds.markReleased(current.id, current.status);
    if (!released) throw invalidTransition("hold", current.status, "RELEASED");

    const account = decision.refund
      ? await accounts.creditAvailable(current.userId, current.amountCents)
      : await accounts.moveHeldToAvailable(current.userId, current.amountCents);

    // a retenção existe, então a carteira e o retido também deveriam existir
    if (!account) throw new Error(`Carteira de ${current.userId} não confere com a retenção ${current.id}`);

    await ledger.append(decision.journal, {
      holdId: current.id,
      proposalId: current.reason.type === "PROPOSAL" ? current.reason.refId : undefined,
      dealId: current.dealId,
    });
  });
}
