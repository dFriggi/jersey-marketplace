import express from "express";
import { errorHandler } from "./core/http/error-handler";
import { catalogRouter } from "./modules/catalog";
import { usersRouter } from "./modules/users";

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(usersRouter);
  app.use(catalogRouter);

  app.use(errorHandler);

  return app;
}
