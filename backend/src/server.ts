import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { config } from "./config.js";
import { disconnectDatabase } from "./db.js";
import { router } from "./routes.js";

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: config.FRONTEND_ORIGIN }));
app.use(express.json({ limit: "128kb" }));
app.get("/api/health", (_request, response) => response.json({ status: "ok", service: "logicloom-api" }));
app.use("/api", router);
app.use((_request, response) => response.status(404).json({ error: { code: "NOT_FOUND", message: "API route not found." } }));

const errors: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({ error: { code: "INVALID_REQUEST", message: "Request validation failed.", details: error.issues } });
    return;
  }
  console.error("Request failed:", error);
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" && error.status >= 400 && error.status <= 599
    ? error.status
    : 500;
  const isMissingDatabaseUrl = status === 503 && error instanceof Error && error.message.startsWith("DATABASE_URL is not configured.");
  const isGitHubNetworkError = status === 502 && error instanceof Error && error.message.startsWith("Could not reach the GitHub API.");
  const isGitHubTimeout = status === 504 && error instanceof Error && error.message.startsWith("GitHub API request timed out");
  const message = (status < 500 || isMissingDatabaseUrl || isGitHubNetworkError || isGitHubTimeout) && error instanceof Error
    ? error.message
    : "Unexpected server error. Check the API logs for details.";
  response.status(status).json({ error: { code: status === 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED", message } });
};
app.use(errors);

const server = app.listen(config.PORT, () => console.info(`Logicloom API listening on http://localhost:${config.PORT}`));

const shutdown = () => {
  server.close(() => void disconnectDatabase().finally(() => process.exit(0)));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
