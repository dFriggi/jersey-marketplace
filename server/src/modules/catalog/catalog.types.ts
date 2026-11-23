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
  // como a camisa estava quando foi anunciada
  snapshot: { condition: string; photos: string[] };
  createdAt: Date;
}

// o que a compra direta precisa saber do anúncio de venda
export interface ActiveSaleListing {
  id: string;
  sellerId: string;
  priceCents: number;
}

// filtros da vitrine; o que vier vazio não filtra
export interface ShowcaseQuery {
  team?: string;
  size?: string;
  page: number;
  pageSize: number;
}

// um item da vitrine: o anúncio de venda com o que o comprador precisa ver da camisa
export interface ShowcaseItem {
  id: string;
  shirtId: string;
  sellerId: string;
  priceCents: number;
  team: string;
  season: string;
  size: string;
  condition: string;
  photos: string[];
  createdAt: Date;
}
