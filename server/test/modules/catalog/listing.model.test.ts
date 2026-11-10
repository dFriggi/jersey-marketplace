import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { ListingModel } from "../../../src/modules/catalog/listing.model";
import { useTestDatabase } from "../../helpers/database";

const shirtId = new Types.ObjectId();

function aListing(overrides: Record<string, unknown> = {}) {
  return {
    shirtId,
    sellerId: new Types.ObjectId(),
    type: "SALE",
    priceCents: 35000,
    snapshot: { condition: "Nova com etiqueta", photos: ["https://exemplo.com/sao-paulo-2005.jpg"] },
    ...overrides,
  };
}

describe("model de anúncio (listings)", () => {
  useTestDatabase();

  it("o syncIndexes cria o índice único parcial de anúncio aberto por camisa", async () => {
    const indexes = await ListingModel.collection.indexes();
    const openIndex = indexes.find((index) => index.name === "shirtId_1");

    expect(openIndex).toMatchObject({ unique: true, partialFilterExpression: { open: true } });
  });

  it("o syncIndexes cria os índices da vitrine e do histórico", async () => {
    const keys = (await ListingModel.collection.indexes()).map((index) => index.key);

    expect(keys).toContainEqual({ status: 1, type: 1, createdAt: -1 });
    expect(keys).toContainEqual({ shirtId: 1, createdAt: -1 });
  });

  it("recusa dois anúncios abertos para a mesma camisa", async () => {
    await ListingModel.create(aListing());

    await expect(ListingModel.create(aListing())).rejects.toMatchObject({ code: 11000 });
  });

  it("aceita um novo anúncio depois de o primeiro ser fechado", async () => {
    await ListingModel.create(aListing());
    await ListingModel.updateOne({ shirtId }, { status: "WITHDRAWN", open: false });

    await expect(ListingModel.create(aListing())).resolves.toMatchObject({ status: "ACTIVE", open: true });
    expect(await ListingModel.countDocuments({ shirtId })).toBe(2);
  });

  it("um anúncio novo começa ativo, aberto e na versão 0", async () => {
    const listing = await ListingModel.create(aListing());

    expect(listing.toObject()).toMatchObject({ status: "ACTIVE", open: true, version: 0 });
    expect(listing.createdAt).toBeInstanceOf(Date);
  });

  it("o snapshot é guardado sem _id", async () => {
    const { _id } = await ListingModel.create(aListing());

    const stored = await ListingModel.findById(_id).lean();

    expect(stored?.snapshot).toEqual({
      condition: "Nova com etiqueta",
      photos: ["https://exemplo.com/sao-paulo-2005.jpg"],
    });
  });

  it.each([
    ["priceCents com centavo quebrado", { priceCents: 350.5 }],
    ["priceCents negativo", { priceCents: -1 }],
    ["type fora da lista", { type: "RENTAL" }],
    ["status fora da lista", { status: "SOLD" }],
    ["outcome fora da lista", { outcome: "DONATED" }],
    ["sem snapshot", { snapshot: undefined }],
  ])("recusa %s", async (_case, overrides) => {
    await expect(ListingModel.create(aListing(overrides))).rejects.toMatchObject({ name: "ValidationError" });
  });
});
