import { DomainError } from "../../core/errors";
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
