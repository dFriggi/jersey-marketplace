import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInTransaction } from "../../../src/core/database/transaction";
import { clearSubscriptions, dispatchPendingEvents } from "../../../src/core/events/dispatcher";
import { DomainEventModel } from "../../../src/core/events/domain-event.model";
import { publish } from "../../../src/core/events/publisher";
import { UserRepository } from "../../../src/modules/users/user.repository";
import { applyReputation, registerUsersHandlers } from "../../../src/modules/users/users.handlers";
import { useTestDatabase } from "../../helpers/database";

const users = new UserRepository();

const aUser = (name: string) => users.create({ name, email: `${name.toLowerCase()}@email.com`, passwordHash: "hash" });
const scoreOf = async (id: string) => (await users.findById(id))?.reputationScore;

// o deals ainda não existe, o teste publica o evento como o deals vai publicar
const dealCompleted = (payload: Record<string, unknown>) =>
  runInTransaction(() => publish([{ type: "DEAL_COMPLETED", payload }]));

describe("reputação por evento (users.applyReputation)", () => {
  useTestDatabase();
  beforeEach(() => registerUsersHandlers());
  afterEach(() => clearSubscriptions());

  it("DEAL_COMPLETED soma 5 para cada parte e o evento vira PROCESSED", async () => {
    const ana = await aUser("Ana");
    const bia = await aUser("Bia");
    await dealCompleted({ dealId: "d1", partyIds: [ana.id, bia.id] });

    expect(await dispatchPendingEvents()).toEqual({ processed: 1, failed: 0 });

    expect(await scoreOf(ana.id)).toBe(105);
    expect(await scoreOf(bia.id)).toBe(105);
    expect(await DomainEventModel.findOne().lean()).toMatchObject({
      status: "PROCESSED",
      handledBy: ["users.applyReputation"],
    });
  });

  it("despachar de novo não soma outra vez", async () => {
    const ana = await aUser("Ana");
    await dealCompleted({ dealId: "d1", partyIds: [ana.id] });

    await dispatchPendingEvents();
    await dispatchPendingEvents();

    expect(await scoreOf(ana.id)).toBe(105);
  });

  it("três despachos simultâneos somam uma vez só", async () => {
    const ana = await aUser("Ana");
    await dealCompleted({ dealId: "d1", partyIds: [ana.id] });

    await Promise.all([dispatchPendingEvents(), dispatchPendingEvents(), dispatchPendingEvents()]);

    expect(await scoreOf(ana.id)).toBe(105);
  });

  it("dois negócios concluídos somam duas vezes", async () => {
    const ana = await aUser("Ana");
    await dealCompleted({ dealId: "d1", partyIds: [ana.id] });
    await dealCompleted({ dealId: "d2", partyIds: [ana.id] });

    await dispatchPendingEvents();

    expect(await scoreOf(ana.id)).toBe(110);
  });

  it("a mesma pessoa repetida na lista conta uma vez", async () => {
    const ana = await aUser("Ana");
    await dealCompleted({ dealId: "d1", partyIds: [ana.id, ana.id] });

    await dispatchPendingEvents();

    expect(await scoreOf(ana.id)).toBe(105);
  });

  it.each([
    ["sem partyIds", { dealId: "d1" }],
    ["partyIds vazio", { dealId: "d1", partyIds: [] }],
    ["sem dealId", { partyIds: ["6735a1b2c3d4e5f6a7b8c9d0"] }],
  ])("payload inválido (%s): evento falha, fica pendente e ninguém ganha pontos", async (_case, payload) => {
    const ana = await aUser("Ana");
    await dealCompleted(payload);

    expect(await dispatchPendingEvents()).toEqual({ processed: 0, failed: 1 });

    expect(await scoreOf(ana.id)).toBe(100);
    expect(await DomainEventModel.findOne().lean()).toMatchObject({ status: "PENDING", attempts: 1, handledBy: [] });
  });

  it("um evento que vale 0 não muda a reputação", async () => {
    const ana = await aUser("Ana");

    await applyReputation({
      id: "e1",
      type: "OUTRO_EVENTO",
      payload: { dealId: "d1", partyIds: [ana.id] },
      occurredAt: new Date("2026-11-25T12:00:00Z"),
    });

    expect(await scoreOf(ana.id)).toBe(100);
  });

  it("o evento falha e a soma da outra parte é desfeita", async () => {
    const ana = await aUser("Ana");
    await dealCompleted({ dealId: "d1", partyIds: [ana.id, "000000000000000000000000"] });

    expect(await dispatchPendingEvents()).toEqual({ processed: 0, failed: 1 });

    expect(await scoreOf(ana.id)).toBe(100);
    expect((await DomainEventModel.findOne().lean())?.lastError).toMatch(/não existe/);
  });
});
