import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { ProposalModel } from "../../../src/modules/trading/proposal.model";
import { useTestDatabase } from "../../helpers/database";

const authorId = new Types.ObjectId();
const requestedShirtId = new Types.ObjectId();

function aProposal(overrides: Record<string, unknown> = {}) {
  return {
    type: "TRADE",
    authorId,
    recipientId: new Types.ObjectId(),
    offeredShirtIds: [new Types.ObjectId()],
    requestedShirtIds: [requestedShirtId],
    requestedKey: String(requestedShirtId),
    expiresAt: new Date("2026-12-01T12:00:00Z"),
    ...overrides,
  };
}

describe("model de proposta (proposals)", () => {
  useTestDatabase();

  it("o syncIndexes cria o índice único parcial de proposta pendente por autor e camisas pedidas", async () => {
    const indexes = await ProposalModel.collection.indexes();
    const pendingIndex = indexes.find((index) => index.name === "authorId_1_requestedKey_1");

    expect(pendingIndex).toMatchObject({ unique: true, partialFilterExpression: { status: "PENDING" } });
  });

  it("o syncIndexes cria os índices de recebidas, enviadas e expiração", async () => {
    const keys = (await ProposalModel.collection.indexes()).map((index) => index.key);

    expect(keys).toContainEqual({ recipientId: 1, status: 1, createdAt: -1 });
    expect(keys).toContainEqual({ authorId: 1, status: 1, createdAt: -1 });
    expect(keys).toContainEqual({ status: 1, expiresAt: 1 });
  });

  it("recusa duas propostas pendentes do mesmo autor pelas mesmas camisas", async () => {
    await ProposalModel.create(aProposal());

    await expect(ProposalModel.create(aProposal())).rejects.toMatchObject({ code: 11000 });
  });

  it("aceita uma nova proposta pelas mesmas camisas depois de a primeira sair de PENDING", async () => {
    await ProposalModel.create(aProposal());
    await ProposalModel.updateOne({ authorId }, { status: "DECLINED" });

    await expect(ProposalModel.create(aProposal())).resolves.toMatchObject({ status: "PENDING" });
    expect(await ProposalModel.countDocuments({ authorId })).toBe(2);
  });

  it("outro autor pode pedir as mesmas camisas", async () => {
    await ProposalModel.create(aProposal());

    await expect(ProposalModel.create(aProposal({ authorId: new Types.ObjectId() }))).resolves.toBeDefined();
  });

  it("uma proposta nova começa PENDING e na versão 0", async () => {
    const proposal = await ProposalModel.create(aProposal());

    expect(proposal.toObject()).toMatchObject({ status: "PENDING", version: 0 });
    expect(proposal.createdAt).toBeInstanceOf(Date);
  });

  it("a compra direta guarda o anúncio, o valor e a retenção", async () => {
    const listingId = new Types.ObjectId();
    const holdId = new Types.ObjectId();

    const { _id } = await ProposalModel.create(
      aProposal({ type: "PURCHASE", offeredShirtIds: [], listingId, amountCents: 35000, holdId })
    );
    const stored = await ProposalModel.findById(_id).lean();

    expect(stored).toMatchObject({ type: "PURCHASE", listingId, amountCents: 35000, holdId, offeredShirtIds: [] });
  });

  it.each([
    ["type fora da lista", { type: "AUCTION" }],
    ["status fora da lista", { status: "SUPERSEDED" }],
    ["amountCents com centavo quebrado", { amountCents: 100.5 }],
    ["amountCents zero", { amountCents: 0 }],
    ["sem camisas pedidas", { requestedShirtIds: [] }],
    ["sem requestedKey", { requestedKey: undefined }],
    ["sem prazo", { expiresAt: undefined }],
  ])("recusa %s", async (_case, overrides) => {
    await expect(ProposalModel.create(aProposal(overrides))).rejects.toMatchObject({ name: "ValidationError" });
  });
});
