import { clock } from "../../core/clock";
import { runInTransaction } from "../../core/database/transaction";
import { DomainError, invalidTransition } from "../../core/errors";
import { decideTransfer, type TransferInput } from "./catalog.rules";
import type { ActiveSaleListing, ShirtSummary } from "./catalog.types";
import { ListingRepository } from "./listing.repository";
import { ShirtRepository } from "./shirt.repository";

const shirts = new ShirtRepository();
const listings = new ListingRepository();

// devolve as camisas na ordem pedida; se faltar alguma, não devolve nenhuma
export async function getShirts(shirtIds: string[]): Promise<ShirtSummary[]> {
  const found = await shirts.findByIds(shirtIds);
  const byId = new Map(found.map((shirt) => [shirt.id, shirt]));
  const missing = [...new Set(shirtIds)].filter((id) => !byId.has(id));

  if (missing.length > 0) {
    throw new DomainError("not_found", "shirt_not_found", "Camisa não encontrada", { ids: missing });
  }

  return shirtIds.flatMap((id) => byId.get(id) ?? []);
}

// anúncio de venda ativo da camisa, ou null
export async function getActiveSaleListing(shirtId: string): Promise<ActiveSaleListing | null> {
  const listing = await listings.findActiveSale(shirtId);
  if (!listing) return null;

  // a criação do anúncio de venda exige preço; chegar aqui sem ele é dado corrompido
  if (listing.priceCents === undefined) throw new Error(`Anúncio de venda ${listing.id} sem preço`);

  return { id: listing.id, sellerId: listing.sellerId, priceCents: listing.priceCents };
}

// RN-C01: reserva cada camisa só se ela estiver FREE e ainda for do dono informado (compare-and-set)
// RN-C02: a reserva é tudo ou nada; se uma camisa falha, nenhuma fica reservada
// o anúncio ACTIVE da camisa, se houver, vai junto para RESERVED
export async function reserveShirts(items: { shirtId: string; ownerId: string }[]): Promise<void> {
  await runInTransaction(async () => {
    for (const { shirtId, ownerId } of items) {
      const reserved = await shirts.reserveIfFree(shirtId, ownerId);

      if (!reserved) {
        throw new DomainError("conflict", "shirt_unavailable", "Esta camisa não está mais disponível", { shirtId });
      }

      await listings.reserveActive(shirtId);
    }
  });
}

// RN-C04: a camisa RESERVED passa para o novo dono, volta a FREE e fica fechada para troca
// o anúncio RESERVED dela, se houver, fecha como vendido (CLOSED, SOLD) com o negócio e a data
export async function transferShirt(input: { shirtId: string } & TransferInput): Promise<void> {
  await runInTransaction(async () => {
    const current = await shirts.findById(input.shirtId);

    if (!current) {
      throw new DomainError("not_found", "shirt_not_found", "Camisa não encontrada", { ids: [input.shirtId] });
    }

    const entry = decideTransfer(current, input, clock.now());

    // compare-and-set: se outra chamada mexeu na camisa depois da leitura, esta perde
    const transferred = await shirts.transferIfReserved(current.id, entry);
    if (!transferred) throw invalidTransition("shirt", current.state, "FREE");

    await listings.closeReservedAsSold(current.id, input.dealId, entry.acquiredAt);
  });
}

// RN-C03: só camisa RESERVED volta a FREE; o anúncio RESERVED dela volta a ACTIVE
export async function releaseShirts(shirtIds: string[]): Promise<void> {
  await runInTransaction(async () => {
    for (const shirtId of shirtIds) {
      const released = await shirts.releaseIfReserved(shirtId);

      if (!released) {
        const current = await shirts.findById(shirtId);
        if (!current) {
          throw new DomainError("not_found", "shirt_not_found", "Camisa não encontrada", { ids: [shirtId] });
        }

        throw invalidTransition("shirt", current.state, "FREE");
      }

      await listings.reactivateReserved(shirtId);
    }
  });
}
