import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url().optional(),
  GITHUB_TOKEN: z.string().optional(),
  AI_BASE_URL: z.string().url().optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("gpt-4o-mini"),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  MAX_ANALYSIS_FILES: z.coerce.number().int().min(1).max(1000).default(300),
  MAX_ANALYSIS_BYTES: z.coerce.number().int().min(1_000_000).max(50_000_000).default(10_000_000),
});

export const config = envSchema.parse(process.env);
