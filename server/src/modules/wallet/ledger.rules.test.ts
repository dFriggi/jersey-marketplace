import { describe, expect, it } from "vitest";
import {
  assertValidAmount,
  balancedJournal,
  decideRelease,
  decideSettle,
  escrowJournal,
  holdJournal,
} from "./ledger.rules";

const USER = "6650a1b2c3d4e5f6a7b8c9d0";
const SELLER = "6650a1b2c3d4e5f6a7b8c9d1";

const sum = (lines: { amountCents: number }[]) => lines.reduce((total, line) => total + line.amountCents, 0);

describe("regras da carteira", () => {
  describe("RN-W01: valor em centavos inteiros e maior que zero", () => {
    it.each([0, -1, 10.5, Number.NaN, Number.POSITIVE_INFINITY])("recusa %s com invalid_amount", (amountCents) => {
      expect(() => assertValidAmount(amountCents)).toThrow(
        expect.objectContaining({ kind: "validation", code: "invalid_amount" })
      );
    });

    it("aceita 1 centavo", () => {
      expect(() => assertValidAmount(1)).not.toThrow();
    });
  });

  describe("RN-W02: as linhas de um lançamento somam zero", () => {
    it("recusa um lançamento desbalanceado", () => {
      expect(() => balancedJournal("HOLD", [{ account: "escrow", amountCents: 100 }])).toThrow(/não soma zero/);
    });
  });

  describe("RN-W03: reter", () => {
    it("tira do disponível e põe no retido do mesmo usuário", () => {
      expect(holdJournal(USER, 35000)).toEqual({
        type: "HOLD",
        lines: [
          { account: `user:${USER}:available`, amountCents: -35000 },
          { account: `user:${USER}:held`, amountCents: 35000 },
        ],
      });
    });

    it("recusa valor inválido antes de montar as linhas", () => {
      expect(() => holdJournal(USER, 0)).toThrow(expect.objectContaining({ code: "invalid_amount" }));
    });
  });

  describe("RN-W04 e RN-W05: liberar", () => {
    it("retenção ACTIVE volta do retido para o disponível", () => {
      const decision = decideRelease({ userId: USER, amountCents: 35000, status: "ACTIVE" });

      expect(decision.refund).toBe(false);
      expect(decision.journal).toEqual({
        type: "RELEASE",
        lines: [
          { account: `user:${USER}:held`, amountCents: -35000 },
          { account: `user:${USER}:available`, amountCents: 35000 },
        ],
      });
    });

    it("retenção IN_ESCROW é estornada do escrow para o disponível de quem pagou", () => {
      const decision = decideRelease({ userId: USER, amountCents: 35000, status: "IN_ESCROW" });

      expect(decision.refund).toBe(true);
      expect(decision.journal).toEqual({
        type: "REFUND",
        lines: [
          { account: "escrow", amountCents: -35000 },
          { account: `user:${USER}:available`, amountCents: 35000 },
        ],
      });
    });

    it.each(["RELEASED", "SETTLED"] as const)("recusa liberar uma retenção %s", (status) => {
      expect(() => decideRelease({ userId: USER, amountCents: 35000, status })).toThrow(
        expect.objectContaining({ kind: "conflict", code: "invalid_transition" })
      );
    });

    it.each(["ACTIVE", "IN_ESCROW"] as const)("o lançamento de %s soma zero", (status) => {
      expect(sum(decideRelease({ userId: USER, amountCents: 1, status }).journal.lines)).toBe(0);
    });
  });

  describe("RN-W06: mover para o escrow", () => {
    it("tira do retido de quem pagou e põe no escrow", () => {
      expect(escrowJournal({ userId: USER, amountCents: 35000, status: "ACTIVE" })).toEqual({
        type: "TO_ESCROW",
        lines: [
          { account: `user:${USER}:held`, amountCents: -35000 },
          { account: "escrow", amountCents: 35000 },
        ],
      });
    });

    it.each(["IN_ESCROW", "RELEASED", "SETTLED"] as const)("recusa mover uma retenção %s", (status) => {
      expect(() => escrowJournal({ userId: USER, amountCents: 35000, status })).toThrow(
        expect.objectContaining({ code: "invalid_transition" })
      );
    });
  });

  describe("RN-W07: liquidar", () => {
    it("tira do escrow e põe no disponível do beneficiário", () => {
      const decision = decideSettle({ amountCents: 35000, status: "IN_ESCROW", beneficiaryId: SELLER });

      expect(decision).toEqual({
        beneficiaryId: SELLER,
        journal: {
          type: "SETTLE",
          lines: [
            { account: "escrow", amountCents: -35000 },
            { account: `user:${SELLER}:available`, amountCents: 35000 },
          ],
        },
      });
    });

    it.each(["ACTIVE", "RELEASED", "SETTLED"] as const)("recusa liquidar uma retenção %s", (status) => {
      expect(() => decideSettle({ amountCents: 35000, status, beneficiaryId: SELLER })).toThrow(
        expect.objectContaining({ code: "invalid_transition" })
      );
    });

    it("o ciclo completo (reter, escrow, liquidar) deixa o escrow zerado e soma zero", () => {
      const lines = [
        ...holdJournal(USER, 35000).lines,
        ...escrowJournal({ userId: USER, amountCents: 35000, status: "ACTIVE" }).lines,
        ...decideSettle({ amountCents: 35000, status: "IN_ESCROW", beneficiaryId: SELLER }).journal.lines,
      ];
      const escrow = lines.filter((line) => line.account === "escrow");

      expect(sum(lines)).toBe(0);
      expect(sum(escrow)).toBe(0);
    });
  });
});
