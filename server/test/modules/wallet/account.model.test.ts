import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { AccountModel } from "../../../src/modules/wallet/account.model";
import { useTestDatabase } from "../../helpers/database";

describe("model de carteira (accounts)", () => {
  useTestDatabase();

  it("o syncIndexes cria o índice único por usuário", async () => {
    const indexes = await AccountModel.collection.indexes();
    const userIndex = indexes.find((index) => index.name === "userId_1");

    expect(userIndex).toMatchObject({ unique: true });
  });

  it("recusa uma segunda carteira para o mesmo usuário", async () => {
    const userId = new Types.ObjectId();
    await AccountModel.create({ userId });

    await expect(AccountModel.create({ userId })).rejects.toMatchObject({ code: 11000 });
  });

  it("uma carteira nova começa zerada e na versão 0", async () => {
    const account = await AccountModel.create({ userId: new Types.ObjectId() });

    expect(account.toObject()).toMatchObject({ availableCents: 0, heldCents: 0, version: 0 });
  });

  it.each([
    ["availableCents", -1],
    ["availableCents", 10.5],
    ["heldCents", -1],
    ["heldCents", 10.5],
  ])("recusa %s = %s", async (field, value) => {
    await expect(AccountModel.create({ userId: new Types.ObjectId(), [field]: value })).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  it("userId é obrigatório", async () => {
    await expect(AccountModel.create({})).rejects.toMatchObject({ name: "ValidationError" });
  });
});
