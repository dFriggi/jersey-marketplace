import mongoose, { model, Schema, type Model, type Types } from "mongoose";

// um desejo descreve a camisa que o usuário procura; os critérios em branco valem "qualquer um"
export interface WishDoc {
  userId: Types.ObjectId;
  team?: string;
  country?: string;
  league?: string;
  // mesmo formato do season da camisa (ex.: "2005")
  seasonFrom?: string;
  seasonTo?: string;
  size?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WishSchema = new Schema<WishDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    team: String,
    country: String,
    league: String,
    seasonFrom: String,
    seasonTo: String,
    size: String,
  },
  { collection: "wishes", timestamps: true, versionKey: false }
);

// lista de desejos de um usuário, mais novos primeiro
WishSchema.index({ userId: 1, createdAt: -1 });

export const WishModel: Model<WishDoc> = (mongoose.models.Wish as Model<WishDoc>) ?? model<WishDoc>("Wish", WishSchema);
