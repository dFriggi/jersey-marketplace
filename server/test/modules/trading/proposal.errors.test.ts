import { describe, expect, it } from "vitest";
import { DomainError } from "../../../src/core/errors";
import { rejectionToError } from "../../../src/modules/trading/proposal.errors";

describe("rejectionToError", () => {
  it.each([
    ["not_recipient", "forbidden"],
    ["proposal_not_pending", "conflict"],
    ["price_mismatch", "business_rule"],
    ["empty_shirt_list", "validation"],
  ] as const)("%s vira DomainError do tipo %s", (code, kind) => {
    const error = rejectionToError({ type: "Reject", code });

    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ kind, code });
    expect(error.message).not.toBe("");
  });

  it("leva os details da recusa", () => {
    const error = rejectionToError({ type: "Reject", code: "price_mismatch", details: { priceCents: 35000 } });

    expect(error.details).toEqual({ priceCents: 35000 });
  });
});
