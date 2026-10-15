import mongoose from "mongoose";

// para cada model, cria as collections (se não houver) e sincroniza os índices
export async function syncIndexes(): Promise<void> {
  for (const model of Object.values(mongoose.models)) {
    await model.createCollection();
    await model.syncIndexes();
  }
}
