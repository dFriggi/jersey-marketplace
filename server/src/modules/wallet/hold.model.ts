import mongoose, { model, Schema, type Model, type Types } from "mongoose";

export const HOLD_REASON_TYPES = ["PROPOSAL", "BID"] as const;
export type HoldReasonType = (typeof HOLD_REASON_TYPES)[number];

// ACTIVE -> IN_ESCROW -> SETTLED, ou ACTIVE/IN_ESCROW -> RELEASED
export const HOLD_STATUSES = ["ACTIVE", "IN_ESCROW", "RELEASED", "SETTLED"] as const;
export type HoldStatus = (typeof HOLD_STATUSES)[number];

// o que motivou a retenção: uma proposta ou um lance
export interface HoldReason {
  type: HoldReasonType;
  refId: Types.ObjectId;
}

// cada valor bloqueado é um documento; o escrow é a soma dos holds IN_ESCROW
export interface HoldDoc {
  userId: Types.ObjectId;
  amountCents: number;
  reason: HoldReason;
  status: HoldStatus;
  dealId?: Types.ObjectId;
  beneficiaryId?: Types.ObjectId;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

// precisa ser um schema próprio: escrito direto, "reason: { type: ... }" faria o Mongoose
// achar que "type" é o tipo do campo reason, e não um campo chamado type
const HoldReasonSchema = new Schema<HoldReason>(
  {
    type: { type: String, enum: HOLD_REASON_TYPES, required: true },
    refId: { type: Schema.Types.ObjectId, required: true },
  },
  { _id: false }
);

const HoldSchema = new Schema<HoldDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    amountCents: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: "amountCents deve ser inteiro" },
    },
    reason: { type: HoldReasonSchema, required: true },
    status: { type: String, enum: HOLD_STATUSES, default: "ACTIVE" },
    dealId: Schema.Types.ObjectId,
    beneficiaryId: Schema.Types.ObjectId,
    version: { type: Number, default: 0 },
  },
  { collection: "holds", timestamps: true, versionKey: false }
);

// retenções de um usuário por status (ex.: o que está bloqueado agora)
HoldSchema.index({ userId: 1, status: 1 });
// no máximo uma retenção por proposta ou por lance
HoldSchema.index({ "reason.type": 1, "reason.refId": 1 }, { unique: true });

export const HoldModel: Model<HoldDoc> = (mongoose.models.Hold as Model<HoldDoc>) ?? model<HoldDoc>("Hold", HoldSchema);
