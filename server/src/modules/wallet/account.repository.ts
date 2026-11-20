import { Types } from "mongoose";
import { BaseRepository, type DatabaseDoc } from "../../core/repository/base.repository";
import { AccountModel, type AccountDoc } from "./account.model";
import type { Account } from "./wallet.types";

// o saldo só muda por $inc condicional: o filtro garante que nenhum saldo fica negativo
export class AccountRepository extends BaseRepository<AccountDoc, Account> {
  constructor() {
    super(AccountModel);
  }

  protected toEntity(doc: DatabaseDoc<AccountDoc>): Account {
    return {
      id: String(doc._id),
      userId: String(doc.userId),
      availableCents: doc.availableCents,
      heldCents: doc.heldCents,
      version: doc.version,
    };
  }

  // disponível -> retido; null quando o disponível não cobre o valor ou a carteira não existe
  async moveAvailableToHeld(userId: string, amountCents: number): Promise<Account | null> {
    if (!Types.ObjectId.isValid(userId)) return null;

    return this.compareAndSet(
      { userId: new Types.ObjectId(userId), availableCents: { $gte: amountCents } },
      { $inc: { availableCents: -amountCents, heldCents: amountCents, version: 1 } }
    );
  }

  // retido -> disponível; null quando o retido não cobre o valor ou a carteira não existe
  async moveHeldToAvailable(userId: string, amountCents: number): Promise<Account | null> {
    if (!Types.ObjectId.isValid(userId)) return null;

    return this.compareAndSet(
      { userId: new Types.ObjectId(userId), heldCents: { $gte: amountCents } },
      { $inc: { heldCents: -amountCents, availableCents: amountCents, version: 1 } }
    );
  }

  // sai do retido (vai para o escrow); null quando o retido não cobre o valor ou a carteira não existe
  removeHeld(userId: string, amountCents: number): Promise<Account | null> {
    return this.compareAndSet(
      { userId: new Types.ObjectId(userId), heldCents: { $gte: amountCents } },
      { $inc: { heldCents: -amountCents, version: 1 } }
    );
  }

  // entra dinheiro no disponível; cria a carteira se o usuário ainda não tiver (primeiro recebimento)
  async creditAvailableCreating(userId: string, amountCents: number): Promise<Account> {
    const doc = await this.model
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId) },
        { $inc: { availableCents: amountCents, version: 1 } },
        { upsert: true, setDefaultsOnInsert: true, returnDocument: "after", session: this.session }
      )
      .lean<DatabaseDoc<AccountDoc>>();

    // com upsert o documento sempre existe depois da operação
    if (!doc) throw new Error(`Carteira de ${userId} não foi criada`);
    return this.toEntity(doc);
  }

  // entra dinheiro no disponível (estorno do escrow); null quando a carteira não existe
  async creditAvailable(userId: string, amountCents: number): Promise<Account | null> {
    if (!Types.ObjectId.isValid(userId)) return null;

    return this.compareAndSet(
      { userId: new Types.ObjectId(userId) },
      { $inc: { availableCents: amountCents, version: 1 } }
    );
  }
}
