import { fingerprint } from "./rules.js";
import type { Finding } from "./types.js";

export class ComplexityAnalyzer {
  analyze(path: string, content: string): { complexity: number; finding?: Finding } {
    const lines = content.split(/\r?\n/);
    const complexity = 1 + (content.match(/\b(if|for|while|case|catch)\b|\?\?|\?(?![?.])/g)?.length ?? 0) +
      (content.match(/&&|\|\|/g)?.length ?? 0);
    if (complexity <= 15) return { complexity };
    const functionLine = lines.findIndex((text) => /\bfunction\b|=>/.test(text));
    const line = functionLine >= 0 ? functionLine + 1 : Math.max(1, lines.findIndex((text) => /\b(if|for|while|case|catch)\b|\?\?|\?(?![?.])|&&|\|\|/.test(text)) + 1);
    return {
      complexity,
      finding: {
        fingerprint: fingerprint(path, "complexity", line), filePath: path, line,
        severity: complexity >= 25 ? "HIGH" : "MEDIUM", category: "COMPLEXITY",
        title: "High conditional complexity",
        description: `This file has a heuristic cyclomatic complexity of ${complexity}. It counts common branching and logical operators; it is a file-level estimate, not an AST function score.`,
        metric: { complexity, method: "branch-token estimate" }, impact: "Harder to test and reason about change paths.",
        estimatedEffort: Math.max(1, Math.ceil((complexity - 10) / 5)), recommendation: "Split complex decision paths into named, independently testable functions.",
      },
    };
  }
}
