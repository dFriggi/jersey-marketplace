import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { DEV_DB_PORT, isDevDbRunning } from "./dev-db-utils";

/*
 * npm run db (rode no terminal. Pare com Ctrl+C)
 * npm run db:stop (encerra um banco que ficou rodando em segundo plano)
 */

if (await isDevDbRunning()) {
  console.log(`MongoDB já está rodando na porta ${DEV_DB_PORT}`);
  console.log("Para desligar: npm run db:stop");
  process.exit(0);
}

const dbPath = resolve(import.meta.dirname, "..", ".data", "mongo");
mkdirSync(dbPath, { recursive: true });

const replSet = await MongoMemoryReplSet.create({
  replSet: { name: "rs0", count: 1, storageEngine: "wiredTiger" },
  instanceOpts: [{ port: DEV_DB_PORT, dbPath }],
});

console.log("MongoDB (replica set rs0) rodando");
console.log(`URI: ${replSet.getUri("jersey")}`);
console.log("pare com Ctrl+C. Dados ficam em server/.data/mongo");

async function stop() {
  // doCleanup:false para manter a pasta de dados ao parar.
  await replSet.stop({ doCleanup: false });
  process.exit(0);
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
