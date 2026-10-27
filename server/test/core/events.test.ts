import { afterEach, describe, expect, it } from "vitest";
import { fixedClock, setClock } from "../../src/core/clock";
import { currentSession } from "../../src/core/database/context";
import { runInTransaction } from "../../src/core/database/transaction";
import { clearSubscriptions, dispatchPendingEvents, subscribe } from "../../src/core/events/dispatcher";
import { DomainEventModel } from "../../src/core/events/domain-event.model";
import { publish } from "../../src/core/events/publisher";
import { useTestDatabase } from "../helpers/database";
import { TestItemModel } from "../helpers/test-item";

const itemReserved = { type: "ITEM_RESERVED", payload: { code: "A" } };
const publishOne = () => runInTransaction(() => publish([itemReserved]));

describe("eventos", () => {
  useTestDatabase();
  afterEach(() => clearSubscriptions());

  describe("publish", () => {
    it("recusa publicar fora de transação", async () => {
      await expect(publish([itemReserved])).rejects.toThrow(/runInTransaction/);
      expect(await DomainEventModel.countDocuments()).toBe(0);
    });

    it("grava o evento como pending, com a hora do relógio", async () => {
      setClock(fixedClock("2026-10-22T12:00:00Z"));

      await publishOne();

      const event = await DomainEventModel.findOne().lean();
      expect(event).toMatchObject({ type: "ITEM_RESERVED", payload: { code: "A" }, status: "PENDING", attempts: 0 });
      expect(event?.occurredAt.toISOString()).toBe("2026-10-22T12:00:00.000Z");
    });

    it("se a transação falha, o evento some junto com o que foi gravado", async () => {
      await expect(
        runInTransaction(async () => {
          await TestItemModel.create([{ code: "X" }], { session: currentSession() });
          await publish([itemReserved]);
          throw new Error("falhou");
        })
      ).rejects.toThrow("falhou");

      expect(await DomainEventModel.countDocuments()).toBe(0);
      expect(await TestItemModel.countDocuments()).toBe(0);
    });

    it("lista vazia não faz nada, nem fora de transação", async () => {
      await expect(publish([])).resolves.toBeUndefined();
      expect(await DomainEventModel.countDocuments()).toBe(0);
    });

    it("vários eventos de uma vez ficam com a mesma hora", async () => {
      setClock(fixedClock("2026-10-22T12:00:00Z"));

      await runInTransaction(() =>
        publish([
          { type: "A", payload: {} },
          { type: "B", payload: { n: 1 } },
        ])
      );

      const events = await DomainEventModel.find().sort({ type: 1 }).lean();
      expect(events.map((event) => event.type)).toEqual(["A", "B"]);
      expect(new Set(events.map((event) => event.occurredAt.toISOString())).size).toBe(1);
    });

    it("evento publicado numa transação aninhada sai junto com a externa", async () => {
      await expect(
        runInTransaction(async () => {
          await runInTransaction(() => publish([itemReserved]));
          throw new Error("falhou depois");
        })
      ).rejects.toThrow("falhou depois");

      expect(await DomainEventModel.countDocuments()).toBe(0);
    });
  });

  describe("dispatchPendingEvents", () => {
    it("chama cada handler inscrito e marca o evento como PROCESSED", async () => {
      const seen: string[] = [];
      subscribe("ITEM_RESERVED", "a", async (event) => void seen.push(`a:${event.payload.code}`));
      subscribe("ITEM_RESERVED", "b", async (event) => void seen.push(`b:${event.payload.code}`));
      await publishOne();

      expect(await dispatchPendingEvents()).toEqual({ processed: 1, failed: 0 });
      expect(seen).toEqual(["a:A", "b:A"]);
      expect(await DomainEventModel.findOne().lean()).toMatchObject({ status: "PROCESSED", handledBy: ["a", "b"] });
    });

    it("o handler recebe o evento com id em texto, tipo, payload e hora", async () => {
      setClock(fixedClock("2026-10-22T12:00:00Z"));
      let received: unknown;
      subscribe("ITEM_RESERVED", "a", async (event) => void (received = event));
      await publishOne();

      await dispatchPendingEvents();

      const stored = await DomainEventModel.findOne().lean();
      expect(received).toEqual({
        id: String(stored?._id),
        type: "ITEM_RESERVED",
        payload: { code: "A" },
        occurredAt: new Date("2026-10-22T12:00:00Z"),
      });
    });

    it("três dispatches simultâneos não repetem o handler", async () => {
      let calls = 0;
      subscribe("ITEM_RESERVED", "counter", async () => void calls++);
      await publishOne();

      await Promise.all([dispatchPendingEvents(), dispatchPendingEvents(), dispatchPendingEvents()]);
      await dispatchPendingEvents();

      expect(calls).toBe(1);
    });

    it("handler que grava e depois falha", async () => {
      subscribe("ITEM_RESERVED", "falha", async () => {
        await TestItemModel.create([{ code: "EFEITO" }], { session: currentSession() });
        throw new Error("quebrou");
      });
      await publishOne();

      expect(await dispatchPendingEvents()).toEqual({ processed: 0, failed: 1 });
      expect(await TestItemModel.countDocuments()).toBe(0);
      expect(await DomainEventModel.findOne().lean()).toMatchObject({
        status: "PENDING",
        attempts: 1,
        handledBy: [],
        lastError: "quebrou",
      });
    });

    it("depois da falha e da correção o efeito acontece", async () => {
      let shouldFail = true;
      let effects = 0;
      subscribe("ITEM_RESERVED", "instavel", async () => {
        if (shouldFail) throw new Error("falhou");
        effects++;
      });
      await publishOne();

      await dispatchPendingEvents();
      shouldFail = false;
      await dispatchPendingEvents();

      expect(effects).toBe(1);
    });

    it("depois do máximo de tentativas o evento vira FAILED", async () => {
      subscribe("ITEM_RESERVED", "sempre", async () => {
        throw new Error("sempre");
      });
      await publishOne();

      for (let i = 0; i < 3; i++) await dispatchPendingEvents({ maxAttempts: 3 });

      expect(await DomainEventModel.findOne().lean()).toMatchObject({ status: "FAILED", attempts: 3 });
    });

    it("evento FAILED não é despachado de novo", async () => {
      let calls = 0;
      subscribe("ITEM_RESERVED", "sempre", async () => {
        calls++;
        throw new Error("sempre");
      });
      await publishOne();
      for (let i = 0; i < 2; i++) await dispatchPendingEvents({ maxAttempts: 2 });

      await dispatchPendingEvents({ maxAttempts: 2 });

      expect(calls).toBe(2);
    });

    it("o que já rodou não roda de novo", async () => {
      let okCalls = 0;
      let shouldFail = true;
      subscribe("ITEM_RESERVED", "ok", async () => void okCalls++);
      subscribe("ITEM_RESERVED", "instavel", async () => {
        if (shouldFail) throw new Error("instável");
      });
      await publishOne();

      await dispatchPendingEvents();
      shouldFail = false;
      await dispatchPendingEvents();

      expect(okCalls).toBe(1);
      expect(await DomainEventModel.findOne().lean()).toMatchObject({ status: "PROCESSED" });
    });

    it("evento sem handler é marcado como PROCESSED", async () => {
      await publishOne();

      expect(await dispatchPendingEvents()).toEqual({ processed: 1, failed: 0 });
    });

    it("evento publicado por um handler fica pendente para o próximo despacho", async () => {
      subscribe("ITEM_RESERVED", "cascata", async () => {
        await publish([{ type: "OUTRO", payload: {} }]);
      });
      await publishOne();

      await dispatchPendingEvents();

      const events = await DomainEventModel.find().sort({ occurredAt: 1 }).lean();
      expect(events.map((event) => `${event.type}:${event.status}`)).toEqual([
        "ITEM_RESERVED:PROCESSED",
        "OUTRO:PENDING",
      ]);
    });

    it("processa na ordem do occurredAt", async () => {
      const clock = fixedClock("2026-01-01T00:00:00Z");
      setClock(clock);
      await runInTransaction(() => publish([{ type: "T", payload: { n: 2 } }]));
      clock.advance(-60_000);
      await runInTransaction(() => publish([{ type: "T", payload: { n: 1 } }]));

      const order: number[] = [];
      subscribe("T", "h", async (event) => void order.push(event.payload.n as number));
      await dispatchPendingEvents();

      expect(order).toEqual([1, 2]);
    });

    it("respeita o limite", async () => {
      for (let i = 0; i < 3; i++) await publishOne();

      expect(await dispatchPendingEvents({ limit: 2 })).toEqual({ processed: 2, failed: 0 });
      expect(await DomainEventModel.countDocuments({ status: "PENDING" })).toBe(1);
    });

    it("um evento com falha não impede os outros de serem processados", async () => {
      subscribe("RUIM", "falha", async () => {
        throw new Error("x");
      });
      subscribe("BOM", "ok", async () => {});
      await runInTransaction(() => publish([{ type: "RUIM", payload: {} }]));
      await runInTransaction(() => publish([{ type: "BOM", payload: {} }]));

      expect(await dispatchPendingEvents()).toEqual({ processed: 1, failed: 1 });
    });
  });
});
