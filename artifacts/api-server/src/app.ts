import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import router from "./routes";
import { logger } from "./lib/logger";

/* ensure uploads dir exists */
const uploadsRoot = process.env.UPLOADS_DIR
  ? join(process.env.UPLOADS_DIR, "..")
  : join(process.cwd(), "uploads");
mkdirSync(uploadsRoot, { recursive: true });

/* built frontend location — two levels up from api-server, into edu/dist/public */
const frontendDist = join(process.cwd(), "..", "edu", "dist", "public");

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

/* serve built frontend static assets and SPA fallback */
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist, { maxAge: "1h" }));
  app.get("*path", (_req, res) => {
    res.sendFile(join(frontendDist, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.json({ status: "API running — frontend not built yet. Run: pnpm --filter @workspace/edu run build" });
  });
}

export default app;
