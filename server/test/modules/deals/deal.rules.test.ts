import { describe, expect, it } from "vitest";
import {
  decideCancelOverdue,
  decideComplete,
  decideReceive,
  decideShip,
  deriveStatus,
  planShipments,
  shipByFrom,
  SHIP_BY_MS,
} from "../../../src/modules/deals/deal.rules";
import type { Deal, Shipment, ShipmentStatus } from "../../../src/modules/deals/deal.types";

// regras puras: sem banco, sem relógio, sem mocks. Entrada -> decisão.

const now = new Date("2026-11-25T12:00:00Z");
const ana = "ana";
const bia = "bia";

function item(shirtId: string) {
  return { shirtId, team: "Santos", season: "2011", size: "G", condition: "Nova" };
}

function shipment(fromUserId: string, toUserId: string, shirtId: string, status: ShipmentStatus = "PENDING"): Shipment {
  return { fromUserId, toUserId, items: [item(shirtId)], status };
}

// compra: bia (vendedora) envia para ana (compradora)
function aPurchaseDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: "d1",
    origin: { type: "PROPOSAL", refId: "p1" },
    partyIds: [ana, bia],
    shirtIds: ["b1"],
    shipments: [shipment(bia, ana, "b1")],
    payment: { payerId: ana, payeeId: bia, amountCents: 35000, holdId: "h1", status: "IN_ESCROW" },
    status: "AWAITING_SHIPMENT",
    active: true,
    shipBy: new Date(now.getTime() + 1000),
    history: [],
    version: 0,
    createdAt: now,
    ...overrides,
  };
}

// troca: ana envia a1 para bia, bia envia b1 para ana
function aTradeDeal(statuses: [ShipmentStatus, ShipmentStatus], overrides: Partial<Deal> = {}): Deal {
  return aPurchaseDeal({
    shirtIds: ["a1", "b1"],
    shipments: [shipment(ana, bia, "a1", statuses[0]), shipment(bia, ana, "b1", statuses[1])],
    payment: undefined,
    ...overrides,
  });
}

describe("planShipments e shipByFrom", () => {
  it("RN-D09: agrupa as transferências em uma remessa por direção", () => {
    const plan = planShipments([
      { shirtId: "a1", fromUserId: ana, toUserId: bia },
      { shirtId: "b1", fromUserId: bia, toUserId: ana },
      { shirtId: "b2", fromUserId: bia, toUserId: ana },
    ]);

    expect(plan).toEqual([
      { fromUserId: ana, toUserId: bia, shirtIds: ["a1"] },
      { fromUserId: bia, toUserId: ana, shirtIds: ["b1", "b2"] },
    ]);
  });

  it("RN-D08: o prazo de envio é de 5 dias a partir da abertura", () => {
    expect(shipByFrom(now)).toEqual(new Date(now.getTime() + SHIP_BY_MS));
    expect(SHIP_BY_MS).toBe(5 * 24 * 60 * 60 * 1000);
  });
});

describe("deriveStatus (RN-D01)", () => {
  it.each<[string, ShipmentStatus[], string]>([
    ["nada enviado", ["PENDING", "PENDING"], "AWAITING_SHIPMENT"],
    ["só um lado enviou", ["SHIPPED", "PENDING"], "AWAITING_SHIPMENT"],
    ["um lado já recebeu e o outro não enviou", ["RECEIVED", "PENDING"], "AWAITING_SHIPMENT"],
    ["os dois enviaram", ["SHIPPED", "SHIPPED"], "IN_TRANSIT"],
    ["um recebido e outro a caminho", ["RECEIVED", "SHIPPED"], "IN_TRANSIT"],
  ])("%s → %s", (_case, statuses, expected) => {
    expect(deriveStatus(statuses.map((status, i) => shipment(ana, bia, `s${i}`, status)))).toBe(expected);
  });
});

describe("decideShip", () => {
  it("RN-D03: quem envia marca a própria remessa com o código de rastreio", () => {
    expect(decideShip(aPurchaseDeal(), bia, "  BR123456789  ", now)).toEqual({
      type: "Ship",
      shipmentIndex: 0,
      trackingCode: "BR123456789",
      shippedAt: now,
      nextStatus: "IN_TRANSIT",
    });
  });

  it("na troca, o negócio continua aguardando envio até o outro lado enviar", () => {
    expect(decideShip(aTradeDeal(["PENDING", "PENDING"]), ana, "BR1", now)).toMatchObject({
      type: "Ship",
      shipmentIndex: 0,
      nextStatus: "AWAITING_SHIPMENT",
    });
  });

  it.each([
    ["RN-D02: negócio concluído", aPurchaseDeal({ status: "COMPLETED", active: false }), bia, "BR1", "deal_not_active"],
    ["RN-D03: o comprador tentando enviar", aPurchaseDeal(), ana, "BR1", "not_sender"],
    ["RN-D03: remessa já enviada", aTradeDeal(["SHIPPED", "PENDING"]), ana, "BR1", "shipment_already_shipped"],
    ["RN-D04: sem código de rastreio", aPurchaseDeal(), bia, "   ", "invalid_tracking_code"],
  ])("recusa %s", (_case, deal, actorId, trackingCode, code) => {
    expect(decideShip(deal, actorId, trackingCode, now)).toMatchObject({ type: "Reject", code });
  });
});

