import { Types } from "mongoose";
import { BaseRepository, type DatabaseDoc } from "../../core/repository/base.repository";
import type { OwnerEntry } from "./catalog.rules";
import type { ShirtSummary } from "./catalog.types";
import { ShirtModel, type ShirtDoc } from "./shirt.model";

export class ShirtRepository extends BaseRepository<ShirtDoc, ShirtSummary> {
  constructor() {
    super(ShirtModel);
  }

  protected toEntity(doc: DatabaseDoc<ShirtDoc>): ShirtSummary {
    return {
      id: String(doc._id),
      ownerId: String(doc.ownerId),
      team: doc.team,
      season: doc.season,
      size: doc.size,
      condition: doc.condition,
      photos: doc.photos,
      openToTrade: doc.openToTrade,
      state: doc.state,
    };
  }

  // FREE -> RESERVED só se a camisa ainda estiver livre e com o dono esperado; null quando não está
  async reserveIfFree(shirtId: string, ownerId: string): Promise<ShirtSummary | null> {
    if (!Types.ObjectId.isValid(shirtId) || !Types.ObjectId.isValid(ownerId)) return null;

    return this.compareAndSet(
      { _id: new Types.ObjectId(shirtId), ownerId: new Types.ObjectId(ownerId), state: "FREE" },
      { $set: { state: "RESERVED" }, $inc: { version: 1 } }
    );
  }

  // RESERVED -> FREE com o novo dono, fechada para troca e com a entrada nova na procedência
  // null quando a camisa não está mais reservada
  transferIfReserved(shirtId: string, entry: OwnerEntry): Promise<ShirtSummary | null> {
    return this.compareAndSet(
      { _id: new Types.ObjectId(shirtId), state: "RESERVED" },
      {
        $set: { ownerId: new Types.ObjectId(entry.userId), state: "FREE", openToTrade: false },
        $push: {
          ownerHistory: {
            userId: new Types.ObjectId(entry.userId),
            acquiredAt: entry.acquiredAt,
            via: entry.via,
            dealId: new Types.ObjectId(entry.dealId),
          },
        },
        $inc: { version: 1 },
      }
    );
  }

  // RESERVED -> FREE; null quando a camisa não está reservada (ou não existe)
  async releaseIfReserved(shirtId: string): Promise<ShirtSummary | null> {
    if (!Types.ObjectId.isValid(shirtId)) return null;

    return this.compareAndSet(
      { _id: new Types.ObjectId(shirtId), state: "RESERVED" },
      { $set: { state: "FREE" }, $inc: { version: 1 } }
    );
  }
}
