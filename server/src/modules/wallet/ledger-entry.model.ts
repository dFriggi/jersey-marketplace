import mongoose, { model, Schema, type Model, type Types } from "mongoose";

export const LEDGER_ENTRY_TYPES = ["DEPOSIT", "HOLD", "RELEASE", "TO_ESCROW", "SETTLE", "REFUND"] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

// conta contábil: "user:<id>:available", "user:<id>:held", "escrow" ou "external"
export const LEDGER_ACCOUNT_PATTERN = /^(user:[a-f0-9]{24}:(available|held)|escrow|external)$/;

// a que a movimentação se refere
export interface LedgerEntryRefs {
  holdId?: Types.ObjectId;
  proposalId?: Types.ObjectId;
  dealId?: Types.ObjectId;
}

// uma linha de um lançamento em partidas dobradas; as linhas do mesmo journalId somam zero
// imutável: não tem updatedAt nem version
export interface LedgerEntryDoc {
  journalId: Types.ObjectId;
  account: string;
  // com sinal: negativo sai da conta, positivo entra
  amountCents: number;
  type: LedgerEntryType;
  refs?: LedgerEntryRefs;
  createdAt: Date;
}

const LedgerEntryRefsSchema = new Schema<LedgerEntryRefs>(
  {
    holdId: Schema.Types.ObjectId,
    proposalId: Schema.Types.ObjectId,
    dealId: Schema.Types.ObjectId,
  },
  { _id: false }
);

const LedgerEntrySchema = new Schema<LedgerEntryDoc>(
  {
    journalId: { type: Schema.Types.ObjectId, required: true },
    account: { type: String, required: true, match: LEDGER_ACCOUNT_PATTERN },
    // só inteiro: negativo é válido, então nada de min
    amountCents: {
      type: Number,
      required: true,
      validate: { validator: Number.isInteger, message: "amountCents deve ser inteiro" },
    },
    type: { type: String, enum: LEDGER_ENTRY_TYPES, required: true },
    refs: LedgerEntryRefsSchema,
  },
  { collection: "ledger_entries", timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

// extrato de uma conta, mais novos primeiro
LedgerEntrySchema.index({ account: 1, createdAt: -1 });
// as linhas de um mesmo lançamento
LedgerEntrySchema.index({ journalId: 1 });

export const LedgerEntryModel: Model<LedgerEntryDoc> =
  (mongoose.models.LedgerEntry as Model<LedgerEntryDoc>) ?? model<LedgerEntryDoc>("LedgerEntry", LedgerEntrySchema);
