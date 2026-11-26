import { z } from "zod";
import { subscribe, type StoredEvent } from "../../core/events/dispatcher";
import { UserRepository } from "./user.repository";
import { reputationDelta } from "./users.rules";

const users = new UserRepository();

const DealCompletedPayload = z.object({
  dealId: z.string(),
  partyIds: z.array(z.string()).min(1),
});

// soma a reputação de cada parte do negócio. Roda dentro da transação do dispatcher
export async function applyReputation(event: StoredEvent): Promise<void> {
  const { partyIds } = DealCompletedPayload.parse(event.payload);
  const delta = reputationDelta(event.type);
  if (delta === 0) return;

  for (const userId of new Set(partyIds)) {
    const updated = await users.addReputation(userId, delta);

    if (!updated) throw new Error(`Usuário ${userId} do negócio não existe`);
  }
}

// chamado na subida do servidor
export function registerUsersHandlers(): void {
  subscribe("DEAL_COMPLETED", "users.applyReputation", applyReputation);
}
