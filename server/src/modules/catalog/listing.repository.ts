import { Types } from "mongoose";
import { BaseRepository, type DatabaseDoc } from "../../core/repository/base.repository";
import type { Listing } from "./catalog.types";
import { ListingModel, type ListingDoc } from "./listing.model";

export class ListingRepository extends BaseRepository<ListingDoc, Listing> {
  constructor() {
    super(ListingModel);
  }

  protected toEntity(doc: DatabaseDoc<ListingDoc>): Listing {
    return {
      id: String(doc._id),
      shirtId: String(doc.shirtId),
      sellerId: String(doc.sellerId),
      type: doc.type,
      priceCents: doc.priceCents,
      status: doc.status,
      open: doc.open,
      createdAt: doc.createdAt,
    };
  }

  // anúncio de venda ACTIVE da camisa; id inválido é tratado como "não existe"
  async findActiveSale(shirtId: string): Promise<Listing | null> {
    if (!Types.ObjectId.isValid(shirtId)) return null;

    const [listing] = await this.list(
      { shirtId: new Types.ObjectId(shirtId), type: "SALE", status: "ACTIVE" },
      { limit: 1 }
    );

    return listing ?? null;
  }
}
