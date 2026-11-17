import type { Deal, DealStatus, Shipment } from "./deal.types";

// Regras puras de negócio: recebem o negócio, quem age e a hora atual e devolvem
// uma decisão. Os serviços de deals buscam o negócio, chamam a regra e executam
// o que ela descreve (gravar, transferir camisas, liberar dinheiro, publicar evento).

export const SHIP_BY_MS = 5 * 24 * 60 * 60 * 1000;

export type DealRejectionCode =
  | "deal_not_active"
  | "not_sender"
  | "shipment_already_shipped"
  | "invalid_tracking_code"
  | "not_receiver"
  | "shipment_not_shipped"
  | "shipment_already_received"
  | "deal_not_ready";

export interface DealRejection {
  type: "Reject";
  code: DealRejectionCode;
}

export type ShipDecision =
  | { type: "Ship"; shipmentIndex: number; trackingCode: string; shippedAt: Date; nextStatus: DealStatus }
  | DealRejection;

export type ReceiveDecision =
  | { type: "Receive"; shipmentIndex: number; receivedAt: Date; nextStatus: DealStatus; readyToComplete: boolean }
  | DealRejection;

export interface DealCompletedEvent {
  type: "DEAL_COMPLETED";
  payload: { dealId: string; partyIds: string[] };
}

export type CompleteDecision =
  | {
      type: "Complete";
      completedAt: Date;
      // argumentos de catalog.transferShirt
      transfers: { shirtId: string; toUserId: string; via: "PURCHASE" | "TRADE"; dealId: string }[];
      // argumento de wallet.settle, quando há pagamento
      settleHoldId?: string;
      event: DealCompletedEvent;
    }
  | DealRejection;

export type CancelDecision =
  { type: "Cancel"; cancelledAt: Date; releaseShirtIds: string[]; refundHoldId?: string } | { type: "Keep" };

function reject(code: DealRejectionCode): DealRejection {
  return { type: "Reject", code };
}

// RN-D09: uma remessa por direção (de quem para quem), na ordem em que as camisas aparecem
export function planShipments(
  transfers: readonly { shirtId: string; fromUserId: string; toUserId: string }[]
): { fromUserId: string; toUserId: string; shirtIds: string[] }[] {
  const byDirection = new Map<string, { fromUserId: string; toUserId: string; shirtIds: string[] }>();

  for (const { shirtId, fromUserId, toUserId } of transfers) {
    const key = `${fromUserId}->${toUserId}`;
    const group = byDirection.get(key) ?? { fromUserId, toUserId, shirtIds: [] };
    group.shirtIds.push(shirtId);
    byDirection.set(key, group);
  }

  return [...byDirection.values()];
}

// RN-D08
export function shipByFrom(openedAt: Date): Date {
  return new Date(openedAt.getTime() + SHIP_BY_MS);
}

// RN-D01: enquanto alguém ainda precisa enviar, o negócio aguarda envio; depois, está em trânsito
export function deriveStatus(shipments: readonly Shipment[]): "AWAITING_SHIPMENT" | "IN_TRANSIT" {
  return shipments.some((shipment) => shipment.status === "PENDING") ? "AWAITING_SHIPMENT" : "IN_TRANSIT";
}

function withShipment(shipments: readonly Shipment[], index: number, change: Partial<Shipment>): Shipment[] {
  return shipments.map((shipment, i) => (i === index ? { ...shipment, ...change } : shipment));
}

export function decideShip(deal: Deal, actorId: string, trackingCode: string, now: Date): ShipDecision {
  // RN-D02
  if (!deal.active) return reject("deal_not_active");

  // RN-D03
  const index = deal.shipments.findIndex((shipment) => shipment.fromUserId === actorId);
  if (index === -1) return reject("not_sender");
  if (deal.shipments[index]!.status !== "PENDING") return reject("shipment_already_shipped");

  // RN-D04
  const code = trackingCode.trim();
  if (!code) return reject("invalid_tracking_code");

  const after = withShipment(deal.shipments, index, { status: "SHIPPED" });

  return { type: "Ship", shipmentIndex: index, trackingCode: code, shippedAt: now, nextStatus: deriveStatus(after) };
}

export function decideReceive(deal: Deal, actorId: string, now: Date): ReceiveDecision {
  // RN-D02
  if (!deal.active) return reject("deal_not_active");

  // RN-D05
  const index = deal.shipments.findIndex((shipment) => shipment.toUserId === actorId);
  if (index === -1) return reject("not_receiver");

  const status = deal.shipments[index]!.status;
  if (status === "PENDING") return reject("shipment_not_shipped");
  if (status === "RECEIVED") return reject("shipment_already_received");

  const after = withShipment(deal.shipments, index, { status: "RECEIVED" });

  return {
    type: "Receive",
    shipmentIndex: index,
    receivedAt: now,
    nextStatus: deriveStatus(after),
    readyToComplete: after.every((shipment) => shipment.status === "RECEIVED"),
  };
}

export function decideComplete(deal: Deal, now: Date): CompleteDecision {
  // RN-D02
  if (!deal.active) return reject("deal_not_active");

  // RN-D06
  if (!deal.shipments.every((shipment) => shipment.status === "RECEIVED")) return reject("deal_not_ready");

  // RN-D07: camisas nos dois sentidos é troca; num sentido só, compra
  const senders = new Set(deal.shipments.map((shipment) => shipment.fromUserId));
  const via = senders.size > 1 ? "TRADE" : "PURCHASE";

  const transfers = deal.shipments.flatMap((shipment) =>
    shipment.items.map(
      (item) => ({ shirtId: item.shirtId, toUserId: shipment.toUserId, via, dealId: deal.id }) as const
    )
  );
  const event: DealCompletedEvent = {
    type: "DEAL_COMPLETED",
    payload: { dealId: deal.id, partyIds: deal.partyIds },
  };

  return deal.payment
    ? { type: "Complete", completedAt: now, transfers, settleHoldId: deal.payment.holdId, event }
    : { type: "Complete", completedAt: now, transfers, event };
}

// RN-D08: prazo de envio vencido com alguma remessa pendente cancela o negócio
export function decideCancelOverdue(deal: Deal, now: Date): CancelDecision {
  const overdue = now >= deal.shipBy && deal.shipments.some((shipment) => shipment.status === "PENDING");
  if (!deal.active || !overdue) return { type: "Keep" };

  return deal.payment
    ? { type: "Cancel", cancelledAt: now, releaseShirtIds: deal.shirtIds, refundHoldId: deal.payment.holdId }
    : { type: "Cancel", cancelledAt: now, releaseShirtIds: deal.shirtIds };
}
