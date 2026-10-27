import { clock } from "../clock";
import { currentSession } from "../database/context";
import { DomainEventModel } from "./domain-event.model";
import type { DomainEvent } from "./types";

//grava os eventos na collection domain_events, dentro da transação da ação que os gerou.

export async function publish(events: readonly DomainEvent[]): Promise<void> {
  if (events.length === 0) return;

  const session = currentSession();
  if (!session?.inTransaction()) {
    throw new Error("publish() precisa rodar dentro de runInTransaction()");
  }

  const occurredAt = clock.now();

  await DomainEventModel.insertMany(
    events.map((event) => ({ type: event.type, payload: event.payload, occurredAt })),
    { session }
  );
}
