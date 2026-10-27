import { afterEach, describe, expect, it } from "vitest";
import { clearSubscriptions, getSubscriptions, subscribe, type EventHandler } from "./dispatcher";

const noOperation: EventHandler = async () => {};
const names = (type: string) => getSubscriptions(type).map((subscription) => subscription.name);

describe("subscribe", () => {
  afterEach(() => clearSubscriptions());

  it("guarda os handlers de um tipo na ordem em que se inscreveram", () => {
    subscribe("DEAL_COMPLETED", "users.applyReputation", noOperation);
    subscribe("DEAL_COMPLETED", "notifications.notifyBuyer", noOperation);

    expect(names("DEAL_COMPLETED")).toEqual(["users.applyReputation", "notifications.notifyBuyer"]);
  });

  it("tipo sem inscriçoes devolve lista vazia", () => {
    expect(getSubscriptions("NINGUEM_ASSINOU")).toEqual([]);
  });

  it("guarda o próprio handler, para o dispatcher poder chamá-lo", async () => {
    const calls: string[] = [];
    subscribe("X", "a", async (event) => void calls.push(event.type));

    await getSubscriptions("X")[0]!.handle({ id: "1", type: "X", payload: {}, occurredAt: new Date() });

    expect(calls).toEqual(["X"]);
  });

  it("não aceita dois handlers com o mesmo nome no mesmo tipo", () => {
    subscribe("DEAL_COMPLETED", "users.applyReputation", noOperation);

    expect(() => subscribe("DEAL_COMPLETED", "users.applyReputation", noOperation)).toThrow(/já inscrito/);
    expect(names("DEAL_COMPLETED")).toEqual(["users.applyReputation"]);
  });

  it("aceita o mesmo nome em tipos diferentes", () => {
    subscribe("DEAL_COMPLETED", "notifications.notify", noOperation);

    expect(() => subscribe("PROPOSAL_ACCEPTED", "notifications.notify", noOperation)).not.toThrow();
  });

  it("clearSubscriptions esvazia tudo e permite inscrever de novo", () => {
    subscribe("X", "a", noOperation);

    clearSubscriptions();

    expect(getSubscriptions("X")).toEqual([]);
    expect(() => subscribe("X", "a", noOperation)).not.toThrow();
  });
});
