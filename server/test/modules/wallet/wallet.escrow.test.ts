import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { hold, moveToEscrow, release, settle } from "../../../src/modules/wallet";
import { AccountModel } from "../../../src/modules/wallet/account.model";
import { HoldModel } from "../../../src/modules/wallet/hold.model";
import { LedgerEntryModel } from "../../../src/modules/wallet/ledger-entry.model";
import { useTestDatabase } from "../../helpers/database";

const newId = () => new Types.ObjectId().toHexString();

// o depósito chega no PR das rotas da carteira; aqui a carteira já nasce com saldo
async function aWallet(availableCents: number) {
  const userId = new Types.ObjectId();
  await AccountModel.create({ userId, availableCents });
  return userId.toHexString();
}

async function balances(userId: string) {
  const account = await AccountModel.findOne({ userId }).lean();
  return account ? { available: account.availableCents, held: account.heldCents } : null;
}

// comprador com 50.000, proposta de 35.000 retida
async function aBuyerWithHold() {
  const buyer = await aWallet(50000);
  const { holdId } = await hold({ userId: buyer, amountCents: 35000, reason: { type: "PROPOSAL", refId: newId() } });
  return { buyer, holdId };
}

async function linesOf(type: string) {
  const lines = await LedgerEntryModel.find({ type }).sort({ amountCents: 1 }).lean();
  return lines.map((line) => [line.account, line.amountCents]);
}

describe("wallet: escrow e liquidação", () => {
  useTestDatabase();

  describe("moveToEscrow", () => {
    it("tira do retido de quem pagou, guarda negócio e beneficiário e grava TO_ESCROW", async () => {
      const { buyer, holdId } = await aBuyerWithHold();
      const dealId = newId();
      const seller = newId();

      await moveToEscrow({ holdId, dealId, beneficiaryId: seller });

      expect(await balances(buyer)).toEqual({ available: 15000, held: 0 });
      expect(await HoldModel.findById(holdId).lean()).toMatchObject({
        status: "IN_ESCROW",
        dealId: new Types.ObjectId(dealId),
        beneficiaryId: new Types.ObjectId(seller),
        version: 1,
      });
      expect(await linesOf("TO_ESCROW")).toEqual([
        [`user:${buyer}:held`, -35000],
        ["escrow", 35000],
      ]);
    });

    it.each(["IN_ESCROW", "RELEASED", "SETTLED"])("recusa mover retenção %s", async (status) => {
      const { holdId } = await aBuyerWithHold();
      await HoldModel.updateOne({ _id: holdId }, { status });

      await expect(moveToEscrow({ holdId, dealId: newId(), beneficiaryId: newId() })).rejects.toMatchObject({
        kind: "conflict",
        code: "invalid_transition",
      });
    });

    it("recusa retenção que não existe com hold_not_found", async () => {
      await expect(moveToEscrow({ holdId: newId(), dealId: newId(), beneficiaryId: newId() })).rejects.toMatchObject({
        code: "hold_not_found",
      });
    });
  });

  describe("settle", () => {
    it("paga o beneficiário que ainda não tem carteira, criando a carteira dele", async () => {
      const { buyer, holdId } = await aBuyerWithHold();
      const seller = newId();
      await moveToEscrow({ holdId, dealId: newId(), beneficiaryId: seller });

      await settle(holdId);

      expect(await balances(seller)).toEqual({ available: 35000, held: 0 });
      expect(await balances(buyer)).toEqual({ available: 15000, held: 0 });
      expect(await HoldModel.findById(holdId).lean()).toMatchObject({ status: "SETTLED", version: 2 });
      expect(await linesOf("SETTLE")).toEqual([
        ["escrow", -35000],
        [`user:${seller}:available`, 35000],
      ]);
    });

    it("soma no disponível do beneficiário que já tem carteira", async () => {
      const { holdId } = await aBuyerWithHold();
      const seller = await aWallet(1000);
      await moveToEscrow({ holdId, dealId: newId(), beneficiaryId: seller });

      await settle(holdId);

      expect(await balances(seller)).toEqual({ available: 36000, held: 0 });
    });

    it.each(["ACTIVE", "RELEASED", "SETTLED"])("recusa liquidar retenção %s", async (status) => {
      const { holdId } = await aBuyerWithHold();
      await HoldModel.updateOne({ _id: holdId }, { status, beneficiaryId: new Types.ObjectId() });

      await expect(settle(holdId)).rejects.toMatchObject({ kind: "conflict", code: "invalid_transition" });
    });

    it("recusa retenção que não existe com hold_not_found", async () => {
      await expect(settle(newId())).rejects.toMatchObject({ code: "hold_not_found" });
    });
  });

  describe("ciclos completos", () => {
    it("reter, escrow e liquidar: o ledger inteiro soma zero e o escrow termina zerado", async () => {
      const { holdId } = await aBuyerWithHold();
      await moveToEscrow({ holdId, dealId: newId(), beneficiaryId: newId() });
      await settle(holdId);

      const lines = await LedgerEntryModel.find().lean();
      const sum = (selected: typeof lines) => selected.reduce((total, line) => total + line.amountCents, 0);

      expect(lines).toHaveLength(6);
      expect(sum(lines)).toBe(0);
      expect(sum(lines.filter((line) => line.account === "escrow"))).toBe(0);
    });

    it("negócio cancelado depois do escrow: release estorna tudo para quem pagou", async () => {
      const { buyer, holdId } = await aBuyerWithHold();
      await moveToEscrow({ holdId, dealId: newId(), beneficiaryId: newId() });

      await release(holdId);

      expect(await balances(buyer)).toEqual({ available: 50000, held: 0 });
      expect(await linesOf("REFUND")).toEqual([
        ["escrow", -35000],
        [`user:${buyer}:available`, 35000],
      ]);
    });
  });

  describe("concorrência", () => {
    it("duas liquidações simultâneas da mesma retenção: o vendedor recebe uma vez só", async () => {
      const { holdId } = await aBuyerWithHold();
      const seller = newId();
      await moveToEscrow({ holdId, dealId: newId(), beneficiaryId: seller });

      const results = await Promise.allSettled([settle(holdId), settle(holdId)]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(await balances(seller)).toEqual({ available: 35000, held: 0 });
    });

    it("dois pagamentos simultâneos para quem não tem carteira criam uma carteira só", async () => {
      const seller = newId();
      const first = await aBuyerWithHold();
      const second = await aBuyerWithHold();
      await moveToEscrow({ holdId: first.holdId, dealId: newId(), beneficiaryId: seller });
      await moveToEscrow({ holdId: second.holdId, dealId: newId(), beneficiaryId: seller });

      await Promise.all([settle(first.holdId), settle(second.holdId)]);

      expect(await AccountModel.countDocuments({ userId: seller })).toBe(1);
      expect(await balances(seller)).toEqual({ available: 70000, held: 0 });
    });
  });
});
