import { AsyncLocalStorage } from "node:async_hooks";
import type { ClientSession } from "mongoose";

// contexto que acompanha uma execução por todo o fluxo a ser executado

export interface ExecutionContext {
  requestId?: string;
  userId?: string;
  session?: ClientSession;
}

const storage = new AsyncLocalStorage<ExecutionContext>();

export function runWithContext<T>(context: ExecutionContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getContext(): ExecutionContext | undefined {
  return storage.getStore();
}

export function currentSession(): ClientSession | undefined {
  return storage.getStore()?.session;
}
