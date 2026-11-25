// troca: camisas por camisas; compra direta: dinheiro por uma camisa anunciada
export const PROPOSAL_TYPES = ["TRADE", "PURCHASE"] as const;
export type ProposalType = (typeof PROPOSAL_TYPES)[number];

// PENDING -> ACCEPTED, DECLINED, CANCELLED ou EXPIRED. Sem contraproposta no MVP:
// quem recebe recusa e faz uma proposta nova
export const PROPOSAL_STATUSES = ["PENDING", "ACCEPTED", "DECLINED", "CANCELLED", "EXPIRED"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

// a proposta como o resto do sistema enxerga
export interface Proposal {
  id: string;
  type: ProposalType;
  authorId: string;
  recipientId: string;
  // camisas do autor que vão para o destinatário (só na troca)
  offeredShirtIds: string[];
  // camisas do destinatário que o autor quer
  requestedShirtIds: string[];
  requestedKey: string;
  listingId?: string;
  amountCents?: number;
  holdId?: string;
  status: ProposalStatus;
  expiresAt: Date;
  dealId?: string;
  closedAt?: Date;
  version: number;
  createdAt: Date;
}
