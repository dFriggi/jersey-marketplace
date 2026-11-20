import { Types } from "mongoose";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/app";
import { ListingModel } from "../../../src/modules/catalog/listing.model";
import { ShirtModel } from "../../../src/modules/catalog/shirt.model";
import { useTestDatabase } from "../../helpers/database";

const app = createApp();
const sellerId = new Types.ObjectId();

async function aShirt(overrides: Record<string, unknown> = {}) {
  return ShirtModel.create({
    ownerId: sellerId,
    team: "São Paulo",
    country: "Brasil",
    league: "Brasileirão",
    season: "2005",
    kind: "HOME",
    edition: "FAN",
    size: "M",
    condition: "Nova com etiqueta",
    openToTrade: false,
    ...overrides,
  });
}

// camisa com anúncio de venda; createdAt controla a ordem da vitrine
async function onSale(shirtOverrides: Record<string, unknown> = {}, listingOverrides: Record<string, unknown> = {}) {
  const shirt = await aShirt(shirtOverrides);
  const listing = await ListingModel.create({
    shirtId: shirt._id,
    sellerId,
    type: "SALE",
    priceCents: 35000,
    snapshot: { condition: "Usada, sem defeitos", photos: ["https://exemplo.com/foto.jpg"] },
    ...listingOverrides,
  });
  return { shirt, listing };
}

const showcase = (query = "") => request(app).get(`/listings${query}`);

describe("GET /listings (vitrine)", () => {
  useTestDatabase();

  it("responde 200 sem login, com o anúncio e os dados da camisa", async () => {
    const { shirt, listing } = await onSale();

    const response = await showcase();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      docs: [
        {
          id: String(listing._id),
          shirtId: String(shirt._id),
          sellerId: String(sellerId),
          priceCents: 35000,
          team: "São Paulo",
          season: "2005",
          size: "M",
          condition: "Usada, sem defeitos",
          photos: ["https://exemplo.com/foto.jpg"],
          createdAt: expect.any(String),
        },
      ],
      total: 1,
      page: 1,
      size: 20,
    });
  });

  it("mostra os mais novos primeiro", async () => {
    await onSale({ season: "2005" }, { createdAt: new Date("2026-11-01T00:00:00Z") });
    await onSale({ season: "2006" }, { createdAt: new Date("2026-11-10T00:00:00Z") });

    const { body } = await showcase();

    expect(body.docs.map((item: { season: string }) => item.season)).toEqual(["2006", "2005"]);
  });

  it.each([
    ["reservado", { status: "RESERVED" }],
    ["retirado", { status: "WITHDRAWN", open: false }],
    ["vendido", { status: "CLOSED", open: false, outcome: "SOLD" }],
    ["de leilão", { type: "AUCTION", priceCents: undefined }],
  ])("não mostra anúncio %s", async (_case, overrides) => {
    await onSale({}, overrides);

    const { body } = await showcase();

    expect(body).toMatchObject({ docs: [], total: 0 });
  });

  it("filtra por time sem diferenciar maiúsculas e por tamanho", async () => {
    await onSale({ team: "São Paulo", size: "M" });
    await onSale({ team: "São Paulo", size: "G" });
    await onSale({ team: "Santos", size: "M" });

    const byTeam = await showcase("?team=s%C3%A3o%20paulo");
    const byTeamAndSize = await showcase("?team=S%C3%A3o%20Paulo&size=G");

    expect(byTeam.body.total).toBe(2);
    expect(byTeamAndSize.body.docs.map((item: { size: string }) => item.size)).toEqual(["G"]);
  });

  it("time é comparado por inteiro: 'São' não encontra 'São Paulo'", async () => {
    await onSale({ team: "São Paulo" });

    const { body } = await showcase("?team=S%C3%A3o");

    expect(body.total).toBe(0);
  });

  it("filtro vazio conta como sem filtro", async () => {
    await onSale();

    const { body } = await showcase("?team=&size=%20");

    expect(body.total).toBe(1);
  });

  it("pagina os resultados", async () => {
    for (let season = 2001; season <= 2005; season++) {
      await onSale({ season: String(season) }, { createdAt: new Date(`${season}-01-01T00:00:00Z`) });
    }

    const { body } = await showcase("?page=2&pageSize=2");

    expect(body).toMatchObject({ total: 5, page: 2, size: 2 });
    expect(body.docs.map((item: { season: string }) => item.season)).toEqual(["2003", "2002"]);
  });

  it.each(["?page=0", "?pageSize=51", "?page=abc"])("recusa %s com 400", async (query) => {
    const response = await showcase(query);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_input");
  });
});
