import { describe, expect, it } from "vitest";
import {
  buildRequestedKey,
  decideAccept,
  decideCancel,
  decideCreatePurchase,
  decideCreateTrade,
  decideDecline,
  decideExpire,
  PROPOSAL_TTL_MS,
  type ShirtFacts,
} from "../../../src/modules/trading/proposal.rules";
import type { Proposal } from "../../../src/modules/trading/proposal.types";

// regras puras: sem banco, sem relógio, sem mocks. Entrada -> decisão.

const now = new Date("2026-11-20T12:00:00Z");
const ana = "ana";
const bia = "bia";
const caio = "caio";

function aShirt(id: string, overrides: Partial<ShirtFacts> = {}): ShirtFacts {
  return { id, ownerId: bia, openToTrade: true, state: "FREE", ...overrides };
}

function aProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: "p1",
    type: "TRADE",
    authorId: ana,
    recipientId: bia,
    offeredShirtIds: ["a1"],
    requestedShirtIds: ["b1", "b2"],
    requestedKey: "b1,b2",
    status: "PENDING",
    expiresAt: new Date(now.getTime() + 1000),
    version: 0,
    createdAt: now,
    ...overrides,
  };
}

const purchase = aProposal({
  type: "PURCHASE",
  offeredShirtIds: [],
  requestedShirtIds: ["b1"],
  requestedKey: "b1",
  listingId: "l1",
  amountCents: 35000,
  holdId: "h1",
});

describe("buildRequestedKey", () => {
  it("ordena e junta os ids, então a ordem do pedido não importa", () => {
    expect(buildRequestedKey(["b2", "b1"])).toBe("b1,b2");
    expect(buildRequestedKey(["b1", "b2"])).toBe(buildRequestedKey(["b2", "b1"]));
  });
});

describe("decideCreateTrade", () => {
  const offered = [aShirt("a1", { ownerId: ana })];
  const requested = [aShirt("b1"), aShirt("b2")];

  it("cria a troca PENDING com prazo de 3 dias e a chave das camisas pedidas", () => {
    expect(decideCreateTrade({ authorId: ana, offered, requested, now })).toEqual({
      type: "Create",
      proposal: {
        type: "TRADE",
        authorId: ana,
        recipientId: bia,
        offeredShirtIds: ["a1"],
        requestedShirtIds: ["b1", "b2"],
        requestedKey: "b1,b2",
        expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS),
      },
    });
  });

  it.each([
    ["RN-T01: sem camisa oferecida", { offered: [] }, "empty_shirt_list"],
    ["RN-T01: sem camisa pedida", { requested: [] }, "empty_shirt_list"],
    ["RN-T02: a mesma camisa duas vezes", { requested: [aShirt("b1"), aShirt("b1")] }, "duplicate_shirt"],
    ["RN-T03: oferece camisa de outra pessoa", { offered: [aShirt("c1", { ownerId: caio })] }, "not_shirt_owner"],
    [
      "RN-T04: pede camisas de donos diferentes",
      { requested: [aShirt("b1"), aShirt("c1", { ownerId: caio })] },
      "multiple_recipients",
    ],
    ["RN-T05: pede a própria camisa", { requested: [aShirt("a2", { ownerId: ana })] }, "self_proposal"],
    [
      "RN-T06: camisa pedida fechada para troca",
      { requested: [aShirt("b1", { openToTrade: false })] },
      "shirt_not_open_to_trade",
    ],
    [
      "RN-T06: camisa pedida reservada",
      { requested: [aShirt("b1", { state: "RESERVED" })] },
      "shirt_not_open_to_trade",
    ],
    [
      "RN-T07: camisa oferecida reservada",
      { offered: [aShirt("a1", { ownerId: ana, state: "RESERVED" })] },
      "shirt_unavailable",
    ],
  ])("recusa %s", (_case, overrides, code) => {
    const decision = decideCreateTrade({ authorId: ana, offered, requested, now, ...overrides });

    expect(decision).toMatchObject({ type: "Reject", code });
  });
});

