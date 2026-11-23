import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { getActiveSaleListing, getShirts } from "../../../src/modules/catalog";
import { ListingModel } from "../../../src/modules/catalog/listing.model";
import { ShirtModel } from "../../../src/modules/catalog/shirt.model";
import { useTestDatabase } from "../../helpers/database";

const ownerId = new Types.ObjectId();

function aShirt(overrides: Record<string, unknown> = {}) {
  return ShirtModel.create({
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
}

function aListing(shirtId: Types.ObjectId, overrides: Record<string, unknown> = {}) {
  return ListingModel.create({
    shirtId,
    sellerId: ownerId,
    type: "SALE",
    priceCents: 35000,
    snapshot: { condition: "Nova com etiqueta" },
    ...overrides,
  });
}

describe("catalog: leitura para outros módulos", () => {
  useTestDatabase();

  describe("getShirts", () => {
    it("devolve as camisas com ids em texto", async () => {
      const shirt = await aShirt({ photos: ["https://exemplo.com/sao-paulo-2005.jpg"] });

      expect(await getShirts([String(shirt._id)])).toEqual([
        {
          id: String(shirt._id),
          ownerId: String(ownerId),
          team: "São Paulo",
          season: "2005",
          size: "M",
          condition: "Nova com etiqueta",
          photos: ["https://exemplo.com/sao-paulo-2005.jpg"],
          openToTrade: true,
          state: "FREE",
        },
      ]);
    });

    it("devolve na ordem pedida", async () => {
      const first = await aShirt({ season: "2005" });
      const second = await aShirt({ season: "2006" });

      const result = await getShirts([String(second._id), String(first._id)]);

      expect(result.map((shirt) => shirt.season)).toEqual(["2006", "2005"]);
    });

    it("lista vazia devolve lista vazia", async () => {
      expect(await getShirts([])).toEqual([]);
    });

    it("recusa com shirt_not_found e lista os ids que faltam", async () => {
      const shirt = await aShirt();
      const missing = new Types.ObjectId().toHexString();

      await expect(getShirts([String(shirt._id), missing])).rejects.toMatchObject({
        kind: "not_found",
        code: "shirt_not_found",
        details: { ids: [missing] },
      });
    });

    it("id em formato inválido conta como camisa que falta", async () => {
      await expect(getShirts(["abc"])).rejects.toMatchObject({ code: "shirt_not_found", details: { ids: ["abc"] } });
    });
  });

  describe("getActiveSaleListing", () => {
    it("devolve id, vendedor e preço do anúncio de venda ativo", async () => {
      const shirt = await aShirt();
      const listing = await aListing(shirt._id);

      expect(await getActiveSaleListing(String(shirt._id))).toEqual({
        id: String(listing._id),
        sellerId: String(ownerId),
        priceCents: 35000,
      });
    });

    it("devolve null quando a camisa não tem anúncio", async () => {
      const shirt = await aShirt();

      expect(await getActiveSaleListing(String(shirt._id))).toBeNull();
    });

    it.each([
      ["reservado", { status: "RESERVED" }],
      ["retirado", { status: "WITHDRAWN", open: false }],
      ["fechado", { status: "CLOSED", open: false, outcome: "SOLD" }],
      ["de leilão", { type: "AUCTION", priceCents: undefined }],
    ])("ignora anúncio %s", async (_case, overrides) => {
      const shirt = await aShirt();
      await aListing(shirt._id, overrides);

      expect(await getActiveSaleListing(String(shirt._id))).toBeNull();
    });

    it("id em formato inválido devolve null", async () => {
      expect(await getActiveSaleListing("abc")).toBeNull();
    });
  });
});