describe("decideReceive", () => {
  it("RN-D05: quem recebe confirma; a última remessa recebida deixa o negócio pronto para concluir", () => {
    expect(decideReceive(aPurchaseDeal({ shipments: [shipment(bia, ana, "b1", "SHIPPED")] }), ana, now)).toEqual({
      type: "Receive",
      shipmentIndex: 0,
      receivedAt: now,
      nextStatus: "IN_TRANSIT",
      readyToComplete: true,
    });
  });

  it("na troca, receber um lado ainda não conclui", () => {
    expect(decideReceive(aTradeDeal(["SHIPPED", "SHIPPED"]), bia, now)).toMatchObject({
      type: "Receive",
      shipmentIndex: 0,
      readyToComplete: false,
    });
  });

  it.each([
    ["RN-D05: o vendedor confirmando o próprio envio", aPurchaseDeal(), bia, "not_receiver"],
    ["RN-D05: remessa ainda não enviada", aPurchaseDeal(), ana, "shipment_not_shipped"],
    [
      "RN-D05: remessa já recebida",
      aTradeDeal(["RECEIVED", "SHIPPED"], { status: "IN_TRANSIT" }),
      bia,
      "shipment_already_received",
    ],
    ["RN-D02: negócio cancelado", aPurchaseDeal({ status: "CANCELLED", active: false }), ana, "deal_not_active"],
  ])("recusa %s", (_case, deal, actorId, code) => {
    expect(decideReceive(deal, actorId, now)).toMatchObject({ type: "Reject", code });
  });
});

describe("decideComplete", () => {
  it("RN-D07: na compra, transfere a camisa via PURCHASE, libera o pagamento e publica DEAL_COMPLETED", () => {
    const deal = aPurchaseDeal({ status: "IN_TRANSIT", shipments: [shipment(bia, ana, "b1", "RECEIVED")] });

    expect(decideComplete(deal, now)).toEqual({
      type: "Complete",
      completedAt: now,
      transfers: [{ shirtId: "b1", toUserId: ana, via: "PURCHASE", dealId: "d1" }],
      settleHoldId: "h1",
      event: { type: "DEAL_COMPLETED", payload: { dealId: "d1", partyIds: [ana, bia] } },
    });
  });

  it("RN-D07: na troca, as camisas vão nos dois sentidos via TRADE e não há pagamento", () => {
    const decision = decideComplete(aTradeDeal(["RECEIVED", "RECEIVED"], { status: "IN_TRANSIT" }), now);

    expect(decision).toMatchObject({
      type: "Complete",
      transfers: [
        { shirtId: "a1", toUserId: bia, via: "TRADE" },
        { shirtId: "b1", toUserId: ana, via: "TRADE" },
      ],
    });
    expect(decision).not.toHaveProperty("settleHoldId");
  });

  it.each([
    ["RN-D06: falta receber uma remessa", aTradeDeal(["RECEIVED", "SHIPPED"]), "deal_not_ready"],
    ["RN-D02: negócio já concluído", aPurchaseDeal({ status: "COMPLETED", active: false }), "deal_not_active"],
  ])("recusa %s", (_case, deal, code) => {
    expect(decideComplete(deal, now)).toMatchObject({ type: "Reject", code });
  });
});

describe("decideCancelOverdue (RN-D08)", () => {
  it("prazo vencido com remessa pendente: cancela, libera as camisas e devolve o dinheiro", () => {
    const deal = aPurchaseDeal({ shipBy: now });

    expect(decideCancelOverdue(deal, now)).toEqual({
      type: "Cancel",
      cancelledAt: now,
      releaseShirtIds: ["b1"],
      refundHoldId: "h1",
    });
  });

  it.each([
    ["ainda dentro do prazo", aPurchaseDeal()],
    ["tudo já enviado", aPurchaseDeal({ shipBy: now, shipments: [shipment(bia, ana, "b1", "SHIPPED")] })],
    ["já concluído", aPurchaseDeal({ shipBy: now, status: "COMPLETED", active: false })],
  ])("mantém o negócio %s", (_case, deal) => {
    expect(decideCancelOverdue(deal, now)).toEqual({ type: "Keep" });
  });
});
