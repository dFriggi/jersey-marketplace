import { describe, expect, it } from "vitest";
import { runInTransaction } from "../../src/core/database/transaction";
import { DomainError } from "../../src/core/errors";
import { BaseRepository, type DatabaseDoc } from "../../src/core/repository/base.repository";
import { useTestDatabase } from "../helpers/database";
import { TestItemModel, type TestItemDoc } from "../helpers/test-item";

interface TestItem {
  id: string;
  code: string;
  state: "FREE" | "RESERVED";
  open: boolean;
  version: number;
}

class TestItemRepository extends BaseRepository<TestItemDoc, TestItem> {
  constructor() {
    super(TestItemModel);
  }

  protected toEntity(doc: DatabaseDoc<TestItemDoc>): TestItem {
    return { id: String(doc._id), code: doc.code, state: doc.state, open: doc.open, version: doc.version };
  }

  create(code: string | undefined) {
    return this.insert({ code } as Partial<TestItemDoc>);
  }

  reserveIfFree(id: string) {
    return this.compareAndSet({ _id: id, state: "FREE" }, { $set: { state: "RESERVED" }, $inc: { version: 1 } });
  }

  rename(id: string, code: string) {
    return this.compareAndSet({ _id: id }, { $set: { code } });
  }

  listByCodeDesc() {
    return this.list({}, { sort: { code: -1 } });
  }

  page(page: number, size: number) {
    return this.paginate({}, { page, size, sort: { code: 1 } });
  }

  pageWithoutSort(page: number, size: number) {
    return this.paginate({}, { page, size });
  }
}

const repository = new TestItemRepository();

describe("BaseRepository", () => {
  useTestDatabase();

  describe("leitura", () => {
    it("devolve a entidade com id em texto", async () => {
      const created = await repository.create("A");
      const found = await repository.findById(created.id);

      expect(found).toEqual(created);
      expect(found).not.toHaveProperty("_id");
      expect(typeof found?.id).toBe("string");
    });

    it("findById com id malformado devolve null", async () => {
      expect(await repository.findById("lixo")).toBeNull();
    });

    it("findById com id válido que não existe devolve null", async () => {
      expect(await repository.findById("64b000000000000000000000")).toBeNull();
    });

    it("findByIdOrFail lança erro de domínio not_found", async () => {
      const error = await repository.findByIdOrFail("64b000000000000000000000").catch((e) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({ kind: "not_found", code: "testitem_not_found" });
    });

    it("findByIds ignora ids inválidos e inexistentes", async () => {
      const a = await repository.create("A");
      const b = await repository.create("B");

      const found = await repository.findByIds([a.id, "lixo", b.id, "64b000000000000000000000"]);

      expect(found.map((item) => item.code).sort()).toEqual(["A", "B"]);
      expect(await repository.findByIds([])).toEqual([]);
    });

    it("count conta com e sem filtro", async () => {
      await repository.create("A");
      await repository.create("B");

      expect(await repository.count()).toBe(2);
      expect(await repository.count({ code: "A" })).toBe(1);
    });

    it("list respeita a ordenação pedida", async () => {
      for (const code of ["A", "C", "B"]) await repository.create(code);

      expect((await repository.listByCodeDesc()).map((item) => item.code)).toEqual(["C", "B", "A"]);
    });

    it("paginate devolve { docs, total, page, size }", async () => {
      for (const code of ["A", "B", "C", "D", "E"]) await repository.create(code);

      const page = await repository.page(2, 2);

      expect(page).toMatchObject({ total: 5, page: 2, size: 2 });
      expect(page.docs.map((item) => item.code)).toEqual(["C", "D"]);
    });

    it("paginate sem sort ordena por _id", async () => {
      await TestItemModel.create({ _id: "000000000000000000000003", code: "A" });
      await TestItemModel.create({ _id: "000000000000000000000001", code: "B" });
      await TestItemModel.create({ _id: "000000000000000000000002", code: "C" });

      const page = await repository.pageWithoutSort(1, 3);

      expect(page.docs.map((item) => item.code)).toEqual(["B", "C", "A"]);
    });
  });

  describe("compareAndSet", () => {
    it("a primeira reserva vence e a segunda devolve null", async () => {
      const item = await repository.create("A");

      expect(await repository.reserveIfFree(item.id)).toMatchObject({ state: "RESERVED", version: 1 });
      expect(await repository.reserveIfFree(item.id)).toBeNull();
    });

    it("uma única reserva vence dentre 10 reservas simultâneas em transação", async () => {
      const item = await repository.create("U");

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => runInTransaction(() => repository.reserveIfFree(item.id)))
      );

      const winners = results.filter((result) => result.status === "fulfilled" && result.value !== null);
      const losers = results.filter((result) => result.status === "fulfilled" && result.value === null);
      const failures = results.filter((result) => result.status === "rejected");

      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(9);
      expect(failures).toHaveLength(0);
      expect(await repository.findById(item.id)).toMatchObject({ state: "RESERVED", version: 1 });
    });
  });

  describe("tradução de erros", () => {
    it("insert duplicado vira erro de domínio conflict", async () => {
      await repository.create("A");

      const error = await repository.create("A").catch((e) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({ kind: "conflict", code: "duplicate_code", details: { code: "A" } });
    });

    it("compareAndSet que viola o índice vira conflict", async () => {
      await repository.create("A");
      const b = await repository.create("B");

      const error = await repository.rename(b.id, "A").catch((e) => e);

      expect(error).toMatchObject({ kind: "conflict", code: "duplicate_code" });
    });

    it("outros erros passam sem tradução", async () => {
      const error = await repository.create(undefined).catch((e) => e);

      expect(error).not.toBeInstanceOf(DomainError);
      expect(error.name).toBe("ValidationError");
    });
  });

  describe("sessão da transação", () => {
    it("insert dentro de uma transação que falha é desfeito", async () => {
      await expect(
        runInTransaction(async () => {
          await repository.create("T");
          throw new Error("falhou");
        })
      ).rejects.toThrow("falhou");

      expect(await TestItemModel.countDocuments({ code: "T" })).toBe(0);
    });

    it("compareAndSet dentro de uma transação que falha é desfeito", async () => {
      const item = await repository.create("R");

      await expect(
        runInTransaction(async () => {
          await repository.reserveIfFree(item.id);
          throw new Error("falhou");
        })
      ).rejects.toThrow("falhou");

      expect(await repository.findById(item.id)).toMatchObject({ state: "FREE", version: 0 });
    });

    it("a leitura dentro da transação enxerga a própria escrita", async () => {
      await runInTransaction(async () => {
        const created = await repository.create("L");

        expect(await repository.findById(created.id)).toEqual(created);
        expect(await repository.findByIds([created.id])).toHaveLength(1);
        expect(await repository.count({ code: "L" })).toBe(1);
        expect((await repository.listByCodeDesc()).map((item) => item.code)).toEqual(["L"]);
      });
    });

    it("duplicado dentro da transação chega traduzido e desfaz o que veio antes", async () => {
      await repository.create("existente");

      const error = await runInTransaction(async () => {
        await repository.create("novo");
        await repository.create("existente");
      }).catch((e) => e);

      expect(error).toMatchObject({ kind: "conflict", code: "duplicate_code" });
      expect(await TestItemModel.countDocuments({ code: "novo" })).toBe(0);
    });
  });
});