describe("decideCreatePurchase", () => {
  const shirt = aShirt("b1", { openToTrade: false });
  const listing = { id: "l1", sellerId: bia, priceCents: 35000 };
  const input = { buyerId: ana, shirt, listing, amountCents: 35000, now };

  it("cria a compra direta pelo preço pedido, endereçada ao vendedor", () => {
    expect(decideCreatePurchase(input)).toEqual({
      type: "Create",
      proposal: {
        type: "PURCHASE",
        authorId: ana,
        recipientId: bia,
        offeredShirtIds: [],
        requestedShirtIds: ["b1"],
        requestedKey: "b1",
        listingId: "l1",
        amountCents: 35000,
        expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS),
      },
    });
  });

  it.each([
    ["RN-T08: camisa sem anúncio ativo", { listing: null }, "listing_not_active"],
    ["RN-T05: o vendedor comprando a própria camisa", { buyerId: bia }, "self_proposal"],
    ["RN-T09: valor diferente do preço pedido", { amountCents: 30000 }, "price_mismatch"],
    ["RN-T10: camisa já reservada", { shirt: { ...shirt, state: "RESERVED" as const } }, "shirt_unavailable"],
    ["RN-T10: camisa que não é mais do vendedor", { shirt: { ...shirt, ownerId: caio } }, "shirt_unavailable"],
  ])("recusa %s", (_case, overrides, code) => {
    expect(decideCreatePurchase({ ...input, ...overrides })).toMatchObject({ type: "Reject", code });
  });
});

describe("decideAccept", () => {
  it("na troca, reserva as camisas dos dois lados e descreve as transferências", () => {
    expect(decideAccept(aProposal(), bia, now)).toEqual({
      type: "Accept",
      reservations: [
        { shirtId: "a1", ownerId: ana },
        { shirtId: "b1", ownerId: bia },
        { shirtId: "b2", ownerId: bia },
      ],
      transfers: [
        { shirtId: "a1", fromUserId: ana, toUserId: bia },
        { shirtId: "b1", fromUserId: bia, toUserId: ana },
        { shirtId: "b2", fromUserId: bia, toUserId: ana },
      ],
    });
  });

  it("na compra direta, o comprador paga o vendedor com a retenção da proposta", () => {
    expect(decideAccept(purchase, bia, now)).toMatchObject({
      type: "Accept",
      transfers: [{ shirtId: "b1", fromUserId: bia, toUserId: ana }],
      payment: { payerId: ana, payeeId: bia, amountCents: 35000, holdId: "h1" },
    });
  });

  it.each([
    ["RN-T12: quem aceita não é o destinatário", aProposal(), ana, now, "not_recipient"],
    ["RN-T13: proposta já recusada", aProposal({ status: "DECLINED" }), bia, now, "proposal_not_pending"],
    ["RN-T14: proposta vencida", aProposal({ expiresAt: now }), bia, now, "proposal_expired"],
  ])("recusa %s", (_case, proposal, actorId, at, code) => {
    expect(decideAccept(proposal, actorId, at)).toMatchObject({ type: "Reject", code });
  });
});

describe("recusar, cancelar e expirar", () => {
  it("RN-T12: o destinatário recusa e RN-T16: a retenção é devolvida", () => {
    expect(decideDecline(purchase, bia)).toEqual({ type: "Close", status: "DECLINED", releaseHoldId: "h1" });
  });

  it("RN-T15: o autor cancela; na troca não há retenção para devolver", () => {
    expect(decideCancel(aProposal(), ana)).toEqual({ type: "Close", status: "CANCELLED" });
  });

  it("expira a proposta pendente vencida e devolve a retenção", () => {
    expect(decideExpire(purchase, purchase.expiresAt)).toEqual({
      type: "Close",
      status: "EXPIRED",
      releaseHoldId: "h1",
    });
  });

  it.each([
    ["RN-T12: o autor tentando recusar", () => decideDecline(aProposal(), ana), "not_recipient"],
    ["RN-T15: o destinatário tentando cancelar", () => decideCancel(aProposal(), bia), "not_author"],
    [
      "RN-T13: recusar proposta já aceita",
      () => decideDecline(aProposal({ status: "ACCEPTED" }), bia),
      "proposal_not_pending",
    ],
    [
      "RN-T13: cancelar proposta expirada",
      () => decideCancel(aProposal({ status: "EXPIRED" }), ana),
      "proposal_not_pending",
    ],
  ])("recusa %s", (_case, decide, code) => {
    expect(decide()).toMatchObject({ type: "Reject", code });
  });

  it.each([
    ["ainda dentro do prazo", aProposal()],
    ["já aceita", aProposal({ status: "ACCEPTED", expiresAt: now })],
  ])("mantém a proposta %s", (_case, proposal) => {
    expect(decideExpire(proposal, now)).toEqual({ type: "Keep" });
  });
});
