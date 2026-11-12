import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock, resetClock, setClock } from "../clock";
import { signToken, verifyToken } from "./token";

const DAY = 24 * 60 * 60 * 1000;
const ana = { userId: "6735a1b2c3d4e5f6a7b8c9d0", roles: ["USER"] };

const expectInvalid = (promise: Promise<unknown>) =>
  expect(promise).rejects.toMatchObject({ kind: "unauthorized", code: "invalid_token" });

describe("token de login", () => {
  afterEach(() => resetClock());

  it("o token criado é aceito e devolve o mesmo usuário e papéis", async () => {
    const token = await signToken(ana);

    expect(await verifyToken(token)).toEqual(ana);
  });

  it("vale por 7 dias", async () => {
    const clock = fixedClock("2026-11-12T12:00:00Z");
    setClock(clock);
    const token = await signToken(ana);

    clock.advance(6 * DAY);
    await expect(verifyToken(token)).resolves.toEqual(ana);

    clock.advance(2 * DAY);
    await expectInvalid(verifyToken(token));
  });

  it("recusa um token com o conteúdo alterado", async () => {
    const [header, , signature] = (await signToken(ana)).split(".");
    const forged = Buffer.from(JSON.stringify({ sub: ana.userId, roles: ["USER", "MEDIATOR"] })).toString("base64url");

    await expectInvalid(verifyToken(`${header}.${forged}.${signature}`));
  });

  it("recusa um token assinado com outro segredo", async () => {
    const otherSecret = new TextEncoder().encode("outro-segredo-que-nao-e-o-do-servidor-123");
    const token = await new SignJWT({ roles: ["USER"] })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(ana.userId)
      .sign(otherSecret);

    await expectInvalid(verifyToken(token));
  });

  it("recusa outro algoritmo, mesmo assinado com o segredo do servidor", async () => {
    const serverSecret = new TextEncoder().encode(process.env.JWT_SECRET);
    const token = await new SignJWT({ roles: ["USER"] })
      .setProtectedHeader({ alg: "HS512" })
      .setSubject(ana.userId)
      .sign(serverSecret);

    await expectInvalid(verifyToken(token));
  });

  it("recusa um token sem usuário, mesmo assinado com o segredo do servidor", async () => {
    const serverSecret = new TextEncoder().encode(process.env.JWT_SECRET);
    const token = await new SignJWT({ roles: ["USER"] }).setProtectedHeader({ alg: "HS256" }).sign(serverSecret);

    await expectInvalid(verifyToken(token));
  });

  it.each(["", "nao-e-um-token", "a.b.c"])("recusa texto que não é token (%j)", async (text) => {
    await expectInvalid(verifyToken(text));
  });
});
