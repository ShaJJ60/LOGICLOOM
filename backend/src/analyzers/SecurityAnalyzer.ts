import { fingerprint } from "./rules.js";
import type { Finding } from "./types.js";

export class SecurityAnalyzer {
  analyze(path: string, content: string): Finding[] {
    const lines = content.split(/\r?\n/);
    const securityPatterns: Array<{ rule: RegExp; title: string; recommendation: string }> = [
      { rule: /\beval\s*\(/, title: "Dynamic code evaluation", recommendation: "Replace eval with explicit parsing or a constrained dispatch table." },
      { rule: /dangerouslySetInnerHTML\s*=/, title: "Raw HTML rendering", recommendation: "Sanitize untrusted markup or render content using escaped text nodes." },
      { rule: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][A-Za-z0-9_./+=-]{16,}["']/i, title: "Possible hard-coded credential", recommendation: "Move the credential to a secret manager and rotate it if it is genuine." },
    ];
    return securityPatterns.flatMap(({ rule, title, recommendation }) => {
      const line = lines.findIndex((text) => rule.test(text));
      return line < 0 ? [] : [{
        fingerprint: fingerprint(path, `security:${title}`, line + 1), filePath: path, line: line + 1,
        severity: title === "Possible hard-coded credential" ? "HIGH" as const : "MEDIUM" as const, category: "SECURITY" as const, title,
        description: "A source-pattern heuristic matched this line; review context before treating it as a confirmed vulnerability.",
        metric: { detector: "pattern heuristic" }, impact: "Potential unsafe input handling or exposed secret.",
        estimatedEffort: 1, recommendation,
      }];
    });
  }
}
