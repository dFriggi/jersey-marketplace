import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { fixedClock, setClock } from "../../../src/core/clock";
import { reserveShirts, transferShirt } from "../../../src/modules/catalog";
import { ListingModel } from "../../../src/modules/catalog/listing.model";
import { ShirtModel } from "../../../src/modules/catalog/shirt.model";
import { useTestDatabase } from "../../helpers/database";

const NOW = "2026-11-20T15:00:00.000Z";
const sellerId = new Types.ObjectId();
const seller = sellerId.toHexString();
const newId = () => new Types.ObjectId().toHexString();

// venda para um comprador qualquer, num negócio qualquer
const sellTo = (shirtId: string) => transferShirt({ shirtId, toUserId: newId(), via: "PURCHASE", dealId: newId() });

async function aShirt(overrides: Record<string, unknown> = {}) {
  const shirt = await ShirtModel.create({
    ownerId: sellerId,
    team: "São Paulo",
    country: "Brasil",
    league: "Brasileirão",
    season: "2005",
    kind: "HOME",
    edition: "FAN",
    size: "M",
    condition: "Nova com etiqueta",
    openToTrade: true,
    ownerHistory: [{ userId: sellerId, acquiredAt: new Date("2026-01-01T00:00:00Z"), via: "REGISTERED" }],
    ...overrides,
  });
  return shirt._id.toHexString();
}

async function aListing(shirtId: string) {
  const listing = await ListingModel.create({
    shirtId: new Types.ObjectId(shirtId),
    sellerId,
    type: "SALE",
    priceCents: 35000,
    snapshot: { condition: "Nova com etiqueta" },
  });
  return listing._id;
}

// camisa à venda e já reservada pelo aceite
async function aReservedShirtOnSale() {
  const shirtId = await aShirt();
  const listingId = await aListing(shirtId);
  await reserveShirts([{ shirtId, ownerId: seller }]);
  return { shirtId, listingId };
}

describe("catalog: transferência de dono", () => {
  useTestDatabase();

  it("RN-C04: a camisa passa para o comprador, volta a FREE e fecha para troca", async () => {
    setClock(fixedClock(NOW));
    const { shirtId } = await aReservedShirtOnSale();
    const buyer = newId();
    const dealId = newId();

    await transferShirt({ shirtId, toUserId: buyer, via: "PURCHASE", dealId });

    const shirt = await ShirtModel.findById(shirtId).lean();
    expect(shirt).toMatchObject({
      ownerId: new Types.ObjectId(buyer),
      state: "FREE",
      openToTrade: false,
      version: 2,
    });
    expect(shirt?.ownerHistory).toEqual([
      { userId: sellerId, acquiredAt: new Date("2026-01-01T00:00:00Z"), via: "REGISTERED" },
      {
        userId: new Types.ObjectId(buyer),
        acquiredAt: new Date(NOW),
        via: "PURCHASE",
        dealId: new Types.ObjectId(dealId),
      },
    ]);
  });

  it("o anúncio reservado fecha como vendido, com o negócio e a data", async () => {
    setClock(fixedClock(NOW));
    const { shirtId, listingId } = await aReservedShirtOnSale();
    const dealId = newId();

    await transferShirt({ shirtId, toUserId: newId(), via: "PURCHASE", dealId });

    expect(await ListingModel.findById(listingId).lean()).toMatchObject({
      status: "CLOSED",
      open: false,
      outcome: "SOLD",
      closedByDealId: new Types.ObjectId(dealId),
      closedAt: new Date(NOW),
    });
  });

  it("camisa trocada, sem anúncio, também muda de dono (via TRADE)", async () => {
    const shirtId = await aShirt();
    await reserveShirts([{ shirtId, ownerId: seller }]);

    await transferShirt({ shirtId, toUserId: newId(), via: "TRADE", dealId: newId() });

    const shirt = await ShirtModel.findById(shirtId).lean();
    expect(shirt?.state).toBe("FREE");
    expect(shirt?.ownerHistory.at(-1)?.via).toBe("TRADE");
    expect(await ListingModel.countDocuments()).toBe(0);
  });

  it("o novo dono pode anunciar a camisa de novo, porque o anúncio antigo fechou", async () => {
    const { shirtId } = await aReservedShirtOnSale();
    await sellTo(shirtId);

    await expect(aListing(shirtId)).resolves.toBeDefined();
    expect(await ListingModel.countDocuments({ shirtId })).toBe(2);
  });

  it.each(["FREE", "IN_AUCTION"])("RN-C04: recusa transferir camisa %s, sem mudar nada", async (state) => {
    const shirtId = await aShirt({ state });

    await expect(sellTo(shirtId)).rejects.toMatchObject({ kind: "conflict", code: "invalid_transition" });
    expect(await ShirtModel.findById(shirtId).lean()).toMatchObject({ ownerId: sellerId, state, version: 0 });
  });

  it.each([newId(), "abc"])("recusa a camisa inexistente %s com shirt_not_found", async (shirtId) => {
    await expect(sellTo(shirtId)).rejects.toMatchObject({ kind: "not_found", code: "shirt_not_found" });
  });

  it("duas transferências simultâneas: só uma vence e a procedência ganha uma entrada", async () => {
    const { shirtId } = await aReservedShirtOnSale();

    const results = await Promise.allSettled([sellTo(shirtId), sellTo(shirtId)]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await ShirtModel.findById(shirtId).lean())?.ownerHistory).toHaveLength(2);
  });
});
