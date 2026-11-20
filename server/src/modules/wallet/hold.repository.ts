import { Types } from "mongoose";
import { BaseRepository, type DatabaseDoc } from "../../core/repository/base.repository";
import { HoldModel, type HoldDoc, type HoldReasonType, type HoldStatus } from "./hold.model";
import type { Hold } from "./wallet.types";

export class HoldRepository extends BaseRepository<HoldDoc, Hold> {
  constructor() {
    super(HoldModel);
  }

  protected toEntity(doc: DatabaseDoc<HoldDoc>): Hold {
    return {
      id: String(doc._id),
      userId: String(doc.userId),
      amountCents: doc.amountCents,
      reason: { type: doc.reason.type, refId: String(doc.reason.refId) },
      status: doc.status,
      dealId: doc.dealId ? String(doc.dealId) : undefined,
      beneficiaryId: doc.beneficiaryId ? String(doc.beneficiaryId) : undefined,
      version: doc.version,
    };
  }

  // nasce ACTIVE; a mesma proposta (ou lance) não pode ter duas retenções (índice único)
  create(data: { userId: string; amountCents: number; reason: { type: HoldReasonType; refId: string } }) {
    return this.insert({
      userId: new Types.ObjectId(data.userId),
      amountCents: data.amountCents,
      reason: { type: data.reason.type, refId: new Types.ObjectId(data.reason.refId) },
    });
  }

  // ACTIVE -> IN_ESCROW, guardando o negócio e quem vai receber; null quando não está mais ACTIVE
  markInEscrow(id: string, dealId: string, beneficiaryId: string): Promise<Hold | null> {
    return this.compareAndSet(
      { _id: new Types.ObjectId(id), status: "ACTIVE" },
      {
        $set: {
          status: "IN_ESCROW",
          dealId: new Types.ObjectId(dealId),
          beneficiaryId: new Types.ObjectId(beneficiaryId),
        },
        $inc: { version: 1 },
      }
    );
  }

  // IN_ESCROW -> SETTLED; null quando não está mais IN_ESCROW
  markSettled(id: string): Promise<Hold | null> {
    return this.compareAndSet(
      { _id: new Types.ObjectId(id), status: "IN_ESCROW" },
      { $set: { status: "SETTLED" }, $inc: { version: 1 } }
    );
  }

  // muda para RELEASED só se o status ainda for o esperado; null quando alguém mudou antes
  markReleased(id: string, from: HoldStatus): Promise<Hold | null> {
    return this.compareAndSet(
      { _id: new Types.ObjectId(id), status: from },
      { $set: { status: "RELEASED" }, $inc: { version: 1 } }
    );
  }
}
