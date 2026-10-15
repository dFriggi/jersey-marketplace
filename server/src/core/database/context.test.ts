import { describe, expect, it } from "vitest";
import { currentSession, getContext, runWithContext } from "./context";

describe("contexto da execução", () => {
  it("fora de runWithContext não há contexto nem sessão", () => {
    expect(getContext()).toBeUndefined();
    expect(currentSession()).toBeUndefined();
  });

  it("dentro de runWithContext devolve o contexto informado", () => {
    runWithContext({ requestId: "abc", userId: "u1" }, () => {
      expect(getContext()).toEqual({ requestId: "abc", userId: "u1" });
    });
  });

  it("o contexto sobrevive a um await", async () => {
    const seen = await runWithContext({ requestId: "abc" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return getContext()?.requestId;
    });

    expect(seen).toBe("abc");
  });

  it("execuções simultâneas não misturam os contextos", async () => {
    const read = (requestId: string, delayMs: number) =>
      runWithContext({ requestId }, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return getContext()?.requestId;
      });

    const results = await Promise.all([read("lenta", 20), read("rapida", 1)]);

    expect(results).toEqual(["lenta", "rapida"]);
  });

  it("depois de runWithContext o contexto some", () => {
    runWithContext({ requestId: "abc" }, () => {});

    expect(getContext()).toBeUndefined();
  });
});
