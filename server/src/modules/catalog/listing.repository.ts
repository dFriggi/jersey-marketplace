import { Types } from "mongoose";
import { BaseRepository, type DatabaseDoc, type Page, type PageRequest } from "../../core/repository/base.repository";
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
      snapshot: { condition: doc.snapshot.condition, photos: doc.snapshot.photos },
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

  // anúncios de venda ACTIVE, mais novos primeiro; shirtIds restringe a essas camisas
  paginateActiveSales(shirtIds: string[] | undefined, request: Omit<PageRequest, "sort">): Promise<Page<Listing>> {
    const onlyShirts = shirtIds ? { shirtId: { $in: shirtIds.map((id) => new Types.ObjectId(id)) } } : {};

    return this.paginate({ type: "SALE", status: "ACTIVE", ...onlyShirts }, { ...request, sort: { createdAt: -1 } });
  }
}
