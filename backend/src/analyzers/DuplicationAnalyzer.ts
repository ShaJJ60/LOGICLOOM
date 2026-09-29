import { fingerprint } from "./rules.js";
import type { Finding, SourceFile } from "./types.js";

export class DuplicationAnalyzer {
  analyze(files: SourceFile[]): Finding[] {
    const blockOwners = new Map<string, { path: string; line: number }>();
    const findings: Finding[] = [];
    for (const file of files) {
      const lines = file.content.split(/\r?\n/);
      for (let start = 0; start <= lines.length - 6; start += 1) {
        const block = lines.slice(start, start + 6).map((line) => line.trim().replace(/\s+/g, " ")).join("\n");
        if (block.replace(/\W/g, "").length < 60) continue;
        const previous = blockOwners.get(block);
        if (previous && previous.path !== file.path) {
          findings.push({
            fingerprint: fingerprint(file.path, `duplicate:${previous.path}`, start + 1), filePath: file.path, line: start + 1,
            severity: "LOW", category: "DUPLICATION", title: "Repeated code block",
            description: `A normalized six-line block is also present in ${previous.path}:${previous.line}.`,
            metric: { matchingFile: previous.path, linesCompared: 6 }, impact: "Parallel copies can drift as behavior changes.",
            estimatedEffort: 1, recommendation: "Extract shared behavior only if both call sites represent the same domain rule.",
          });
        } else if (!previous) {
          blockOwners.set(block, { path: file.path, line: start + 1 });
        }
      }
    }
    return findings;
  }
}
