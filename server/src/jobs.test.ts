import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startJobs } from "./jobs";

describe("startJobs", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("entrega os eventos a cada intervalo", async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const stop = startJobs({ intervalMs: 1000, dispatch });

    await vi.advanceTimersByTimeAsync(999);
    expect(dispatch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2001);
    expect(dispatch).toHaveBeenCalledTimes(3);

    stop();
  });

  it("depois de parar, não entrega mais", async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const stop = startJobs({ intervalMs: 1000, dispatch });
    await vi.advanceTimersByTimeAsync(1000);

    stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("um erro é registrado e não para os próximos ciclos", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const dispatch = vi.fn().mockRejectedValueOnce(new Error("banco fora do ar")).mockResolvedValue(undefined);
    const stop = startJobs({ intervalMs: 1000, dispatch });

    await vi.advanceTimersByTimeAsync(3000);

    expect(log).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledTimes(3);
    stop();
  });

  it("enquanto uma entrega não termina, os ciclos seguintes pulam", async () => {
    let finish: () => void = () => {};
    const dispatch = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const stop = startJobs({ intervalMs: 1000, dispatch });

    await vi.advanceTimersByTimeAsync(5000);
    expect(dispatch).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(dispatch).toHaveBeenCalledTimes(2);
    stop();
  });
});
