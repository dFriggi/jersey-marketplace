import mongoose, { model, Schema, type Model, type Types } from "mongoose";
import { PROPOSAL_STATUSES, PROPOSAL_TYPES, type ProposalStatus, type ProposalType } from "./proposal.types";

export interface ProposalDoc {
  type: ProposalType;
  authorId: Types.ObjectId;
  recipientId: Types.ObjectId;
  offeredShirtIds: Types.ObjectId[];
  requestedShirtIds: Types.ObjectId[];
  // ids pedidos, ordenados e concatenados; calculado nas regras, usado no índice único
  requestedKey: string;
  listingId?: Types.ObjectId;
  amountCents?: number;
  holdId?: Types.ObjectId;
  status: ProposalStatus;
  expiresAt: Date;
  dealId?: Types.ObjectId;
  closedAt?: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const ProposalSchema = new Schema<ProposalDoc>(
  {
    type: { type: String, enum: PROPOSAL_TYPES, required: true },
    authorId: { type: Schema.Types.ObjectId, required: true },
    recipientId: { type: Schema.Types.ObjectId, required: true },
    offeredShirtIds: { type: [Schema.Types.ObjectId], default: [] },
    requestedShirtIds: {
      type: [Schema.Types.ObjectId],
      validate: { validator: (ids: unknown[]) => ids.length > 0, message: "pedir ao menos uma camisa" },
    },
    requestedKey: { type: String, required: true },
    listingId: Schema.Types.ObjectId,
    // dinheiro sempre em centavos inteiros
    amountCents: {
      type: Number,
      min: 1,
      validate: { validator: Number.isInteger, message: "amountCents deve ser inteiro" },
    },
    holdId: Schema.Types.ObjectId,
    status: { type: String, enum: PROPOSAL_STATUSES, default: "PENDING" },
    expiresAt: { type: Date, required: true },
    dealId: Schema.Types.ObjectId,
    closedAt: Date,
    version: { type: Number, default: 0 },
  },
  { collection: "proposals", timestamps: true, versionKey: false }
);

// o mesmo autor não pode ter duas propostas pendentes pelas mesmas camisas
ProposalSchema.index(
  { authorId: 1, requestedKey: 1 },
  { unique: true, partialFilterExpression: { status: "PENDING" } }
);
// propostas recebidas e enviadas, mais novas primeiro
ProposalSchema.index({ recipientId: 1, status: 1, createdAt: -1 });
ProposalSchema.index({ authorId: 1, status: 1, createdAt: -1 });
// job de expiração: pendentes com prazo vencido
ProposalSchema.index({ status: 1, expiresAt: 1 });

export const ProposalModel: Model<ProposalDoc> =
  (mongoose.models.Proposal as Model<ProposalDoc>) ?? model<ProposalDoc>("Proposal", ProposalSchema);
