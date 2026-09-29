export type SourceFile = { path: string; content: string; language: string };

export type FileAnalysis = SourceFile & {
  lineCount: number;
  complexity: number;
  maintainability: number;
  imports: string[];
};

export type Finding = {
  fingerprint: string;
  filePath: string;
  line: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  category: "COMPLEXITY" | "DUPLICATION" | "DEPENDENCY" | "MAINTAINABILITY" | "SECURITY" | "ARCHITECTURE";
  title: string;
  description: string;
  metric: Record<string, number | string>;
  impact: string;
  estimatedEffort: number;
  recommendation: string;
};

export type AnalyzedDependency = { source: string; target: string; kind: "IMPORT"; circular: boolean };

export type AnalysisResult = {
  files: FileAnalysis[];
  findings: Finding[];
  dependencies: AnalyzedDependency[];
  metrics: Record<string, number>;
};
