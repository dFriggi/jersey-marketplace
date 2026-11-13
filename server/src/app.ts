import cookieParser from "cookie-parser";
import express from "express";
import { errorHandler } from "./core/http/error-handler";
import { usersRouter } from "./modules/users";

export function createApp() {
  const app = express();

  app.use(express.json());

  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(usersRouter);

  app.use(errorHandler);

  return app;
}
