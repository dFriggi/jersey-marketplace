import { describe, expect, it } from "vitest";
import { decideTransfer } from "./catalog.rules";

const NOW = new Date("2026-11-20T15:00:00Z");
const input = { toUserId: "6650a1b2c3d4e5f6a7b8c9d0", via: "PURCHASE" as const, dealId: "6650a1b2c3d4e5f6a7b8c9d1" };

describe("regras do catalog", () => {
  describe("RN-C04: transferência de dono", () => {
    it("camisa RESERVED ganha uma entrada na procedência com o novo dono, a via, o negócio e a data", () => {
      expect(decideTransfer({ state: "RESERVED" }, input, NOW)).toEqual({
        userId: input.toUserId,
        acquiredAt: NOW,
        via: "PURCHASE",
        dealId: input.dealId,
      });
    });

    it.each(["FREE", "IN_AUCTION"] as const)("recusa transferir camisa %s com invalid_transition", (state) => {
      expect(() => decideTransfer({ state }, input, NOW)).toThrow(
        expect.objectContaining({ kind: "conflict", code: "invalid_transition" })
      );
    });
  });
});
