import mongoose from "mongoose";

export async function connectDatabase(uri: string, options: { dbName?: string } = {}): Promise<typeof mongoose> {
  // autoIndex:false porque o Mongo não cria índice dentro de transação, e criar em segundo plano pode colidir com elas
  return mongoose.connect(uri, { autoIndex: false, ...(options.dbName && { dbName: options.dbName }) });
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
