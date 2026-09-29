import { fingerprint } from "./rules.js";
import type { Finding } from "./types.js";

export class MaintainabilityAnalyzer {
  analyze(path: string, content: string, complexity: number): { lineCount: number; score: number; finding?: Finding } {
    const lineCount = content.split(/\r?\n/).length;
    const score = Math.max(0, Math.min(100, Math.round(100 - Math.max(0, complexity - 10) * 2 - Math.max(0, lineCount - 300) / 12)));
    if (lineCount <= 500) return { lineCount, score };
    return {
      lineCount, score,
      finding: {
        fingerprint: fingerprint(path, "large-file", 1), filePath: path, line: 1,
        severity: lineCount > 900 ? "HIGH" : "MEDIUM", category: "MAINTAINABILITY",
        title: "Large source file", description: `File contains ${lineCount} lines, which can make navigation and focused changes harder.`,
        metric: { lines: lineCount }, impact: "Broader review surface and higher merge-conflict risk.",
        estimatedEffort: Math.ceil(lineCount / 300), recommendation: "Group related responsibilities into smaller modules with explicit interfaces.",
      },
    };
  }
}
