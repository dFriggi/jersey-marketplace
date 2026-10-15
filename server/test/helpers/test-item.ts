import { model, models, Schema, type Model } from "mongoose";

//model usado somente nos testes para provar o comportamento do core
export interface TestItemDoc {
  code: string;
  open: boolean;
  state: "FREE" | "RESERVED";
  version: number;
}

const TestItemSchema = new Schema<TestItemDoc>(
  {
    code: { type: String, required: true },
    open: { type: Boolean, default: true },
    state: { type: String, enum: ["FREE", "RESERVED"], default: "FREE" },
    version: { type: Number, default: 0 },
  },
  { collection: "test_items", versionKey: false }
);

// indice unico parcial
TestItemSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { open: true } });

export const TestItemModel: Model<TestItemDoc> =
  (models.TestItem as Model<TestItemDoc>) ?? model<TestItemDoc>("TestItem", TestItemSchema);
