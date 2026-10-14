import { DEV_DB_PORT, isDevDbRunning, shutdownDevDb } from "./dev-db-utils";

if (await isDevDbRunning()) {
  await shutdownDevDb();
  console.log("MongoDB de desenvolvimento desligado, e dados continuam em server/.data/mongo");
} else {
  console.log(`Nenhum banco rodando na porta ${DEV_DB_PORT}.`);
}
