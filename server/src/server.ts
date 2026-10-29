import { createApp } from "./app";
import { loadConfig } from "./core/config";
import { connectDatabase, disconnectDatabase } from "./core/database/connection";
import { syncIndexes } from "./core/database/sync-indexes";

// models precisam ser importados aqui para o syncIndexes criar os indices deles
import "./core/events/domain-event.model";

const config = loadConfig();

await connectDatabase(config.MONGO_URI);
await syncIndexes();

const server = createApp().listen(config.PORT, () => {
  console.log(`API rodando em http://localhost:${config.PORT}`);
});

async function shutdown() {
  server.close();
  await disconnectDatabase();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
