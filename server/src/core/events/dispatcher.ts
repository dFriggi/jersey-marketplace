import { clock } from "../clock";
import { currentSession } from "../database/context";
import { runInTransaction } from "../database/transaction";
import { DomainEventModel } from "./domain-event.model";

export interface StoredEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

export type EventHandler = (event: StoredEvent) => Promise<void>;

interface Subscription {
  name: string;
  handle: EventHandler;
}

//tipo do evento -> handlers inscritos, na ordem em que se inscreveram
const subscriptions = new Map<string, Subscription[]>();

/*inscreve um handler num tipo de evento (tipo um observer). 
o name precisa ser único dentro do tipo (padrão "modulo.acao")*/
export function subscribe(type: string, name: string, handle: EventHandler): void {
  const list = subscriptions.get(type) ?? [];

  if (list.some((subscription) => subscription.name === name)) {
    throw new Error(`Handler "${name}" já inscrito em ${type}`);
  }

  subscriptions.set(type, [...list, { name, handle }]);
}

export function getSubscriptions(type: string): readonly Subscription[] {
  return subscriptions.get(type) ?? [];
}

// para testes
export function clearSubscriptions(): void {
  subscriptions.clear();
}

/*entrega os eventos pendentes aos handlers inscritos, do mais antigo para o mais novo.
em uma ÚNICA transação, para cada handler, marca que ele tratou o evento (handledBy) e roda o handler. ou as duas coisas acontecem, ou nenhuma.
um handler que sempre falha impede os seguintes do mesmo evento.*/
export async function dispatchPendingEvents(
  options: { limit?: number; maxAttempts?: number } = {}
): Promise<{ processed: number; failed: number }> {
  const { limit = 50, maxAttempts = 5 } = options;

  const events = await DomainEventModel.find({ status: "PENDING" }).sort({ occurredAt: 1 }).limit(limit).lean();

  let processed = 0;
  let failed = 0;

  for (const event of events) {
    const stored: StoredEvent = {
      id: String(event._id),
      type: event.type,
      payload: event.payload,
      occurredAt: event.occurredAt,
    };

    try {
      for (const subscription of getSubscriptions(event.type)) {
        if (event.handledBy.includes(subscription.name)) continue;

        await runInTransaction(async () => {
          const claim = await DomainEventModel.updateOne(
            { _id: event._id },
            { $addToSet: { handledBy: subscription.name } },
            { session: currentSession() }
          );
          if (claim.modifiedCount === 0) return;

          await subscription.handle(stored);
        });
      }

      await DomainEventModel.updateOne({ _id: event._id }, { $set: { status: "PROCESSED", processedAt: clock.now() } });
      processed++;
    } catch (error) {
      const attempts = event.attempts + 1;

      await DomainEventModel.updateOne(
        { _id: event._id },
        {
          $set: {
            attempts,
            lastError: error instanceof Error ? error.message : String(error),
            status: attempts >= maxAttempts ? "FAILED" : "PENDING",
          },
        }
      );
      failed++;
    }
  }

  return { processed, failed };
}
