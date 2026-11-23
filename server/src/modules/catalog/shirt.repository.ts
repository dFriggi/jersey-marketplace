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

  // ids das camisas com o time e o tamanho pedidos, sem diferenciar maiúsculas de minúsculas
  async findIdsMatching(criteria: { team?: string; size?: string }): Promise<string[]> {
    const found = await this.list({
      ...(criteria.team ? { team: exactIgnoringCase(criteria.team) } : {}),
      ...(criteria.size ? { size: exactIgnoringCase(criteria.size) } : {}),
    });

    return found.map((shirt) => shirt.id);
  }
}

// "são paulo" encontra "São Paulo", mas não "São Paulo B"; os caracteres especiais do texto valem literalmente
function exactIgnoringCase(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}$`, "i");
}
