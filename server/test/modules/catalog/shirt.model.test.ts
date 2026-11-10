import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { ShirtModel } from "../../../src/modules/catalog/shirt.model";
import { useTestDatabase } from "../../helpers/database";

function aShirt(overrides: Record<string, unknown> = {}) {
  return {
    ownerId: new Types.ObjectId(),
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
  };
}

describe("model de camisa (shirts)", () => {
  useTestDatabase();

  it("o syncIndexes cria o índice do acervo e o de busca de trocas", async () => {
    const keys = (await ShirtModel.collection.indexes()).map((index) => index.key);

    expect(keys).toContainEqual({ ownerId: 1 });
    expect(keys).toContainEqual({ openToTrade: 1, state: 1, team: 1, size: 1 });
  });

  it("uma camisa nova começa livre, na versão 0 e com as datas preenchidas", async () => {
    const shirt = await ShirtModel.create(aShirt());

    expect(shirt.toObject()).toMatchObject({ state: "FREE", version: 0, photos: [], ownerHistory: [] });
    expect(shirt.createdAt).toBeInstanceOf(Date);
    expect(shirt.updatedAt).toBeInstanceOf(Date);
  });

  it("o histórico de donos é guardado sem _id", async () => {
    const userId = new Types.ObjectId();
    const { _id } = await ShirtModel.create(
      aShirt({ ownerHistory: [{ userId, acquiredAt: new Date("2026-01-01T00:00:00Z"), via: "REGISTERED" }] })
    );

    const stored = await ShirtModel.findById(_id).lean();

    expect(stored?.ownerHistory).toEqual([{ userId, acquiredAt: new Date("2026-01-01T00:00:00Z"), via: "REGISTERED" }]);
  });

  it("openToTrade é obrigatório, porque o dono decide no cadastro", async () => {
    await expect(ShirtModel.create(aShirt({ openToTrade: undefined }))).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  it.each([
    ["state", "SOLD"],
    ["kind", "RETRO"],
    ["edition", "REPLICA"],
  ])("recusa %s fora da lista (%s)", async (field, value) => {
    await expect(ShirtModel.create(aShirt({ [field]: value }))).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("recusa uma entrada de histórico com via inválida", async () => {
    const entry = { userId: new Types.ObjectId(), acquiredAt: new Date("2026-01-01T00:00:00Z"), via: "PRESENTE" };

    await expect(ShirtModel.create(aShirt({ ownerHistory: [entry] }))).rejects.toMatchObject({
      name: "ValidationError",
    });
  });
});
