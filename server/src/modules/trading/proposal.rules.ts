import type { Proposal, ProposalType } from "./proposal.types";

// Regras puras de proposta: recebem valores e devolvem uma decisão.
// Não acessam o banco nem o relógio; quem chama (o service) busca os dados,
// passa a hora atual e executa o que a decisão descreve.

export const PROPOSAL_TTL_MS = 3 * 24 * 60 * 60 * 1000;

// o que as regras precisam saber de uma camisa (mesmos nomes do ShirtSummary do catalog)
export interface ShirtFacts {
  id: string;
  ownerId: string;
  openToTrade: boolean;
  state: "FREE" | "RESERVED" | "IN_AUCTION";
}

// o anúncio de venda ativo, como catalog.getActiveSaleListing devolve
export interface SaleListingFacts {
  id: string;
  sellerId: string;
  priceCents: number;
}

export type RejectionCode =
  | "empty_shirt_list"
  | "duplicate_shirt"
  | "not_shirt_owner"
  | "multiple_recipients"
  | "self_proposal"
  | "shirt_not_open_to_trade"
  | "shirt_unavailable"
  | "listing_not_active"
  | "price_mismatch"
  | "not_recipient"
  | "not_author"
  | "proposal_not_pending"
  | "proposal_expired";

export interface Rejection {
  type: "Reject";
  code: RejectionCode;
  details?: Record<string, unknown>;
}

export interface NewProposal {
  type: ProposalType;
  authorId: string;
  recipientId: string;
  offeredShirtIds: string[];
  requestedShirtIds: string[];
  requestedKey: string;
  listingId?: string;
  amountCents?: number;
  expiresAt: Date;
}

export type CreateDecision = { type: "Create"; proposal: NewProposal } | Rejection;

export type AcceptDecision =
  | {
      type: "Accept";
      // argumentos de catalog.reserveShirts
      reservations: { shirtId: string; ownerId: string }[];
      // argumentos de deals.openDeal
      transfers: { shirtId: string; fromUserId: string; toUserId: string }[];
      payment?: { payerId: string; payeeId: string; amountCents: number; holdId: string };
    }
  | Rejection;

export type CloseDecision =
  { type: "Close"; status: "DECLINED" | "CANCELLED" | "EXPIRED"; releaseHoldId?: string } | Rejection;

export type ExpireDecision = Extract<CloseDecision, { type: "Close" }> | { type: "Keep" };

function reject(code: RejectionCode, details?: Record<string, unknown>): Rejection {
  return details ? { type: "Reject", code, details } : { type: "Reject", code };
}

function expiresAt(now: Date): Date {
  return new Date(now.getTime() + PROPOSAL_TTL_MS);
}

// ids pedidos, sem repetição, ordenados e concatenados: a mesma escolha de camisas gera a mesma chave
export function buildRequestedKey(shirtIds: readonly string[]): string {
  return [...new Set(shirtIds)].sort().join(",");
}

export function decideCreateTrade(input: {
  authorId: string;
  offered: readonly ShirtFacts[];
  requested: readonly ShirtFacts[];
  now: Date;
}): CreateDecision {
  const { authorId, offered, requested, now } = input;

  // RN-T01
  if (offered.length === 0 || requested.length === 0) return reject("empty_shirt_list");

  // RN-T02
  const allIds = [...offered, ...requested].map((shirt) => shirt.id);
  if (new Set(allIds).size !== allIds.length) return reject("duplicate_shirt");

  // RN-T03
  const notOwned = offered.find((shirt) => shirt.ownerId !== authorId);
  if (notOwned) return reject("not_shirt_owner", { shirtId: notOwned.id });

  // RN-T04
  const owners = new Set(requested.map((shirt) => shirt.ownerId));
  if (owners.size > 1) return reject("multiple_recipients");
  const recipientId = requested[0]!.ownerId;

  // RN-T05
  if (recipientId === authorId) return reject("self_proposal");

  // RN-T06
  const closed = requested.find((shirt) => shirt.state !== "FREE" || !shirt.openToTrade);
  if (closed) return reject("shirt_not_open_to_trade", { shirtId: closed.id });

  // RN-T07
  const busy = offered.find((shirt) => shirt.state !== "FREE");
  if (busy) return reject("shirt_unavailable", { shirtId: busy.id });

  const requestedShirtIds = requested.map((shirt) => shirt.id);

  return {
    type: "Create",
    proposal: {
      type: "TRADE",
      authorId,
      recipientId,
      offeredShirtIds: offered.map((shirt) => shirt.id),
      requestedShirtIds,
      requestedKey: buildRequestedKey(requestedShirtIds),
      expiresAt: expiresAt(now), // RN-T11
    },
  };
}

