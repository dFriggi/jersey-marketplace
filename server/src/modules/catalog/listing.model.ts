import mongoose, { model, Schema, type Model, type Types } from "mongoose";

export const LISTING_TYPES = ["SALE", "AUCTION"] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const LISTING_STATUSES = ["ACTIVE", "RESERVED", "CLOSED", "WITHDRAWN"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const LISTING_OUTCOMES = ["SOLD", "AUCTIONED"] as const;
export type ListingOutcome = (typeof LISTING_OUTCOMES)[number];

// como a camisa estava no momento do anúncio
export interface ListingSnapshot {
  condition: string;
  photos: string[];
  description?: string;
}

// o anúncio é um episódio de venda ou leilão na vida da camisa
export interface ListingDoc {
  shirtId: Types.ObjectId;
  sellerId: Types.ObjectId;
  type: ListingType;
  priceCents?: number;
  snapshot: ListingSnapshot;
  status: ListingStatus;
  // true em ACTIVE e RESERVED: é o que o índice único parcial usa
  open: boolean;
  outcome?: ListingOutcome;
  closedByDealId?: Types.ObjectId;
  closedAt?: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const ListingSnapshotSchema = new Schema<ListingSnapshot>(
  {
    condition: { type: String, required: true },
    photos: { type: [String], default: [] },
    description: String,
  },
  { _id: false }
);

const ListingSchema = new Schema<ListingDoc>(
  {
    shirtId: { type: Schema.Types.ObjectId, required: true },
    sellerId: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, enum: LISTING_TYPES, required: true },
    // dinheiro sempre em centavos inteiros
    priceCents: {
      type: Number,
      min: 0,
      validate: { validator: Number.isInteger, message: "priceCents deve ser inteiro" },
    },
    snapshot: { type: ListingSnapshotSchema, required: true },
    status: { type: String, enum: LISTING_STATUSES, default: "ACTIVE" },
    open: { type: Boolean, default: true },
    outcome: { type: String, enum: LISTING_OUTCOMES },
    closedByDealId: Schema.Types.ObjectId,
    closedAt: Date,
    version: { type: Number, default: 0 },
  },
  { collection: "listings", timestamps: true, versionKey: false }
);

// no máximo um anúncio aberto por camisa
ListingSchema.index({ shirtId: 1 }, { unique: true, partialFilterExpression: { open: true } });
// vitrine: anúncios por status e tipo, mais novos primeiro
ListingSchema.index({ status: 1, type: 1, createdAt: -1 });
// histórico de anúncios de uma camisa (procedência)
ListingSchema.index({ shirtId: 1, createdAt: -1 });

export const ListingModel: Model<ListingDoc> =
  (mongoose.models.Listing as Model<ListingDoc>) ?? model<ListingDoc>("Listing", ListingSchema);
