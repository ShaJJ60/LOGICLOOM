import { posix } from "node:path";
import type { AnalyzedDependency, FileAnalysis } from "./types.js";

const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const normalizePath = (path: string) => posix.normalize(path.replace(/\\/g, "/")).replace(/^\.\//, "").replace(/\.(tsx?|jsx?|mjs|cjs)$/, "");

function resolveImport(from: string, specifier: string, knownPaths: Set<string>): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = normalizePath(posix.join(posix.dirname(from), specifier));
  const candidates = [base, ...extensions.map((extension) => `${base}${extension}`), ...["index.ts", "index.tsx", "index.js", "index.jsx"].map((file) => `${base}/${file}`)];
  return candidates.find((candidate) => knownPaths.has(candidate));
}

export class DependencyAnalyzer {
  analyze(files: FileAnalysis[]): AnalyzedDependency[] {
    const knownPaths = new Set(files.map(({ path }) => normalizePath(path)));
    const edges: AnalyzedDependency[] = [];
    for (const file of files) {
      for (const specifier of file.imports) {
        const target = resolveImport(file.path, specifier, knownPaths);
        if (target) edges.push({ source: normalizePath(file.path), target, kind: "IMPORT", circular: false });
      }
    }
    this.markCycles(edges);
    return [...new Map(edges.map((edge) => [`${edge.source}:${edge.target}:${edge.kind}`, edge])).values()];
  }

  private markCycles(edges: AnalyzedDependency[]): void {
    const adjacency = new Map<string, string[]>();
    for (const edge of edges) adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const cycleEdges = new Set<string>();
    const walk = (node: string, trail: string[]) => {
      if (visiting.has(node)) {
        const cycleStart = trail.indexOf(node);
        for (let index = Math.max(0, cycleStart); index < trail.length - 1; index += 1) cycleEdges.add(`${trail[index]}->${trail[index + 1]}`);
        cycleEdges.add(`${trail[trail.length - 1]}->${node}`);
        return;
      }
      if (visited.has(node)) return;
      visiting.add(node);
      for (const target of adjacency.get(node) ?? []) walk(target, [...trail, node]);
      visiting.delete(node);
      visited.add(node);
    };
    for (const node of adjacency.keys()) walk(node, []);
    for (const edge of edges) edge.circular = cycleEdges.has(`${edge.source}->${edge.target}`);
  }
}