export function decideCreatePurchase(input: {
  buyerId: string;
  shirt: ShirtFacts;
  listing: SaleListingFacts | null;
  amountCents: number;
  now: Date;
}): CreateDecision {
  const { buyerId, shirt, listing, amountCents, now } = input;

  // RN-T08
  if (!listing) return reject("listing_not_active", { shirtId: shirt.id });

  // RN-T05
  if (listing.sellerId === buyerId) return reject("self_proposal");

  // RN-T09
  if (amountCents !== listing.priceCents) return reject("price_mismatch", { priceCents: listing.priceCents });

  // RN-T10
  if (shirt.state !== "FREE" || shirt.ownerId !== listing.sellerId) {
    return reject("shirt_unavailable", { shirtId: shirt.id });
  }

  return {
    type: "Create",
    proposal: {
      type: "PURCHASE",
      authorId: buyerId,
      recipientId: listing.sellerId,
      offeredShirtIds: [],
      requestedShirtIds: [shirt.id],
      requestedKey: buildRequestedKey([shirt.id]),
      listingId: listing.id,
      amountCents,
      expiresAt: expiresAt(now), // RN-T11
    },
  };
}

// RN-T13: só uma proposta PENDING muda de status
function pendingOrReject(proposal: Proposal): Rejection | null {
  return proposal.status === "PENDING" ? null : reject("proposal_not_pending", { status: proposal.status });
}

export function decideAccept(proposal: Proposal, actorId: string, now: Date): AcceptDecision {
  // RN-T12
  if (actorId !== proposal.recipientId) return reject("not_recipient");

  const notPending = pendingOrReject(proposal);
  if (notPending) return notPending;

  // RN-T14
  if (now >= proposal.expiresAt) return reject("proposal_expired");

  const { authorId, recipientId } = proposal;
  const reservations = [
    ...proposal.offeredShirtIds.map((shirtId) => ({ shirtId, ownerId: authorId })),
    ...proposal.requestedShirtIds.map((shirtId) => ({ shirtId, ownerId: recipientId })),
  ];
  const transfers = reservations.map(({ shirtId, ownerId }) => ({
    shirtId,
    fromUserId: ownerId,
    toUserId: ownerId === authorId ? recipientId : authorId,
  }));

  if (proposal.amountCents && proposal.holdId) {
    return {
      type: "Accept",
      reservations,
      transfers,
      payment: { payerId: authorId, payeeId: recipientId, amountCents: proposal.amountCents, holdId: proposal.holdId },
    };
  }

  return { type: "Accept", reservations, transfers };
}

// RN-T16: encerrar uma proposta devolve o saldo retido, se houver
function close(status: "DECLINED" | "CANCELLED" | "EXPIRED", proposal: Proposal) {
  return proposal.holdId
    ? { type: "Close" as const, status, releaseHoldId: proposal.holdId }
    : { type: "Close" as const, status };
}

export function decideDecline(proposal: Proposal, actorId: string): CloseDecision {
  // RN-T12
  if (actorId !== proposal.recipientId) return reject("not_recipient");

  return pendingOrReject(proposal) ?? close("DECLINED", proposal);
}

export function decideCancel(proposal: Proposal, actorId: string): CloseDecision {
  // RN-T15
  if (actorId !== proposal.authorId) return reject("not_author");

  return pendingOrReject(proposal) ?? close("CANCELLED", proposal);
}

export function decideExpire(proposal: Proposal, now: Date): ExpireDecision {
  if (proposal.status !== "PENDING" || now < proposal.expiresAt) return { type: "Keep" };

  return close("EXPIRED", proposal);
}
