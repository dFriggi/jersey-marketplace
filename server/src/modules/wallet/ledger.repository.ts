import { Types } from "mongoose";
import { BaseRepository, type DatabaseDoc } from "../../core/repository/base.repository";
import { LedgerEntryModel, type LedgerEntryDoc } from "./ledger-entry.model";
import type { Journal } from "./wallet.types";

export interface LedgerEntry {
  id: string;
  journalId: string;
  account: string;
  amountCents: number;
  type: LedgerEntryDoc["type"];
  createdAt: Date;
}

// a que o lançamento se refere, com ids em texto
export interface LedgerRefs {
  holdId?: string;
  proposalId?: string;
  dealId?: string;
}

// o ledger é imutável: este repository só acrescenta linhas, não tem método para mudar ou apagar
export class LedgerRepository extends BaseRepository<LedgerEntryDoc, LedgerEntry> {
  constructor() {
    super(LedgerEntryModel);
  }

  protected toEntity(doc: DatabaseDoc<LedgerEntryDoc>): LedgerEntry {
    return {
      id: String(doc._id),
      journalId: String(doc.journalId),
      account: doc.account,
      amountCents: doc.amountCents,
      type: doc.type,
      createdAt: doc.createdAt,
    };
  }

  // grava todas as linhas do lançamento com o mesmo journalId
  async append(journal: Journal, refs: LedgerRefs): Promise<void> {
    const journalId = new Types.ObjectId();
    const objectRefs = {
      holdId: toObjectId(refs.holdId),
      proposalId: toObjectId(refs.proposalId),
      dealId: toObjectId(refs.dealId),
    };

    for (const line of journal.lines) {
      await this.insert({
        journalId,
        account: line.account,
        amountCents: line.amountCents,
        type: journal.type,
        refs: objectRefs,
      });
    }
  }
}

function toObjectId(id: string | undefined): Types.ObjectId | undefined {
  return id === undefined ? undefined : new Types.ObjectId(id);
}
