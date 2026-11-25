import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { DealModel } from "../../../src/modules/deals/deal.model";
import { useTestDatabase } from "../../helpers/database";

const sellerId = new Types.ObjectId();
const buyerId = new Types.ObjectId();
const shirtId = new Types.ObjectId();

function aDeal(overrides: Record<string, unknown> = {}) {
  return {
    origin: { type: "PROPOSAL", refId: new Types.ObjectId() },
    partyIds: [sellerId, buyerId],
    shirtIds: [shirtId],
    shipments: [
      {
        fromUserId: sellerId,
        toUserId: buyerId,
        items: [{ shirtId, team: "São Paulo", season: "2005", size: "M", condition: "Usada, sem defeitos" }],
      },
    ],
    payment: { payerId: buyerId, payeeId: sellerId, amountCents: 35000, holdId: new Types.ObjectId() },
    shipBy: new Date("2026-12-06T12:00:00Z"),
    ...overrides,
  };
}

describe("model de negócio (deals)", () => {
  useTestDatabase();

  it("o syncIndexes cria o índice único parcial de camisa em negócio ativo", async () => {
    const indexes = await DealModel.collection.indexes();
    const activeIndex = indexes.find((index) => index.name === "shirtIds_1");

    expect(activeIndex).toMatchObject({ unique: true, partialFilterExpression: { active: true } });
  });

  it("o syncIndexes cria o índice único por origem e o de meus negócios", async () => {
    const indexes = await DealModel.collection.indexes();

    expect(indexes.find((index) => index.name === "origin.type_1_origin.refId_1")).toMatchObject({ unique: true });
    expect(indexes.map((index) => index.key)).toContainEqual({ partyIds: 1, createdAt: -1 });
  });

  it("recusa a mesma camisa em dois negócios ativos", async () => {
    await DealModel.create(aDeal());

    await expect(DealModel.create(aDeal())).rejects.toMatchObject({ code: 11000 });
  });

  it("a trava vale para cada camisa do array, mesmo misturada com outras", async () => {
    await DealModel.create(aDeal());

    await expect(DealModel.create(aDeal({ shirtIds: [new Types.ObjectId(), shirtId] }))).rejects.toMatchObject({
      code: 11000,
    });
  });

  it("aceita a camisa num novo negócio depois de o primeiro deixar de ser ativo", async () => {
    await DealModel.create(aDeal());
    await DealModel.updateOne({ shirtIds: shirtId }, { status: "COMPLETED", active: false });

    await expect(DealModel.create(aDeal())).resolves.toMatchObject({ status: "AWAITING_SHIPMENT", active: true });
  });

  it("recusa dois negócios para a mesma proposta", async () => {
    const origin = { type: "PROPOSAL", refId: new Types.ObjectId() };
    await DealModel.create(aDeal({ origin }));

    await expect(DealModel.create(aDeal({ origin, shirtIds: [new Types.ObjectId()] }))).rejects.toMatchObject({
      code: 11000,
    });
  });

  it("um negócio novo começa aguardando envio, ativo, na versão 0, com remessa e pagamento pendentes", async () => {
    const { _id } = await DealModel.create(aDeal());

    const stored = await DealModel.findById(_id).lean();

    expect(stored).toMatchObject({ status: "AWAITING_SHIPMENT", active: true, version: 0, history: [] });
    expect(stored?.shipments[0]).toMatchObject({ status: "PENDING" });
    expect(stored?.payment).toMatchObject({ status: "IN_ESCROW", amountCents: 35000 });
  });

  it("subdocumentos são guardados sem _id", async () => {
    const { _id } = await DealModel.create(aDeal());

    const stored = await DealModel.findById(_id).lean();

    expect(stored?.origin).not.toHaveProperty("_id");
    expect(stored?.shipments[0]).not.toHaveProperty("_id");
    expect(stored?.shipments[0]?.items[0]).not.toHaveProperty("_id");
    expect(stored?.payment).not.toHaveProperty("_id");
  });

  it("a troca não tem pagamento", async () => {
    const { _id } = await DealModel.create(aDeal({ payment: undefined }));

    expect((await DealModel.findById(_id).lean())?.payment).toBeUndefined();
  });

  it.each([
    ["status fora da lista", { status: "IN_DISPUTE" }],
    ["origem fora da lista", { origin: { type: "AUCTION", refId: new Types.ObjectId() } }],
    ["sem camisas", { shirtIds: [] }],
    ["sem remessas", { shipments: [] }],
    ["remessa sem camisas", { shipments: [{ fromUserId: sellerId, toUserId: buyerId, items: [] }] }],
    ["pagamento com centavo quebrado", { payment: { payerId: buyerId, payeeId: sellerId, amountCents: 1.5 } }],
    ["sem prazo de envio", { shipBy: undefined }],
  ])("recusa %s", async (_case, overrides) => {
    await expect(DealModel.create(aDeal(overrides))).rejects.toMatchObject({ name: "ValidationError" });
  });
});
