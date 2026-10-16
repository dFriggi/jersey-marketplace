import { Types, type Model, type QueryFilter, type UpdateQuery } from "mongoose";
import { currentSession } from "../database/context";
import { DomainError } from "../errors";

// o documento como volta do banco, com o _id do Mongo
export type DatabaseDoc<TDoc> = TDoc & { _id: Types.ObjectId };

export type Sort = Record<string, 1 | -1>;

export interface PageRequest {
  page: number;
  size: number;
  sort?: Sort;
}

// mesmo formato do paginate da Flexge
export interface Page<T> {
  docs: T[];
  total: number;
  page: number;
  size: number;
}

// base de todos os repositories
// TDoc =  documento no bacno (ObjectId)
// TEntity = o objeto de dominio

export abstract class BaseRepository<TDoc, TEntity> {
  protected constructor(protected readonly model: Model<TDoc>) {}

  // converte o documento do banco na entidade de domínio
  protected abstract toEntity(doc: DatabaseDoc<TDoc>): TEntity;

  protected get session() {
    return currentSession() ?? null;
  }

  async findById(id: string): Promise<TEntity | null> {
    if (!Types.ObjectId.isValid(id)) return null;

    const doc = await this.model.findById(id).session(this.session).lean<DatabaseDoc<TDoc>>();
    return doc ? this.toEntity(doc) : null;
  }

  async findByIdOrFail(id: string): Promise<TEntity> {
    const entity = await this.findById(id);

    if (!entity) {
      throw new DomainError(
        "not_found",
        `${this.model.modelName.toLowerCase()}_not_found`,
        `Registro ${id} não encontrado`
      );
    }

    return entity;
  }

  async findByIds(ids: readonly string[]): Promise<TEntity[]> {
    const validIds = ids.filter((id) => Types.ObjectId.isValid(id));
    return this.list({ _id: { $in: validIds } } as QueryFilter<TDoc>);
  }

  async count(filter: QueryFilter<TDoc> = {}): Promise<number> {
    return this.model.countDocuments(filter).session(this.session);
  }

  protected async list(
    filter: QueryFilter<TDoc> = {},
    options: { sort?: Sort; skip?: number; limit?: number } = {}
  ): Promise<TEntity[]> {
    const query = this.model.find(filter).session(this.session);

    if (options.sort) query.sort(options.sort);
    if (options.skip) query.skip(options.skip);
    if (options.limit) query.limit(options.limit);

    const docs = await query.lean<DatabaseDoc<TDoc>[]>();
    return docs.map((doc) => this.toEntity(doc));
  }

  // ordena pelo _id por padrão
  protected async paginate(filter: QueryFilter<TDoc>, { page, size, sort }: PageRequest): Promise<Page<TEntity>> {
    const docs = await this.list(filter, { sort: sort ?? { _id: 1 }, skip: (page - 1) * size, limit: size });
    const total = await this.count(filter);

    return { docs, total, page, size };
  }

  protected async insert(data: Partial<TDoc>): Promise<TEntity> {
    try {
      const doc = new this.model(data);
      await doc.save({ session: this.session });

      return this.toEntity(doc.toObject() as DatabaseDoc<TDoc>);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  protected async compareAndSet(filter: QueryFilter<TDoc>, update: UpdateQuery<TDoc>): Promise<TEntity | null> {
    try {
      const doc = await this.model
        .findOneAndUpdate(filter, update, { returnDocument: "after", runValidators: true, session: this.session })
        .lean<DatabaseDoc<TDoc>>();

      return doc ? this.toEntity(doc) : null;
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  private translateWriteError(error: unknown): unknown {
    const mongoError = error as { code?: number; keyValue?: Record<string, unknown> };

    if (mongoError?.code === 11000) {
      const field = Object.keys(mongoError.keyValue ?? {})[0] ?? "key";

      return new DomainError(
        "conflict",
        `duplicate_${field}`,
        `Já existe um registro com este ${field}`,
        mongoError.keyValue
      );
    }

    return error;
  }
}
