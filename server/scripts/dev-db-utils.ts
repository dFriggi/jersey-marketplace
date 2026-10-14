import { MongoClient } from "mongodb";

export const DEV_DB_PORT = 27017;

const ADMIN_URI = `mongodb://127.0.0.1:${DEV_DB_PORT}/?directConnection=true`;

export async function isDevDbRunning(): Promise<boolean> {
  const client = new MongoClient(ADMIN_URI, { serverSelectionTimeoutMS: 1000 });
  try {
    await client.db("admin").command({ ping: 1 });
    return true;
  } catch {
    return false;
  } finally {
    await client.close().catch(() => {});
  }
}

export async function shutdownDevDb(): Promise<void> {
  const client = new MongoClient(ADMIN_URI, { serverSelectionTimeoutMS: 1000 });
  try {
    await client.db("admin").command({ shutdown: 1, force: true });
  } catch {
    // servidor fecha a conexão ao desligar, espera um erro
  } finally {
    await client.close().catch(() => {});
  }
}
