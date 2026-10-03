import { ArchitectureAnalyzer } from "./ArchitectureAnalyzer.js";
import { ComplexityAnalyzer } from "./ComplexityAnalyzer.js";
import { DependencyAnalyzer } from "./DependencyAnalyzer.js";
import { DuplicationAnalyzer } from "./DuplicationAnalyzer.js";
import { MaintainabilityAnalyzer } from "./MaintainabilityAnalyzer.js";
import { SecurityAnalyzer } from "./SecurityAnalyzer.js";
import type { AnalysisResult, FileAnalysis, SourceFile } from "./types.js";

const codeExtensions: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript",
  ".mjs": "JavaScript", ".cjs": "JavaScript",
};
const extension = (path: string) => path.slice(path.lastIndexOf(".")).toLowerCase();
const importPattern = /(?:import\s+(?:[\s\S]*?\s+from\s+)?|export\s+[\s\S]*?\s+from\s+|require\s*\()\s*["']([^"']+)["']/g;

export async function analyzeSource(
  sourceFiles: SourceFile[],
  reportStage: (stage: string, progress: number) => Promise<void> = async () => undefined,
): Promise<AnalysisResult> {
  const complexityAnalyzer = new ComplexityAnalyzer();
  const maintainabilityAnalyzer = new MaintainabilityAnalyzer();
  const securityAnalyzer = new SecurityAnalyzer();
  const dependencyAnalyzer = new DependencyAnalyzer();
  const architectureAnalyzer = new ArchitectureAnalyzer();
  const duplicationAnalyzer = new DuplicationAnalyzer();
  const files: FileAnalysis[] = [];
  const findings: AnalysisResult["findings"] = [];

  await reportStage("analyzing complexity, maintainability, and security patterns", 38);
  for (const source of sourceFiles) {
    const complexity = complexityAnalyzer.analyze(source.path, source.content);
    const maintainability = maintainabilityAnalyzer.analyze(source.path, source.content, complexity.complexity);
    const imports = [...source.content.matchAll(importPattern)].map((match) => match[1]);
    const analyzedFile: FileAnalysis = {
      ...source,
      lineCount: maintainability.lineCount,
      complexity: complexity.complexity,
      maintainability: maintainability.score,
      imports,
    };
    files.push(analyzedFile);
    if (complexity.finding) findings.push(complexity.finding);
    if (maintainability.finding) findings.push(maintainability.finding);
    findings.push(...securityAnalyzer.analyze(source.path, source.content));
  }

  await reportStage("analyzing dependencies and detecting cycles", 56);
  const dependencies = dependencyAnalyzer.analyze(files);
  findings.push(...architectureAnalyzer.analyze(dependencies));

  await reportStage("detecting normalized duplicate code blocks", 72);
  findings.push(...duplicationAnalyzer.analyze(sourceFiles));
  const uniqueFindings = [...new Map(findings.map((finding) => [finding.fingerprint, finding])).values()];

  await reportStage("calculating technical debt and code health scores", 86);
  const averageMaintainability = files.length
    ? files.reduce((sum, file) => sum + file.maintainability, 0) / files.length
    : 0;
  const circularDependencies = dependencies.filter((edge) => edge.circular).length;
  const fanInCounts = new Map<string, number>();
  for (const edge of dependencies) fanInCounts.set(edge.target, (fanInCounts.get(edge.target) ?? 0) + 1);

  return {
    files,
    findings: uniqueFindings,
    dependencies,
    metrics: {
      filesAnalyzed: files.length,
      linesAnalyzed: files.reduce((sum, file) => sum + file.lineCount, 0),
      maintainability: Math.round(averageMaintainability),
      codeQuality: Math.max(0, Math.round(averageMaintainability - uniqueFindings.filter((finding) => finding.severity === "HIGH" || finding.severity === "CRITICAL").length * 3)),
      codebaseHealth: Math.max(0, Math.round(100 - uniqueFindings.length * 1.7)),
      technicalDebtHours: uniqueFindings.reduce((sum, finding) => sum + finding.estimatedEffort, 0),
      architectureRisk: Math.min(100, Math.round(
        circularDependencies * 20 +
        [...fanInCounts.values()].filter((count) => count >= 12).length * 12 +
        (dependencies.length / Math.max(files.length, 1)) * 5,
      )),
      complexity: files.length ? Math.round(files.reduce((sum, file) => sum + file.complexity, 0) / files.length) : 0,
      dependencyEdges: dependencies.length,
      circularDependencies,
    },
  };
}

export const supportedLanguages = Object.keys(codeExtensions);
export { codeExtensions };
export type { SourceFile };
