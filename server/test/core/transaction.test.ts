import { describe, expect, it } from "vitest";
import { currentSession } from "../../src/core/database/context";
import { runInTransaction } from "../../src/core/database/transaction";
import { useTestDatabase } from "../helpers/database";
import { TestItemModel } from "../helpers/test-item";

async function createItem(code: string) {
  await TestItemModel.create([{ code }], { session: currentSession() });
}

describe("runInTransaction", () => {
  useTestDatabase();

  it("confirma tudo quando a função termina sem erro", async () => {
    await runInTransaction(async () => {
      await createItem("A");
      await createItem("B");
    });

    expect(await TestItemModel.countDocuments()).toBe(2);
  });

  it("desfaz tudo (rollback) quando a função lança erro no meio", async () => {
    await expect(
      runInTransaction(async () => {
        await createItem("A");
        await createItem("B");
        throw new Error("falhou no meio");
      })
    ).rejects.toThrow("falhou no meio");

    expect(await TestItemModel.countDocuments()).toBe(0);
  });

  it("devolve o resultado da função", async () => {
    const result = await runInTransaction(async () => 42);

    expect(result).toBe(42);
  });

  it("reaproveita a transação externa em chamadas aninhadas", async () => {
    let outer: unknown;
    let inner: unknown;

    await runInTransaction(async () => {
      outer = currentSession();
      await runInTransaction(async () => {
        inner = currentSession();
      });
    });

    expect(outer).toBeDefined();
    expect(inner).toBe(outer);
  });

  it("um erro na chamada aninhada desfaz também o que a externa gravou", async () => {
    await expect(
      runInTransaction(async () => {
        await createItem("externo");
        await runInTransaction(async () => {
          await createItem("interno");
          throw new Error("falhou no aninhado");
        });
      })
    ).rejects.toThrow("falhou no aninhado");

    expect(await TestItemModel.countDocuments()).toBe(0);
  });

  it("a leitura dentro da transação enxerga a própria escrita", async () => {
    await runInTransaction(async () => {
      await createItem("A");

      const found = await TestItemModel.findOne({ code: "A" }).session(currentSession() ?? null);
      expect(found).not.toBeNull();
    });
  });

  it("fora da transação não há sessão", async () => {
    await runInTransaction(async () => {});

    expect(currentSession()).toBeUndefined();
  });
});
