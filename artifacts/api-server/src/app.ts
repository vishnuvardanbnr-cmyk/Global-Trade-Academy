import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { join } from "path";
import { mkdirSync } from "fs";
import router from "./routes";
import { logger } from "./lib/logger";

/* ensure uploads dir exists */
const uploadsRoot = process.env.UPLOADS_DIR
  ? join(process.env.UPLOADS_DIR, "..")
  : join(process.cwd(), "uploads");
mkdirSync(uploadsRoot, { recursive: true });

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* serve uploaded images at /api/uploads/ */
app.use("/api/uploads", express.static(uploadsRoot, { maxAge: "30d" }));

app.use("/api", router);

export default app;
