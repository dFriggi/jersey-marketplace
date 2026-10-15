import { afterEach, describe, expect, it } from "vitest";
import { clock, fixedClock, resetClock, setClock } from "./clock";

describe("clock", () => {
  afterEach(() => resetClock());

  it("devolve a hora do sistema por padrão", () => {
    const before = Date.now();
    const now = clock.now().getTime();
    const after = Date.now();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });

  it("pode ser fixado e avançado", () => {
    const fixed = fixedClock("2026-10-14T12:00:00Z");
    setClock(fixed);

    expect(clock.now().toISOString()).toBe("2026-10-14T12:00:00.000Z");

    fixed.advance(5 * 60 * 1000);
    expect(clock.now().toISOString()).toBe("2026-10-14T12:05:00.000Z");
  });

  it("resetClock volta para a hora do sistema", () => {
    setClock(fixedClock("2000-01-01T00:00:00Z"));
    resetClock();

    expect(clock.now().getFullYear()).toBeGreaterThan(2000);
  });
});
