import { afterEach, describe, expect, it } from "vitest";
import { clearSubscriptions, getSubscriptions } from "./core/events/dispatcher";
import { registerEventHandlers } from "./handlers";

describe("registerEventHandlers", () => {
  afterEach(() => clearSubscriptions());

  it("inscreve a reputação do users no DEAL_COMPLETED", () => {
    registerEventHandlers();

    expect(getSubscriptions("DEAL_COMPLETED").map((subscription) => subscription.name)).toEqual([
      "users.applyReputation",
    ]);
  });
});
