import { BaseRepository, type DatabaseDoc } from "../../core/repository/base.repository";
import { UserModel, type UserDoc } from "./user.model";
import type { User } from "./user.types";

export class UserRepository extends BaseRepository<UserDoc, User> {
  constructor() {
    super(UserModel);
  }

  protected toEntity(doc: DatabaseDoc<UserDoc>): User {
    return { id: String(doc._id), name: doc.name, email: doc.email, roles: doc.roles, createdAt: doc.createdAt };
  }

  create(data: { name: string; email: string; passwordHash: string }): Promise<User> {
    return this.insert(data);
  }

  //unico lugar onde o hash sai do repository
  async findCredentialsByEmail(email: string): Promise<{ id: string; passwordHash: string } | null> {
    const doc = await this.model
      .findOne({ email })
      .select({ passwordHash: 1 })
      .session(this.session)
      .lean<DatabaseDoc<Pick<UserDoc, "passwordHash">>>();

    return doc ? { id: String(doc._id), passwordHash: doc.passwordHash } : null;
  }
}
