import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { HoldModel } from "../../../src/modules/wallet/hold.model";
import { useTestDatabase } from "../../helpers/database";

const proposalId = new Types.ObjectId();

function aHold(overrides: Record<string, unknown> = {}) {
  return {
    userId: new Types.ObjectId(),
    amountCents: 35000,
    reason: { type: "PROPOSAL", refId: proposalId },
    ...overrides,
  };
}

describe("model de retenção (holds)", () => {
  useTestDatabase();

  it("o syncIndexes cria o índice único por motivo da retenção", async () => {
    const indexes = await HoldModel.collection.indexes();
    const reasonIndex = indexes.find((index) => index.name === "reason.type_1_reason.refId_1");

    expect(reasonIndex).toMatchObject({ unique: true });
  });

  it("o syncIndexes cria o índice por usuário e status", async () => {
    const keys = (await HoldModel.collection.indexes()).map((index) => index.key);

    expect(keys).toContainEqual({ userId: 1, status: 1 });
  });

  it("recusa duas retenções para a mesma proposta", async () => {
    await HoldModel.create(aHold());

    await expect(HoldModel.create(aHold())).rejects.toMatchObject({ code: 11000 });
  });

  it("aceita o mesmo refId com outro tipo de motivo", async () => {
    await HoldModel.create(aHold());

    await expect(HoldModel.create(aHold({ reason: { type: "BID", refId: proposalId } }))).resolves.toBeDefined();
  });

  it("uma retenção nova começa ACTIVE, na versão 0, e o motivo é guardado sem _id", async () => {
    const { _id } = await HoldModel.create(aHold());

    const stored = await HoldModel.findById(_id).lean();

    expect(stored).toMatchObject({ status: "ACTIVE", version: 0 });
    expect(stored?.reason).toEqual({ type: "PROPOSAL", refId: proposalId });
  });

  it.each([
    ["amountCents zero", { amountCents: 0 }],
    ["amountCents com centavo quebrado", { amountCents: 100.5 }],
    ["status fora da lista", { status: "PAID" }],
    ["motivo fora da lista", { reason: { type: "GIFT", refId: proposalId } }],
    ["sem motivo", { reason: undefined }],
    ["motivo sem refId", { reason: { type: "PROPOSAL" } }],
  ])("recusa %s", async (_case, overrides) => {
    await expect(HoldModel.create(aHold(overrides))).rejects.toMatchObject({ name: "ValidationError" });
  });
});
