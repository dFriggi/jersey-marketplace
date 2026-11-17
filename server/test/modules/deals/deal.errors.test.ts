import { describe, expect, it } from "vitest";
import { DomainError } from "../../../src/core/errors";
import { dealRejectionToError } from "../../../src/modules/deals/deal.errors";

describe("dealRejectionToError", () => {
  it.each([
    ["deal_not_active", "conflict"],
    ["not_sender", "forbidden"],
    ["invalid_tracking_code", "validation"],
    ["deal_not_ready", "conflict"],
  ] as const)("%s vira DomainError do tipo %s", (code, kind) => {
    const error = dealRejectionToError({ type: "Reject", code });

    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ kind, code });
    expect(error.message).not.toBe("");
  });
});
