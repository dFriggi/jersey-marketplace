import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { WishModel } from "../../../src/modules/catalog/wish.model";
import { useTestDatabase } from "../../helpers/database";

describe("model de desejo (wishes)", () => {
  useTestDatabase();

  it("o syncIndexes cria o índice da lista de desejos do usuário", async () => {
    const keys = (await WishModel.collection.indexes()).map((index) => index.key);

    expect(keys).toContainEqual({ userId: 1, createdAt: -1 });
  });

  it("grava um desejo com os critérios informados", async () => {
    const userId = new Types.ObjectId();

    const wish = await WishModel.create({
      userId,
      team: "São Paulo",
      seasonFrom: "2005",
      seasonTo: "2006",
      size: "M",
    });

    expect(wish.toObject()).toMatchObject({ userId, team: "São Paulo", seasonFrom: "2005", seasonTo: "2006" });
    expect(wish.createdAt).toBeInstanceOf(Date);
  });

  it("o mesmo usuário pode ter vários desejos", async () => {
    const userId = new Types.ObjectId();

    await WishModel.create({ userId, team: "São Paulo" });
    await WishModel.create({ userId, team: "Santos" });

    expect(await WishModel.countDocuments({ userId })).toBe(2);
  });

  it("userId é obrigatório", async () => {
    await expect(WishModel.create({ team: "São Paulo" })).rejects.toMatchObject({ name: "ValidationError" });
  });
});
