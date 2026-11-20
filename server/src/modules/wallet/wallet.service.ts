import { runInTransaction } from "../../core/database/transaction";
import { DomainError, invalidTransition } from "../../core/errors";
import { AccountRepository } from "./account.repository";
import { HoldRepository } from "./hold.repository";
import { LedgerRepository, type LedgerRefs } from "./ledger.repository";
import { decideRelease, decideSettle, escrowJournal, holdJournal } from "./ledger.rules";
import type { Hold } from "./wallet.types";

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
    const current = await findHoldOrFail(holdId);
    const decision = decideRelease(current);

    // compare-and-set: se outra chamada liberou antes, esta perde
    const released = await holds.markReleased(current.id, current.status);
    if (!released) throw invalidTransition("hold", current.status, "RELEASED");

    const account = decision.refund
      ? await accounts.creditAvailable(current.userId, current.amountCents)
      : await accounts.moveHeldToAvailable(current.userId, current.amountCents);

    // a retenção existe, então a carteira e o retido também deveriam existir
    if (!account) throw new Error(`Carteira de ${current.userId} não confere com a retenção ${current.id}`);

    await ledger.append(decision.journal, refsOf(current));
  });
}

// ACTIVE -> IN_ESCROW: o valor sai do retido de quem pagou e fica guardado até o negócio terminar
export async function moveToEscrow(input: { holdId: string; dealId: string; beneficiaryId: string }): Promise<void> {
  await runInTransaction(async () => {
    const current = await findHoldOrFail(input.holdId);
    const journal = escrowJournal(current);

    const moved = await holds.markInEscrow(current.id, input.dealId, input.beneficiaryId);
    if (!moved) throw invalidTransition("hold", current.status, "IN_ESCROW");

    const account = await accounts.removeHeld(current.userId, current.amountCents);
    if (!account) throw new Error(`Carteira de ${current.userId} não confere com a retenção ${current.id}`);

    await ledger.append(journal, refsOf(moved));
  });
}

// IN_ESCROW -> SETTLED: o valor sai do escrow para o disponível do beneficiário (cria a carteira se faltar)
export async function settle(holdId: string): Promise<void> {
  await runInTransaction(async () => {
    const current = await findHoldOrFail(holdId);
    const decision = decideSettle(current);

    const settled = await holds.markSettled(current.id);
    if (!settled) throw invalidTransition("hold", current.status, "SETTLED");

    await accounts.creditAvailableCreating(decision.beneficiaryId, current.amountCents);
    await ledger.append(decision.journal, refsOf(current));
  });
}

async function findHoldOrFail(holdId: string): Promise<Hold> {
  const found = await holds.findById(holdId);
  if (!found) throw new DomainError("not_found", "hold_not_found", "Retenção não encontrada", { holdId });

  return found;
}

// referências gravadas em cada linha do ledger, para o extrato saber de onde veio o dinheiro
function refsOf(current: Hold): LedgerRefs {
  return {
    holdId: current.id,
    proposalId: current.reason.type === "PROPOSAL" ? current.reason.refId : undefined,
    dealId: current.dealId,
  };
}
