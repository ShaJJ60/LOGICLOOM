import assert from "node:assert/strict";
import test from "node:test";
import { ComplexityAnalyzer } from "./ComplexityAnalyzer.js";

const analyzer = new ComplexityAnalyzer();

test("complexity rises with nested conditionals and logical operators", () => {
  const simple = analyzer.analyze("example.ts", `export function validate(user, isAdmin) {
    if (!user) return false;
    return user.active && (isAdmin || user.role === "owner");
  }`);

  const complex = analyzer.analyze("example.ts", `export function buildPlan(items, mode) {
    const result = [];
    for (const item of items) {
      if (item.enabled && mode === "full") {
        if (item.priority === "high" || item.retryCount > 0) {
          result.push(item);
        }
      } else if (mode === "safe") {
        result.push(item);
      }
    }
    return result.filter((entry) => entry && entry.status !== "archived");
  }`);

  assert.ok(simple.complexity >= 3, `expected a measurable complexity for simple logic, got ${simple.complexity}`);
  assert.ok(complex.complexity > simple.complexity, `complexity should rise with nested branches, got ${simple.complexity} vs ${complex.complexity}`);
});
