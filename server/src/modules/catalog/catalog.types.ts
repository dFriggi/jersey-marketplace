import type { ListingStatus, ListingType } from "./listing.model";
import type { ShirtState } from "./shirt.model";

// a camisa como os outros módulos enxergam (contrato do plano de ação)
export interface ShirtSummary {
  id: string;
  ownerId: string;
  team: string;
  season: string;
  size: string;
  condition: string;
  photos: string[];
  openToTrade: boolean;
  state: ShirtState;
}

// o anúncio como o catalog enxerga
export interface Listing {
  id: string;
  shirtId: string;
  sellerId: string;
  type: ListingType;
  priceCents?: number;
  status: ListingStatus;
  open: boolean;
  createdAt: Date;
}

// o que a compra direta precisa saber do anúncio de venda
export interface ActiveSaleListing {
  id: string;
  sellerId: string;
  priceCents: number;
}
