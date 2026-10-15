import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, inject } from "vitest";
import { resetClock } from "../../src/core/clock";
import { connectDatabase, disconnectDatabase } from "../../src/core/database/connection";

// liga um banco exclusivo para o arquivo de teste

export function useTestDatabase() {
  // conecta num banco com nome aleatório
  beforeAll(async () => {
    await connectDatabase(inject("mongoUri"), { dbName: `test_${randomUUID().slice(0, 8)}` });
  });

  // limpa todas as collections depois de cada teste
  afterEach(async () => {
    resetClock();
    const collections = Object.values(mongoose.connection.collections);
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
  });

  // apaga o banco no fim.
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDatabase();
  });
}
