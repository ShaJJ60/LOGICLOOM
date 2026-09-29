export const repositoryMetrics = {
  codeQuality: 71,
  codebaseHealth: 74,
  technicalDebtHours: 68,
  architectureRisk: 74,
  complexity: 82,
  testCoverage: 78,
};

export type ImpactSimulation = {
  directFiles: number;
  indirectFiles: number;
  apiPaths: number;
  affectedTests: number;
  debtBefore: number;
  debtAfter: number;
  architectureBefore: number;
  architectureAfter: number;
  complexityBefore: number;
  complexityAfter: number;
  risks: string[];
  effort: string;
};

export function simulateSampleChange(filePath: string, includeTests: boolean): ImpactSimulation {
  const checkout = filePath.includes("checkout");
  return {
    directFiles: checkout ? 4 : 2,
    indirectFiles: checkout ? 13 : 5,
    apiPaths: checkout ? 3 : 1,
    affectedTests: includeTests ? checkout ? 7 : 3 : 0,
    debtBefore: repositoryMetrics.technicalDebtHours,
    debtAfter: checkout ? 51 : 62,
    architectureBefore: repositoryMetrics.architectureRisk,
    architectureAfter: checkout ? 60 : 68,
    complexityBefore: repositoryMetrics.complexity,
    complexityAfter: checkout ? 64 : 76,
    risks: checkout
      ? ["Payment error handling must preserve existing behavior", "Cart state cleanup crosses service boundaries"]
      : ["Callers may depend on the current module contract"],
    effort: checkout ? "1–2 engineering days" : "Half to one engineering day",
  };
}

export const checkoutRiskExplanation = {
  heading: "Why is Checkout risky?",
  notice: "Grounded in the sample repository model. This is not a live scan of your source.",
  causes: [
    { title: "High dependency coupling", evidence: "12 imports and 8 downstream dependents in the sample graph." },
    { title: "Function complexity", evidence: "Cyclomatic complexity is 18 in this illustrative analysis." },
    { title: "Duplicated validation", evidence: "Validation behavior appears across 4 sample modules." },
  ],
  architecture: ["Validation", "Cart", "Payment"],
};
