import { BaseRepository, type DatabaseDoc } from "../../core/repository/base.repository";
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
}
