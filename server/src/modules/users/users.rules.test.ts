import { describe, expect, it } from "vitest";
import { reputationDelta } from "./users.rules";

describe("RN-U01: pontos de reputação por evento", () => {
  it.each([
    ["DEAL_COMPLETED", 5],
    ["PROPOSAL_ACCEPTED", 0],
    ["deal_completed", 0],
    ["", 0],
    ["toString", 0],
  ])("%s vale %i", (eventType, points) => {
    expect(reputationDelta(eventType)).toBe(points);
  });
});
