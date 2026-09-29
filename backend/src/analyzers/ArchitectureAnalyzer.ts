import { fingerprint } from "./rules.js";
import type { AnalyzedDependency, Finding } from "./types.js";

export class ArchitectureAnalyzer {
  analyze(edges: AnalyzedDependency[]): Finding[] {
    const findings: Finding[] = [];
    const cyclicEdges = edges.filter((edge) => edge.circular);
    for (const edge of cyclicEdges) findings.push({
      fingerprint: fingerprint(edge.source, `cycle:${edge.target}`, 1), filePath: edge.source, line: 1,
      severity: "MEDIUM", category: "DEPENDENCY", title: "Circular module dependency",
      description: `A local import participates in a dependency cycle: ${edge.source} → ${edge.target}.`,
      metric: { target: edge.target }, impact: "Initialization order and refactoring can become difficult to reason about.",
      estimatedEffort: 2, recommendation: "Move shared contracts to a lower-level module or invert the dependency.",
    });
    const fanIn = new Map<string, number>();
    for (const edge of edges) fanIn.set(edge.target, (fanIn.get(edge.target) ?? 0) + 1);
    for (const [path, count] of fanIn) if (count >= 12) findings.push({
      fingerprint: fingerprint(path, "high-fan-in", 1), filePath: path, line: 1,
      severity: "MEDIUM", category: "ARCHITECTURE", title: "High dependency fan-in",
      description: `${count} analyzed modules import this file.`,
      metric: { dependents: count }, impact: "Changes here can have a broad downstream effect.",
      estimatedEffort: 2, recommendation: "Treat this module as a stable boundary and consider splitting independent responsibilities.",
    });
    return findings;
  }
}
