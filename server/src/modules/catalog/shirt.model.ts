import mongoose, { model, Schema, type Model, type Types } from "mongoose";

export const SHIRT_KINDS = ["HOME", "AWAY", "THIRD", "GOALKEEPER", "TRAINING"] as const;
export type ShirtKind = (typeof SHIRT_KINDS)[number];

export const SHIRT_EDITIONS = ["PLAYER", "FAN"] as const;
export type ShirtEdition = (typeof SHIRT_EDITIONS)[number];

// disponibilidade física da camisa: é aqui que fica a trava de concorrência (compare-and-set)
export const SHIRT_STATES = ["FREE", "RESERVED", "IN_AUCTION"] as const;
export type ShirtState = (typeof SHIRT_STATES)[number];

export const OWNERSHIP_VIAS = ["REGISTERED", "PURCHASE", "TRADE", "AUCTION"] as const;
export type OwnershipVia = (typeof OWNERSHIP_VIAS)[number];

// uma entrada por dono que a camisa já teve: é a procedência
export interface OwnerHistoryEntry {
  userId: Types.ObjectId;
  acquiredAt: Date;
  via: OwnershipVia;
  dealId?: Types.ObjectId;
}

// a camisa é o objeto físico do acervo; vive anos e passa de dono em dono
export interface ShirtDoc {
  ownerId: Types.ObjectId;
  team: string;
  country: string;
  league: string;
  season: string;
  kind: ShirtKind;
  edition: ShirtEdition;
  size: string;
  condition: string;
  description?: string;
  photos: string[];
  openToTrade: boolean;
  state: ShirtState;
  activeListingId?: Types.ObjectId;
  ownerHistory: OwnerHistoryEntry[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const OwnerHistorySchema = new Schema<OwnerHistoryEntry>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    acquiredAt: { type: Date, required: true },
    via: { type: String, enum: OWNERSHIP_VIAS, required: true },
    dealId: Schema.Types.ObjectId,
  },
  { _id: false }
);

const ShirtSchema = new Schema<ShirtDoc>(
  {
    ownerId: { type: Schema.Types.ObjectId, required: true },
    team: { type: String, required: true },
    country: { type: String, required: true },
    league: { type: String, required: true },
    season: { type: String, required: true },
    kind: { type: String, enum: SHIRT_KINDS, required: true },
    edition: { type: String, enum: SHIRT_EDITIONS, required: true },
    size: { type: String, required: true },
    condition: { type: String, required: true },
    description: String,
    photos: { type: [String], default: [] },
    // definido pelo dono no cadastro, por isso sem default
    openToTrade: { type: Boolean, required: true },
    state: { type: String, enum: SHIRT_STATES, default: "FREE" },
    activeListingId: Schema.Types.ObjectId,
    ownerHistory: { type: [OwnerHistorySchema], default: [] },
    version: { type: Number, default: 0 },
  },
  { collection: "shirts", timestamps: true, versionKey: false }
);

// acervo de um usuário
ShirtSchema.index({ ownerId: 1 });
// busca de camisas abertas para troca
ShirtSchema.index({ openToTrade: 1, state: 1, team: 1, size: 1 });

export const ShirtModel: Model<ShirtDoc> =
  (mongoose.models.Shirt as Model<ShirtDoc>) ?? model<ShirtDoc>("Shirt", ShirtSchema);
