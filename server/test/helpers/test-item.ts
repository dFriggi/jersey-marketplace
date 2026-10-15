import { model, models, Schema, type Model } from "mongoose";

//model usado somente nos testes para provar o comportamento do core
export interface TestItemDoc {
  code: string;
}

const TestItemSchema = new Schema<TestItemDoc>(
  { code: { type: String, required: true } },
  { collection: "test_items", versionKey: false }
);

export const TestItemModel: Model<TestItemDoc> =
  (models.TestItem as Model<TestItemDoc>) ?? model<TestItemDoc>("TestItem", TestItemSchema);
