import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { LedgerEntryModel } from "../../../src/modules/wallet/ledger-entry.model";
import { useTestDatabase } from "../../helpers/database";

const buyerId = new Types.ObjectId().toHexString();

function anEntry(overrides: Record<string, unknown> = {}) {
  return {
    journalId: new Types.ObjectId(),
    account: `user:${buyerId}:available`,
    amountCents: -35000,
    type: "HOLD",
    ...overrides,
  };
}

describe("model de lançamento (ledger_entries)", () => {
  useTestDatabase();

  it("o syncIndexes cria os índices do extrato e do lançamento", async () => {
    const keys = (await LedgerEntryModel.collection.indexes()).map((index) => index.key);

    expect(keys).toContainEqual({ account: 1, createdAt: -1 });
    expect(keys).toContainEqual({ journalId: 1 });
  });

  it("grava as duas linhas de um lançamento com o mesmo journalId, somando zero", async () => {
    const journalId = new Types.ObjectId();

    await LedgerEntryModel.create([
      anEntry({ journalId, account: `user:${buyerId}:available`, amountCents: -35000 }),
      anEntry({ journalId, account: `user:${buyerId}:held`, amountCents: 35000 }),
    ]);

    const lines = await LedgerEntryModel.find({ journalId }).lean();
    expect(lines).toHaveLength(2);
    expect(lines.reduce((sum, line) => sum + line.amountCents, 0)).toBe(0);
  });

  it("aceita valor negativo, porque o amountCents tem sinal", async () => {
    await expect(LedgerEntryModel.create(anEntry({ amountCents: -1 }))).resolves.toMatchObject({ amountCents: -1 });
  });

  it("tem createdAt mas não tem updatedAt, porque o lançamento é imutável", async () => {
    const { _id } = await LedgerEntryModel.create(anEntry());

    const stored = await LedgerEntryModel.findById(_id).lean();

    expect(stored?.createdAt).toBeInstanceOf(Date);
    expect(stored).not.toHaveProperty("updatedAt");
    expect(stored).not.toHaveProperty("version");
  });

  it("as referências são guardadas sem _id", async () => {
    const holdId = new Types.ObjectId();
    const { _id } = await LedgerEntryModel.create(anEntry({ refs: { holdId } }));

    const stored = await LedgerEntryModel.findById(_id).lean();

    expect(stored?.refs).toEqual({ holdId });
  });

  it.each(["escrow", "external", `user:${buyerId}:held`])("aceita a conta %s", async (account) => {
    await expect(LedgerEntryModel.create(anEntry({ account }))).resolves.toBeDefined();
  });

  it.each([
    ["amountCents com centavo quebrado", { amountCents: -350.5 }],
    ["type fora da lista", { type: "TRANSFER" }],
    ["conta fora do formato", { account: "user:joao:available" }],
    ["conta de usuário sem o tipo", { account: `user:${buyerId}` }],
    ["sem journalId", { journalId: undefined }],
  ])("recusa %s", async (_case, overrides) => {
    await expect(LedgerEntryModel.create(anEntry(overrides))).rejects.toMatchObject({ name: "ValidationError" });
  });
});
