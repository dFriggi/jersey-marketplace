import mongoose from "mongoose";
import { currentSession, getContext, runWithContext } from "./context";

// executa fn dentro de uma transação. Ou tudo acontece ou nada acontece

export async function runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (currentSession()?.inTransaction()) {
    return fn();
  }

  const session = await mongoose.startSession();

  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await runWithContext({ ...getContext(), session }, fn);
    });
    return result!;
  } finally {
    await session.endSession();
  }
}
