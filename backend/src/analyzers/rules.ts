import { createHash } from "node:crypto";

export function fingerprint(path: string, rule: string, line: number): string {
  return createHash("sha1").update(`${path}:${rule}:${line}`).digest("hex");
}
