// AWAITING_SHIPMENT -> IN_TRANSIT -> COMPLETED; CANCELLED se o prazo de envio vencer.
// Enquanto não conclui ou cancela, o status é calculado pelas remessas
export const DEAL_STATUSES = ["AWAITING_SHIPMENT", "IN_TRANSIT", "COMPLETED", "CANCELLED"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const SHIPMENT_STATUSES = ["PENDING", "SHIPPED", "RECEIVED"] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const DEAL_ORIGIN_TYPES = ["PROPOSAL"] as const;
export type DealOriginType = (typeof DEAL_ORIGIN_TYPES)[number];

export const PAYMENT_STATUSES = ["IN_ESCROW", "SETTLED", "REFUNDED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// cópia da camisa no momento do negócio
export interface ShipmentItem {
  shirtId: string;
  team: string;
  season: string;
  size: string;
  condition: string;
}

// uma remessa por direção: tudo que sai de um usuário para o outro
export interface Shipment {
  fromUserId: string;
  toUserId: string;
  items: ShipmentItem[];
  status: ShipmentStatus;
  // sem endereço no MVP: a remessa guarda só o código de rastreio
  trackingCode?: string;
  shippedAt?: Date;
  receivedAt?: Date;
}

export interface DealPayment {
  payerId: string;
  payeeId: string;
  amountCents: number;
  holdId: string;
  status: PaymentStatus;
}

export interface DealHistoryEntry {
  status: DealStatus;
  at: Date;
}

// o negócio como o resto do sistema enxerga
export interface Deal {
  id: string;
  origin: { type: DealOriginType; refId: string };
  partyIds: string[];
  shirtIds: string[];
  shipments: Shipment[];
  payment?: DealPayment;
  status: DealStatus;
  active: boolean;
  shipBy: Date;
  history: DealHistoryEntry[];
  version: number;
  createdAt: Date;
}
