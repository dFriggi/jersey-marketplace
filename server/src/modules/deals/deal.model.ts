import mongoose, { model, Schema, type Model, type Types } from "mongoose";
import {
  DEAL_ORIGIN_TYPES,
  DEAL_STATUSES,
  PAYMENT_STATUSES,
  SHIPMENT_STATUSES,
  type DealOriginType,
  type DealStatus,
  type PaymentStatus,
  type ShipmentStatus,
} from "./deal.types";

export interface DealOrigin {
  type: DealOriginType;
  refId: Types.ObjectId;
}

export interface ShipmentItemDoc {
  shirtId: Types.ObjectId;
  team: string;
  season: string;
  size: string;
  condition: string;
}

export interface ShipmentDoc {
  fromUserId: Types.ObjectId;
  toUserId: Types.ObjectId;
  items: ShipmentItemDoc[];
  status: ShipmentStatus;
  trackingCode?: string;
  shippedAt?: Date;
  receivedAt?: Date;
}

export interface DealPaymentDoc {
  payerId: Types.ObjectId;
  payeeId: Types.ObjectId;
  amountCents: number;
  holdId: Types.ObjectId;
  status: PaymentStatus;
}

export interface DealHistoryEntryDoc {
  status: DealStatus;
  at: Date;
}

// o negócio nasce do aceite de uma proposta e acompanha as remessas até concluir
export interface DealDoc {
  origin: DealOrigin;
  partyIds: Types.ObjectId[];
  shirtIds: Types.ObjectId[];
  shipments: ShipmentDoc[];
  payment?: DealPaymentDoc;
  status: DealStatus;
  // true em AWAITING_SHIPMENT e IN_TRANSIT: é o que o índice único parcial usa
  active: boolean;
  shipBy: Date;
  history: DealHistoryEntryDoc[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

// schema próprio pelo mesmo motivo do HoldReason: "type" direto confundiria o Mongoose
const DealOriginSchema = new Schema<DealOrigin>(
  {
    type: { type: String, enum: DEAL_ORIGIN_TYPES, required: true },
    refId: { type: Schema.Types.ObjectId, required: true },
  },
  { _id: false }
);

const ShipmentItemSchema = new Schema<ShipmentItemDoc>(
  {
    shirtId: { type: Schema.Types.ObjectId, required: true },
    team: { type: String, required: true },
    season: { type: String, required: true },
    size: { type: String, required: true },
    condition: { type: String, required: true },
  },
  { _id: false }
);

const ShipmentSchema = new Schema<ShipmentDoc>(
  {
    fromUserId: { type: Schema.Types.ObjectId, required: true },
    toUserId: { type: Schema.Types.ObjectId, required: true },
    items: {
      type: [ShipmentItemSchema],
      validate: { validator: (items: unknown[]) => items.length > 0, message: "remessa sem camisas" },
    },
    status: { type: String, enum: SHIPMENT_STATUSES, default: "PENDING" },
    trackingCode: String,
    shippedAt: Date,
    receivedAt: Date,
  },
  { _id: false }
);

const DealPaymentSchema = new Schema<DealPaymentDoc>(
  {
    payerId: { type: Schema.Types.ObjectId, required: true },
    payeeId: { type: Schema.Types.ObjectId, required: true },
    amountCents: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: "amountCents deve ser inteiro" },
    },
    holdId: { type: Schema.Types.ObjectId, required: true },
    status: { type: String, enum: PAYMENT_STATUSES, default: "IN_ESCROW" },
  },
  { _id: false }
);

const DealHistoryEntrySchema = new Schema<DealHistoryEntryDoc>(
  {
    status: { type: String, enum: DEAL_STATUSES, required: true },
    at: { type: Date, required: true },
  },
  { _id: false }
);

const DealSchema = new Schema<DealDoc>(
  {
    origin: { type: DealOriginSchema, required: true },
    partyIds: { type: [Schema.Types.ObjectId], required: true },
    shirtIds: {
      type: [Schema.Types.ObjectId],
      validate: { validator: (ids: unknown[]) => ids.length > 0, message: "negócio sem camisas" },
    },
    shipments: {
      type: [ShipmentSchema],
      validate: { validator: (shipments: unknown[]) => shipments.length > 0, message: "negócio sem remessas" },
    },
    payment: DealPaymentSchema,
    status: { type: String, enum: DEAL_STATUSES, default: "AWAITING_SHIPMENT" },
    active: { type: Boolean, default: true },
    shipBy: { type: Date, required: true },
    history: { type: [DealHistoryEntrySchema], default: [] },
    version: { type: Number, default: 0 },
  },
  { collection: "deals", timestamps: true, versionKey: false }
);

// uma camisa em no máximo um negócio ativo (o índice vale para cada elemento do array)
DealSchema.index({ shirtIds: 1 }, { unique: true, partialFilterExpression: { active: true } });
// no máximo um negócio por proposta aceita
DealSchema.index({ "origin.type": 1, "origin.refId": 1 }, { unique: true });
// meus negócios, mais novos primeiro
DealSchema.index({ partyIds: 1, createdAt: -1 });

export const DealModel: Model<DealDoc> = (mongoose.models.Deal as Model<DealDoc>) ?? model<DealDoc>("Deal", DealSchema);
