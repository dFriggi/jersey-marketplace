import mongoose, { model, Schema, type Model, type Types } from "mongoose";

// saldo materializado do usuário; cada mudança também vira linhas no ledger_entries
export interface AccountDoc {
  userId: Types.ObjectId;
  // livre para usar em propostas e lances
  availableCents: number;
  // bloqueado em propostas pendentes e no escrow
  heldCents: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

// saldo em centavos inteiros, nunca negativo
function nonNegativeCents() {
  return {
    type: Number,
    default: 0,
    min: 0,
    validate: { validator: Number.isInteger, message: "o valor deve ser em centavos inteiros" },
  };
}

const AccountSchema = new Schema<AccountDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    availableCents: nonNegativeCents(),
    heldCents: nonNegativeCents(),
    version: { type: Number, default: 0 },
  },
  { collection: "accounts", timestamps: true, versionKey: false }
);

// uma carteira por usuário
AccountSchema.index({ userId: 1 }, { unique: true });

export const AccountModel: Model<AccountDoc> =
  (mongoose.models.Account as Model<AccountDoc>) ?? model<AccountDoc>("Account", AccountSchema);
