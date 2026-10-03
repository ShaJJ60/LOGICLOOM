import { fingerprint } from "./rules.js";
import type { Finding } from "./types.js";

const countMatches = (source: string, pattern: RegExp): number => {
  const matches = source.match(pattern);
  return matches ? matches.length : 0;
};

const stripNonCode = (source: string): string => source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/.*$/gm, " ")
  .replace(/#.*$/gm, " ")
  .replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g, " ");

export class ComplexityAnalyzer {
  analyze(path: string, content: string): { complexity: number; finding?: Finding } {
    const lines = content.split(/\r?\n/);
    const sanitized = stripNonCode(content);
    const decisionPoints = countMatches(sanitized, /\b(?:if|else\s+if|elif)\b/g)
      + countMatches(sanitized, /\b(?:for|while|do)\b/g)
      + countMatches(sanitized, /\b(?:catch|except)\b/g)
      + countMatches(sanitized, /\b(?:switch|case)\b/g)
      + countMatches(sanitized, /\?\s*[^:]+:/g)
      + countMatches(sanitized, /&&|\|\||\?\?/g)
      + countMatches(sanitized, /\b(?:and|or)\b/g);
    const complexity = 1 + decisionPoints;
    if (complexity <= 15) return { complexity };
    const functionLine = lines.findIndex((text) => /\bfunction\b|=>/.test(text));
    const line = functionLine >= 0 ? functionLine + 1 : Math.max(1, lines.findIndex((text) => /\b(?:if|else\s+if|elif|for|while|do|catch|except|switch|case)\b|&&|\|\||\?\?|\?|:/.test(text)) + 1);
    return {
      complexity,
      finding: {
        fingerprint: fingerprint(path, "complexity", line), filePath: path, line,
        severity: complexity >= 25 ? "HIGH" : "MEDIUM", category: "COMPLEXITY",
        title: "High conditional complexity",
        description: `This file has a heuristic cyclomatic complexity of ${complexity}. It counts conditional branches, loops, logical operators, and ternaries to reflect real decision pressure in the code you provided.`,
        metric: { complexity, method: "branch-flow estimate" }, impact: "Harder to test and reason about change paths.",
        estimatedEffort: Math.max(1, Math.ceil((complexity - 10) / 5)), recommendation: "Split complex decision paths into named, independently testable functions.",
      },
    };
  }
}
