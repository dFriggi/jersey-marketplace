import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { releaseShirts, reserveShirts } from "../../../src/modules/catalog";
import { ListingModel } from "../../../src/modules/catalog/listing.model";
import { ShirtModel } from "../../../src/modules/catalog/shirt.model";
import { useTestDatabase } from "../../helpers/database";

const ownerId = new Types.ObjectId();
const owner = ownerId.toHexString();

async function aShirt(overrides: Record<string, unknown> = {}) {
  const shirt = await ShirtModel.create({
    ownerId,
    team: "São Paulo",
    country: "Brasil",
    league: "Brasileirão",
    season: "2005",
    kind: "HOME",
    edition: "FAN",
    size: "M",
    condition: "Nova com etiqueta",
    openToTrade: true,
    ...overrides,
  });
  return shirt._id.toHexString();
}

async function aListing(shirtId: string, overrides: Record<string, unknown> = {}) {
  const listing = await ListingModel.create({
    shirtId: new Types.ObjectId(shirtId),
    sellerId: ownerId,
    type: "SALE",
    priceCents: 35000,
    snapshot: { condition: "Nova com etiqueta" },
    ...overrides,
  });
  return listing._id;
}

const stateOf = async (shirtId: string) => (await ShirtModel.findById(shirtId).lean())?.state;
const statusOf = async (listingId: Types.ObjectId) => (await ListingModel.findById(listingId).lean())?.status;

describe("catalog: reserva de camisas", () => {
  useTestDatabase();

  describe("reserveShirts", () => {
    it("RN-C01: camisa FREE do dono informado vai para RESERVED e a versão sobe", async () => {
      const shirtId = await aShirt();

      await reserveShirts([{ shirtId, ownerId: owner }]);

      expect(await ShirtModel.findById(shirtId).lean()).toMatchObject({ state: "RESERVED", version: 1 });
    });

    it("o anúncio ACTIVE da camisa vai junto para RESERVED", async () => {
      const shirtId = await aShirt();
      const listingId = await aListing(shirtId);

      await reserveShirts([{ shirtId, ownerId: owner }]);

      expect(await statusOf(listingId)).toBe("RESERVED");
    });

    it("camisa sem anúncio também é reservada (troca)", async () => {
      const shirtId = await aShirt();

      await reserveShirts([{ shirtId, ownerId: owner }]);

      expect(await ListingModel.countDocuments()).toBe(0);
      expect(await stateOf(shirtId)).toBe("RESERVED");
    });

    it.each([
      ["já reservada", { state: "RESERVED" }],
      ["em leilão", { state: "IN_AUCTION" }],
    ])("RN-C01: recusa camisa %s com shirt_unavailable", async (_case, overrides) => {
      const shirtId = await aShirt(overrides);

      await expect(reserveShirts([{ shirtId, ownerId: owner }])).rejects.toMatchObject({
        kind: "conflict",
        code: "shirt_unavailable",
        details: { shirtId },
      });
    });

    it("RN-C01: recusa quando a camisa mudou de dono", async () => {
      const shirtId = await aShirt();
      const someoneElse = new Types.ObjectId().toHexString();

      await expect(reserveShirts([{ shirtId, ownerId: someoneElse }])).rejects.toMatchObject({
        code: "shirt_unavailable",
      });
      expect(await stateOf(shirtId)).toBe("FREE");
    });

    it.each([new Types.ObjectId().toHexString(), "abc"])("recusa a camisa inexistente %s", async (id) => {
      await expect(reserveShirts([{ shirtId: id, ownerId: owner }])).rejects.toMatchObject({
        code: "shirt_unavailable",
        details: { shirtId: id },
      });
    });

    it("RN-C02: se uma camisa falha, nenhuma fica reservada, nem os anúncios", async () => {
      const first = await aShirt();
      const listingId = await aListing(first);
      const taken = await aShirt({ state: "RESERVED" });

      await expect(
        reserveShirts([
          { shirtId: first, ownerId: owner },
          { shirtId: taken, ownerId: owner },
        ])
      ).rejects.toMatchObject({ code: "shirt_unavailable", details: { shirtId: taken } });

      expect(await stateOf(first)).toBe("FREE");
      expect(await statusOf(listingId)).toBe("ACTIVE");
    });

    it("lista vazia não faz nada", async () => {
      await expect(reserveShirts([])).resolves.toBeUndefined();
    });
  });

  describe("releaseShirts", () => {
    it("RN-C03: camisa RESERVED volta a FREE e o anúncio volta a ACTIVE", async () => {
      const shirtId = await aShirt();
      const listingId = await aListing(shirtId);
      await reserveShirts([{ shirtId, ownerId: owner }]);

      await releaseShirts([shirtId]);

      expect(await ShirtModel.findById(shirtId).lean()).toMatchObject({ state: "FREE", version: 2 });
      expect(await statusOf(listingId)).toBe("ACTIVE");
    });

    it("RN-C03: recusa liberar camisa FREE com invalid_transition, sem liberar as outras", async () => {
      const reserved = await aShirt({ state: "RESERVED" });
      const free = await aShirt();

      await expect(releaseShirts([reserved, free])).rejects.toMatchObject({
        kind: "conflict",
        code: "invalid_transition",
        details: { entity: "shirt", from: "FREE", to: "FREE" },
      });
      expect(await stateOf(reserved)).toBe("RESERVED");
    });

    it("recusa camisa que não existe com shirt_not_found", async () => {
      const missing = new Types.ObjectId().toHexString();

      await expect(releaseShirts([missing])).rejects.toMatchObject({ kind: "not_found", code: "shirt_not_found" });
    });
  });

  describe("concorrência", () => {
    it("10 reservas simultâneas da mesma camisa: só 1 vence e 9 recebem shirt_unavailable", async () => {
      const shirtId = await aShirt();
      const listingId = await aListing(shirtId);

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => reserveShirts([{ shirtId, ownerId: owner }]))
      );

      const refused = results.filter((result) => result.status === "rejected");
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(refused).toHaveLength(9);
      for (const result of refused) {
        expect(result.reason).toMatchObject({ code: "shirt_unavailable" });
      }
      expect(await ShirtModel.findById(shirtId).lean()).toMatchObject({ state: "RESERVED", version: 1 });
      expect(await statusOf(listingId)).toBe("RESERVED");
    });

    it("duas reservas simultâneas com uma camisa em comum: só uma vence e a outra não prende nada", async () => {
      const a = await aShirt();
      const shared = await aShirt();
      const c = await aShirt();

      const results = await Promise.allSettled([
        reserveShirts([
          { shirtId: a, ownerId: owner },
          { shirtId: shared, ownerId: owner },
        ]),
        reserveShirts([
          { shirtId: shared, ownerId: owner },
          { shirtId: c, ownerId: owner },
        ]),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const reservedCount = await ShirtModel.countDocuments({ state: "RESERVED" });
      expect(reservedCount).toBe(2);
      expect(await stateOf(shared)).toBe("RESERVED");
    });
  });
});
