import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { hold, release } from "../../../src/modules/wallet";
import { AccountModel } from "../../../src/modules/wallet/account.model";
import { HoldModel } from "../../../src/modules/wallet/hold.model";
import { LedgerEntryModel } from "../../../src/modules/wallet/ledger-entry.model";
import { useTestDatabase } from "../../helpers/database";

// o depósito chega no PR das rotas da carteira; aqui a carteira já nasce com saldo
async function aWallet(availableCents: number, heldCents = 0) {
  const userId = new Types.ObjectId();
  await AccountModel.create({ userId, availableCents, heldCents });
  return userId.toHexString();
}

async function balances(userId: string) {
  const account = await AccountModel.findOne({ userId }).lean();
  return { available: account?.availableCents, held: account?.heldCents };
}

const proposal = () => ({ type: "PROPOSAL" as const, refId: new Types.ObjectId().toHexString() });

describe("wallet: retenção de saldo", () => {
  useTestDatabase();

  describe("hold", () => {
    it("move do disponível para o retido e cria a retenção ACTIVE", async () => {
      const userId = await aWallet(50000);
      const reason = proposal();

      const { holdId } = await hold({ userId, amountCents: 35000, reason });

      expect(await balances(userId)).toEqual({ available: 15000, held: 35000 });
      expect(await HoldModel.findById(holdId).lean()).toMatchObject({
        userId: new Types.ObjectId(userId),
        amountCents: 35000,
        reason: { type: "PROPOSAL", refId: new Types.ObjectId(reason.refId) },
        status: "ACTIVE",
      });
    });

    it("grava o lançamento HOLD com duas linhas que somam zero", async () => {
      const userId = await aWallet(50000);

      const { holdId } = await hold({ userId, amountCents: 35000, reason: proposal() });

      const lines = await LedgerEntryModel.find({ "refs.holdId": holdId }).sort({ amountCents: 1 }).lean();
      expect(lines.map((line) => [line.type, line.account, line.amountCents])).toEqual([
        ["HOLD", `user:${userId}:available`, -35000],
        ["HOLD", `user:${userId}:held`, 35000],
      ]);
      expect(String(lines.at(0)?.journalId)).toBe(String(lines.at(1)?.journalId));
    });

    it("aceita reter exatamente todo o disponível", async () => {
      const userId = await aWallet(35000);

      await hold({ userId, amountCents: 35000, reason: proposal() });

      expect(await balances(userId)).toEqual({ available: 0, held: 35000 });
    });

    it("recusa com insufficient_balance quando o disponível não cobre", async () => {
      const userId = await aWallet(34999);

      await expect(hold({ userId, amountCents: 35000, reason: proposal() })).rejects.toMatchObject({
        kind: "business_rule",
        code: "insufficient_balance",
      });
      expect(await balances(userId)).toEqual({ available: 34999, held: 0 });
      expect(await HoldModel.countDocuments()).toBe(0);
      expect(await LedgerEntryModel.countDocuments()).toBe(0);
    });

    it("recusa com insufficient_balance quando o usuário não tem carteira", async () => {
      const userId = new Types.ObjectId().toHexString();

      await expect(hold({ userId, amountCents: 100, reason: proposal() })).rejects.toMatchObject({
        code: "insufficient_balance",
      });
    });

    it.each([0, -100, 10.5])("recusa o valor %s com invalid_amount, sem mexer no saldo", async (amountCents) => {
      const userId = await aWallet(50000);

      await expect(hold({ userId, amountCents, reason: proposal() })).rejects.toMatchObject({
        kind: "validation",
        code: "invalid_amount",
      });
      expect(await balances(userId)).toEqual({ available: 50000, held: 0 });
    });

    it("segunda retenção para a mesma proposta é recusada e o saldo não muda", async () => {
      const userId = await aWallet(50000);
      const reason = proposal();
      await hold({ userId, amountCents: 10000, reason });

      await expect(hold({ userId, amountCents: 10000, reason })).rejects.toMatchObject({ kind: "conflict" });
      expect(await balances(userId)).toEqual({ available: 40000, held: 10000 });
      expect(await LedgerEntryModel.countDocuments()).toBe(2);
    });
  });

  describe("release", () => {
    it("retenção ACTIVE volta para o disponível com o lançamento RELEASE", async () => {
      const userId = await aWallet(50000);
      const { holdId } = await hold({ userId, amountCents: 35000, reason: proposal() });

      await release(holdId);

      expect(await balances(userId)).toEqual({ available: 50000, held: 0 });
      expect(await HoldModel.findById(holdId).lean()).toMatchObject({ status: "RELEASED", version: 1 });
      const filter = { "refs.holdId": holdId, type: "RELEASE" };
      const lines = await LedgerEntryModel.find(filter).sort({ amountCents: 1 }).lean();
      expect(lines.map((line) => [line.account, line.amountCents])).toEqual([
        [`user:${userId}:held`, -35000],
        [`user:${userId}:available`, 35000],
      ]);
    });

    it("retenção IN_ESCROW é estornada para o disponível de quem pagou (REFUND)", async () => {
      // estado depois do aceite: o valor saiu do retido e está no escrow
      const userId = await aWallet(15000, 0);
      const escrowed = await HoldModel.create({
        userId: new Types.ObjectId(userId),
        amountCents: 35000,
        reason: proposal(),
        status: "IN_ESCROW",
      });

      await release(String(escrowed._id));

      expect(await balances(userId)).toEqual({ available: 50000, held: 0 });
      const lines = await LedgerEntryModel.find({ type: "REFUND" }).sort({ amountCents: 1 }).lean();
      expect(lines.map((line) => [line.account, line.amountCents])).toEqual([
        ["escrow", -35000],
        [`user:${userId}:available`, 35000],
      ]);
    });

    it.each(["RELEASED", "SETTLED"])("recusa liberar uma retenção %s com invalid_transition", async (status) => {
      const userId = await aWallet(0);
      const done = await HoldModel.create({
        userId: new Types.ObjectId(userId),
        amountCents: 100,
        reason: proposal(),
        status,
      });

      await expect(release(String(done._id))).rejects.toMatchObject({ kind: "conflict", code: "invalid_transition" });
      expect(await balances(userId)).toEqual({ available: 0, held: 0 });
    });

    it.each([new Types.ObjectId().toHexString(), "abc"])("recusa o id %s com hold_not_found", async (holdId) => {
      await expect(release(holdId)).rejects.toMatchObject({ kind: "not_found", code: "hold_not_found" });
    });
  });

  describe("concorrência", () => {
    it("10 retenções de 3.000 com saldo de 10.000: só 3 passam e o saldo não fica negativo", async () => {
      const userId = await aWallet(10000);

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => hold({ userId, amountCents: 3000, reason: proposal() }))
      );

      const passed = results.filter((result) => result.status === "fulfilled");
      const refused = results.filter((result) => result.status === "rejected");
      expect(passed).toHaveLength(3);
      expect(refused).toHaveLength(7);
      for (const result of refused) {
        expect(result.reason).toMatchObject({ code: "insufficient_balance" });
      }
      expect(await balances(userId)).toEqual({ available: 1000, held: 9000 });
      expect(await LedgerEntryModel.countDocuments()).toBe(6);
    });

    it("duas liberações simultâneas da mesma retenção: só uma devolve o dinheiro", async () => {
      const userId = await aWallet(50000);
      const { holdId } = await hold({ userId, amountCents: 35000, reason: proposal() });

      const results = await Promise.allSettled([release(holdId), release(holdId)]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.find((result) => result.status === "rejected")).toMatchObject({
        reason: { code: "invalid_transition" },
      });
      expect(await balances(userId)).toEqual({ available: 50000, held: 0 });
    });
  });
});
