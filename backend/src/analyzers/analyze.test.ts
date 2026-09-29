import assert from "node:assert/strict";
import test from "node:test";
import { analyzeSource } from "./analyze.js";

test("measures files and maps local imports to dependency edges", async () => {
  const result = await analyzeSource([
    { path: "src/a.ts", language: "TypeScript", content: 'import { b } from "./b";\nimport "./b";\nexport const a = b;' },
    { path: "src/b.ts", language: "TypeScript", content: "export const b = 1;" },
  ]);
  assert.equal(result.files.length, 2);
  assert.equal(result.dependencies.length, 1);
  assert.equal(result.dependencies[0].target, "src/b");
  assert.equal(result.metrics.filesAnalyzed, 2);
});

test("reports suspicious source patterns with line evidence", async () => {
  const result = await analyzeSource([{ path: "src/unsafe.ts", language: "TypeScript", content: "const ok = true;\neval(input);" }]);
  assert.equal(result.findings[0].category, "SECURITY");
  assert.equal(result.findings[0].line, 2);
  assert.match(result.findings[0].description, /heuristic/);
});

test("detects local dependency cycles", async () => {
  const result = await analyzeSource([
    { path: "src/a.ts", language: "TypeScript", content: 'import "./b";\nimport "./b";' },
    { path: "src/b.ts", language: "TypeScript", content: 'import "./a";' },
  ]);
  assert.equal(result.metrics.circularDependencies, 2);
  assert.ok(result.findings.some((finding) => finding.category === "DEPENDENCY"));
  assert.equal(new Set(result.findings.map((finding) => finding.fingerprint)).size, result.findings.length);
});
