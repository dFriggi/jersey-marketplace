import { describe, expect, it } from "vitest";
import { currentSession } from "../../src/core/database/context";
import { syncIndexes } from "../../src/core/database/sync-indexes";
import { runInTransaction } from "../../src/core/database/transaction";
import { useTestDatabase } from "../helpers/database";
import { TestItemModel } from "../helpers/test-item";

async function createItem(code: string) {
  await TestItemModel.create([{ code }], { session: currentSession() });
}

describe("índices e garantias do banco", () => {
  useTestDatabase();

  it("o syncIndexes cria o índice único parcial no banco", async () => {
    const indexes = await TestItemModel.collection.indexes();
    const codeIndex = indexes.find((index) => index.name === "code_1");

    expect(codeIndex).toMatchObject({ unique: true, partialFilterExpression: { open: true } });
  });

  it("recusa dois itens abertos com o mesmo code", async () => {
    await TestItemModel.create({ code: "A" });

    await expect(TestItemModel.create({ code: "A" })).rejects.toMatchObject({ code: 11000 });
  });

  it("aceita o mesmo code de novo depois de o primeiro ser fechado", async () => {
    await TestItemModel.create({ code: "A" });
    await TestItemModel.updateOne({ code: "A" }, { open: false });

    await expect(TestItemModel.create({ code: "A" })).resolves.toMatchObject({ code: "A", open: true });
    expect(await TestItemModel.countDocuments({ code: "A" })).toBe(2);
  });

  it("chave duplicada dentro da transação desfaz o que veio antes", async () => {
    await TestItemModel.create({ code: "existente" });

    await expect(
      runInTransaction(async () => {
        await createItem("novo");
        await createItem("existente");
      })
    ).rejects.toMatchObject({ code: 11000 });

    expect(await TestItemModel.countDocuments({ code: "novo" })).toBe(0);
  });

  it("uma única reserva vence dentre 10 reservas simultâneas do mesmo item", async () => {
    const item = await TestItemModel.create({ code: "UNICA" });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        runInTransaction(() =>
          TestItemModel.findOneAndUpdate(
            { _id: item._id, state: "FREE" },
            { $set: { state: "RESERVED" }, $inc: { version: 1 } },
            { returnDocument: "after", session: currentSession() }
          )
        )
      )
    );

    const winners = results.filter((result) => result.status === "fulfilled" && result.value !== null);
    const losers = results.filter((result) => result.status === "fulfilled" && result.value === null);
    const failures = results.filter((result) => result.status === "rejected");

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(9);
    expect(failures).toHaveLength(0);
    expect(await TestItemModel.findById(item._id)).toMatchObject({ state: "RESERVED", version: 1 });
  });

  it("chamar syncIndexes de novo não muda os índices", async () => {
    const names = async () => (await TestItemModel.collection.indexes()).map((index) => index.name).sort();
    const before = await names();

    await syncIndexes();
    await syncIndexes();

    expect(await names()).toEqual(before);
  });
});
