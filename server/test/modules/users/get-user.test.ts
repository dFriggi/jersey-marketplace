import { describe, expect, it } from "vitest";
import { getUser } from "../../../src/modules/users";
import { UserRepository } from "../../../src/modules/users/user.repository";
import { useTestDatabase } from "../../helpers/database";

const users = new UserRepository();
const aUser = () => users.create({ name: "Ana", email: "ana@email.com", passwordHash: "hash" });

describe("getUser (contrato de users para outros módulos)", () => {
  useTestDatabase();

  it("devolve só id, nome e reputação", async () => {
    const ana = await aUser();

    expect(await getUser(ana.id)).toEqual({ id: ana.id, name: "Ana", reputationScore: 100 });
  });

  it("mostra a reputação atual", async () => {
    const ana = await aUser();
    await users.addReputation(ana.id, 5);

    expect((await getUser(ana.id)).reputationScore).toBe(105);
  });

  it.each(["000000000000000000000000", "abc"])("id %s inexistente lança not_found com user_not_found", async (id) => {
    await expect(getUser(id)).rejects.toMatchObject({ kind: "not_found", code: "user_not_found" });
  });
});
