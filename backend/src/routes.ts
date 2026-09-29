import { Router, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { analyzeSource } from "./analyzers/analyze.js";
import { getDatabase } from "./db.js";
import { fetchSourceFiles, getBranches, getRepository, parseGitHubUrl } from "./github/client.js";

export const router = Router();
const runSchema = z.object({ repositoryId: z.string().min(1), branch: z.string().min(1).max(255) });
const connectSchema = z.object({ url: z.string().url() });
const repositoryBranchesSchema = z.object({
  owner: z.string().min(1).max(100).regex(/^[\w.-]+$/),
  repo: z.string().min(1).max(100).regex(/^[\w.-]+$/),
});
const aiSchema = z.object({ analysisId: z.string().min(1), question: z.string().min(1).max(2000) });
const issueUpdateSchema = z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "IGNORED"]) });
const wrap = (handler: (request: Request, response: Response) => Promise<unknown>): RequestHandler =>
  (request, response, next) => { void handler(request, response).catch(next); };
const pathParam = (request: Request, key: string): string => {
  const value = request.params[key];
  if (typeof value !== "string") throw Object.assign(new Error(`Missing route parameter: ${key}.`), { status: 400 });
  return value;
};

router.post("/repositories/connect", wrap(async (request, response) => {
  const { url } = connectSchema.parse(request.body);
  const parsed = parseGitHubUrl(url);
  const remote = await getRepository(parsed.fullName);
  const db = getDatabase();
  const repository = await db.repository.upsert({
    where: { fullName: remote.full_name },
    create: { owner: remote.full_name.split("/")[0], name: remote.full_name.split("/")[1], fullName: remote.full_name, htmlUrl: remote.html_url, defaultBranch: remote.default_branch ?? "" },
    update: { htmlUrl: remote.html_url, defaultBranch: remote.default_branch ?? "" },
  });
  if (remote.default_branch) {
    await db.branch.upsert({
      where: { repositoryId_name: { repositoryId: repository.id, name: remote.default_branch } },
      create: { repositoryId: repository.id, name: remote.default_branch },
      update: {},
    });
  }
  response.status(201).json({
    repository: { ...repository, branches: remote.default_branch ? [{ name: remote.default_branch }] : [] },
  });
}));

router.get("/repositories", wrap(async (_request, response) => {
  const repositories = await getDatabase().repository.findMany({
    orderBy: { updatedAt: "desc" }, include: { branches: { orderBy: { name: "asc" } }, analyses: { orderBy: { startedAt: "desc" }, take: 1, select: { id: true, status: true, commitSha: true, startedAt: true } } },
  });
  response.json({ repositories });
}));

router.get("/repositories/branches", wrap(async (request, response) => {
  const { owner, repo } = repositoryBranchesSchema.parse(request.query);
  const repository = await getRepository(`${owner}/${repo}`);
  const branches = await getBranches(repository.full_name, repository.default_branch);
  response.json({
    defaultBranch: repository.default_branch,
    branches: branches.map(({ name }) => ({ name, isDefault: name === repository.default_branch })),
  });
}));

router.get("/repositories/:id/branches", wrap(async (request, response) => {
  const branches = await getDatabase().branch.findMany({ where: { repositoryId: pathParam(request, "id") }, orderBy: { name: "asc" } });
  response.json({ branches });
}));

router.get("/repositories/:id/history", wrap(async (request, response) => {
  const analyses = await getDatabase().analysis.findMany({
    where: { repositoryId: pathParam(request, "id"), status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    take: 30,
    select: { id: true, commitSha: true, completedAt: true, branch: { select: { name: true } }, metrics: { select: { name: true, value: true } } },
  });
  response.json({
    analyses: analyses.reverse().map((analysis) => ({
      id: analysis.id,
      commitSha: analysis.commitSha,
      completedAt: analysis.completedAt,
      branch: analysis.branch,
      metrics: Object.fromEntries(analysis.metrics.map(({ name, value }) => [name, value])),
    })),
  });
}));

router.post("/analysis/run", wrap(async (request, response) => {
  const { repositoryId, branch: branchName } = runSchema.parse(request.body);
  const db = getDatabase();
  const repository = await db.repository.findUnique({ where: { id: repositoryId } });
  if (!repository) {
    response.status(404).json({ error: { code: "REPOSITORY_NOT_FOUND", message: "Connect this repository before starting an analysis." } });
    return;
  }
  // Branches are refreshed from GitHub when the user selects a saved repository;
  // persist that selection here so older, partially cached branch lists still work.
  const branch = await db.branch.upsert({
    where: { repositoryId_name: { repositoryId, name: branchName } },
    create: { repositoryId, name: branchName },
    update: {},
  });
  const analysis = await db.analysis.create({
    data: { repositoryId, branchId: branch.id, commitSha: "pending", analyzerVersion: "heuristics-v1", status: "PROCESSING", stage: "connecting to GitHub", progress: 5 },
  });
  console.info(`Analysis ${analysis.id} queued for ${repository.fullName}@${branchName}.`);
  response.status(202).json({ analysisId: analysis.id, status: analysis.status, message: "Analysis queued." });
  void runAnalysis(analysis.id, repository.fullName, branchName);
}));

router.get("/analysis/:id", wrap(async (request, response) => {
  const analysis = await getDatabase().analysis.findUnique({
    where: { id: pathParam(request, "id") },
    select: { id: true, status: true, stage: true, progress: true, error: true, commitSha: true, startedAt: true, completedAt: true, repository: { select: { fullName: true, htmlUrl: true } }, branch: { select: { name: true } } },
  });
  if (!analysis) {
    response.status(404).json({ error: { code: "ANALYSIS_NOT_FOUND", message: "Analysis not found." } });
    return;
  }
  response.json({ analysis });
}));

router.get("/analysis/:id/summary", wrap(async (request, response) => {
  const analysis = await getDatabase().analysis.findUnique({
    where: { id: pathParam(request, "id") },
    include: { metrics: true, _count: { select: { files: true, issues: true, dependencies: true } } },
  });
  if (!analysis) {
    response.status(404).json({ error: { code: "ANALYSIS_NOT_FOUND", message: "Analysis not found." } });
    return;
  }
  response.json({ analysis: { id: analysis.id, status: analysis.status, stage: analysis.stage, progress: analysis.progress, commitSha: analysis.commitSha, startedAt: analysis.startedAt, completedAt: analysis.completedAt }, metrics: Object.fromEntries(analysis.metrics.map(({ name, value }) => [name, value])), counts: analysis._count });
}));

router.get("/analysis/:id/issues", wrap(async (request, response) => {
  const severity = typeof request.query.severity === "string" ? request.query.severity.toUpperCase() : undefined;
  if (severity && !["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(severity)) {
    response.status(400).json({ error: { code: "INVALID_SEVERITY", message: "Severity must be LOW, MEDIUM, HIGH, or CRITICAL." } });
    return;
  }
  const issues = await getDatabase().issue.findMany({
    where: { analysisId: pathParam(request, "id"), ...(severity ? { severity } : {}), ...(typeof request.query.category === "string" ? { category: request.query.category.toUpperCase() } : {}) },
    include: { file: { select: { path: true } } }, orderBy: [{ severity: "desc" }, { category: "asc" }],
  });
  response.json({ issues });
}));

router.get("/issues", wrap(async (request, response) => {
  const analysisId = z.string().min(1).parse(request.query.analysisId);
  const status = typeof request.query.status === "string" ? request.query.status.toUpperCase() : undefined;
  const severity = typeof request.query.severity === "string" ? request.query.severity.toUpperCase() : undefined;
  const category = typeof request.query.category === "string" ? request.query.category.toUpperCase() : undefined;
  const issues = await getDatabase().issue.findMany({
    where: {
      analysisId,
      ...(status && ["OPEN", "IN_PROGRESS", "RESOLVED", "IGNORED"].includes(status) ? { status } : {}),
      ...(severity && ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(severity) ? { severity } : {}),
      ...(category ? { category } : {}),
    },
    include: { file: { select: { id: true, path: true } } },
    orderBy: [{ severity: "desc" }, { category: "asc" }],
  });
  response.json({ issues });
}));

router.get("/issues/:id", wrap(async (request, response) => {
  const issue = await getDatabase().issue.findUnique({
    where: { id: pathParam(request, "id") },
    include: { file: { select: { id: true, path: true, content: true, language: true } }, analysis: { select: { id: true, commitSha: true, repository: { select: { fullName: true } } } } },
  });
  if (!issue) {
    response.status(404).json({ error: { code: "ISSUE_NOT_FOUND", message: "Issue not found." } });
    return;
  }
  response.json({ issue });
}));

router.patch("/issues/:id", wrap(async (request, response) => {
  const { status } = issueUpdateSchema.parse(request.body);
  const issue = await getDatabase().issue.update({ where: { id: pathParam(request, "id") }, data: { status } });
  response.json({ issue });
}));

router.get("/analysis/:id/files", wrap(async (request, response) => {
  const query = typeof request.query.q === "string" ? request.query.q.slice(0, 200) : undefined;
  const files = await getDatabase().file.findMany({
    where: { analysisId: pathParam(request, "id"), ...(query ? { path: { contains: query, mode: "insensitive" } } : {}) },
    select: { id: true, path: true, language: true, lineCount: true, complexity: true, maintainability: true }, orderBy: { path: "asc" }, take: 500,
  });
  response.json({ files });
}));

router.get("/code/files", wrap(async (request, response) => {
  const analysisId = z.string().min(1).parse(request.query.analysisId);
  const files = await getDatabase().file.findMany({
    where: { analysisId },
    select: { id: true, path: true, language: true, lineCount: true, complexity: true, maintainability: true },
    orderBy: { path: "asc" },
    take: 500,
  });
  response.json({ files });
}));

router.get("/analysis/:id/files/:fileId", wrap(async (request, response) => {
  const file = await getDatabase().file.findFirst({
    where: { id: pathParam(request, "fileId"), analysisId: pathParam(request, "id") },
    select: { id: true, path: true, language: true, lineCount: true, complexity: true, maintainability: true, content: true, issues: { select: { id: true, severity: true, category: true, title: true, description: true, line: true, recommendation: true } } },
  });
  if (!file) {
    response.status(404).json({ error: { code: "FILE_NOT_FOUND", message: "File not found in this analysis." } });
    return;
  }
  response.json({ file });
}));

router.get("/code/file/:id", wrap(async (request, response) => {
  const file = await getDatabase().file.findUnique({
    where: { id: pathParam(request, "id") },
    select: { id: true, analysisId: true, path: true, language: true, lineCount: true, complexity: true, maintainability: true, content: true, issues: { select: { id: true, severity: true, category: true, title: true, description: true, line: true, recommendation: true, impact: true, estimatedEffort: true, status: true } } },
  });
  if (!file) {
    response.status(404).json({ error: { code: "FILE_NOT_FOUND", message: "File not found." } });
    return;
  }
  response.json({ file });
}));

router.get("/analysis/:id/dependencies", wrap(async (request, response) => {
  const dependencies = await getDatabase().dependency.findMany({
    where: { analysisId: pathParam(request, "id") },
    include: { sourceFile: { select: { path: true } }, targetFile: { select: { path: true } } },
  });
  response.json({ dependencies });
}));

router.get("/dependencies", wrap(async (request, response) => {
  const analysisId = z.string().min(1).parse(request.query.analysisId);
  const dependencies = await getDatabase().dependency.findMany({
    where: { analysisId },
    include: { sourceFile: { select: { id: true, path: true, complexity: true, maintainability: true } }, targetFile: { select: { id: true, path: true, complexity: true, maintainability: true } } },
  });
  response.json({ dependencies });
}));

router.post("/analysis/:id/impact", wrap(async (request, response) => {
  const input = z.object({ filePath: z.string().min(1).max(500) }).parse(request.body);
  const db = getDatabase();
  const files = await db.file.findMany({ where: { analysisId: pathParam(request, "id") }, select: { id: true, path: true } });
  const target = files.find((file) => file.path === input.filePath);
  if (!target) {
    response.status(404).json({ error: { code: "FILE_NOT_FOUND", message: "The selected file is not part of this analysis." } });
    return;
  }
  const edges = await db.dependency.findMany({ where: { analysisId: pathParam(request, "id") }, select: { sourceFileId: true, targetFileId: true } });
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) adjacency.set(edge.targetFileId, [...(adjacency.get(edge.targetFileId) ?? []), edge.sourceFileId]);
  const affected = new Set<string>();
  const queue = [...(adjacency.get(target.id) ?? [])];
  while (queue.length && affected.size < 2000) {
    const current = queue.shift()!;
    if (current === target.id || affected.has(current)) continue;
    affected.add(current);
    queue.push(...(adjacency.get(current) ?? []));
  }
  const affectedFiles = files.filter((file) => affected.has(file.id));
  response.json({ target: target.path, directlyAffected: adjacency.get(target.id)?.length ?? 0, transitiveAffected: affectedFiles.length, files: affectedFiles });
}));

router.post("/change-impact/analyze", wrap(async (request, response) => {
  const input = z.object({ analysisId: z.string().min(1), filePath: z.string().min(1).max(500), change: z.string().max(2000).optional() }).parse(request.body);
  const db = getDatabase();
  const target = await db.file.findFirst({ where: { analysisId: input.analysisId, path: input.filePath }, select: { id: true, path: true } });
  if (!target) {
    response.status(404).json({ error: { code: "FILE_NOT_FOUND", message: "The selected file is not part of this analysis." } });
    return;
  }
  const edges = await db.dependency.findMany({ where: { analysisId: input.analysisId }, select: { sourceFileId: true, targetFileId: true } });
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) adjacency.set(edge.targetFileId, [...(adjacency.get(edge.targetFileId) ?? []), edge.sourceFileId]);
  const direct = new Set(adjacency.get(target.id) ?? []);
  const affected = new Set(direct);
  const queue = [...direct];
  while (queue.length && affected.size < 2000) {
    const current = queue.shift()!;
    for (const dependent of adjacency.get(current) ?? []) {
      if (dependent !== target.id && !affected.has(dependent)) {
        affected.add(dependent);
        queue.push(dependent);
      }
    }
  }
  const files = await db.file.findMany({
    where: { id: { in: [...affected] } },
    select: { id: true, path: true, complexity: true, maintainability: true, issues: { where: { status: "OPEN" }, select: { severity: true } } },
  });
  const highRisk = files.reduce((sum, file) => sum + file.issues.filter((issue) => issue.severity === "HIGH" || issue.severity === "CRITICAL").length, 0);
  response.json({
    target: target.path,
    change: input.change ?? "",
    directFiles: files.filter((file) => direct.has(file.id)),
    indirectFiles: files.filter((file) => !direct.has(file.id)),
    risk: highRisk >= 3 || affected.size >= 20 ? "HIGH" : highRisk > 0 || affected.size >= 8 ? "MEDIUM" : "LOW",
    blastRadius: affected.size,
    risks: highRisk ? [`${highRisk} high-severity open finding(s) occur in affected modules.`] : [],
    precautions: ["Review each affected caller before merging.", "Run targeted tests for affected modules; test coverage is not measured by this analyzer."],
  });
}));

router.post("/ai/insights", wrap(async (request, response) => {
  const { analysisId, question } = aiSchema.parse(request.body);
  const db = getDatabase();
  const analysis = await db.analysis.findUnique({ where: { id: analysisId }, include: { repository: { select: { fullName: true } }, metrics: true, issues: { where: { status: "OPEN" }, take: 30, include: { file: { select: { path: true } } } } } });
  if (!analysis || analysis.status !== "COMPLETED") {
    response.status(404).json({ error: { code: "ANALYSIS_NOT_READY", message: "A completed analysis is required for grounded AI insights." } });
    return;
  }
  const context = { repository: analysis.repository.fullName, commit: analysis.commitSha, metrics: Object.fromEntries(analysis.metrics.map(({ name, value }) => [name, value])), findings: analysis.issues.map(({ id, title, severity, category, description, file, line }) => ({ id, title, severity, category, description, file: file?.path, line })) };
  if (!process.env.AI_BASE_URL || !process.env.AI_API_KEY) {
    response.status(503).json({ error: { code: "AI_NOT_CONFIGURED", message: "AI insights are unavailable because AI_BASE_URL and AI_API_KEY are not configured." } });
    return;
  }
  const upstream = await fetch(`${process.env.AI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.AI_MODEL ?? "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "Explain only the supplied deterministic analysis evidence. Never invent metrics or repository facts. Cite finding IDs and file:line references; say when evidence is insufficient." },
        { role: "user", content: JSON.stringify({ question, evidence: context }) },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!upstream.ok) {
    console.error(`AI provider returned ${upstream.status}.`);
    response.status(502).json({ error: { code: "AI_PROVIDER_ERROR", message: "The configured AI provider could not complete the request." } });
    return;
  }
  const body = await upstream.json() as { choices?: Array<{ message?: { content?: string } }> };
  const answer = body.choices?.[0]?.message?.content;
  if (!answer) throw new Error("AI provider returned an empty answer.");
  const insight = await db.aIInsight.create({
    data: { analysisId, kind: "EXPLANATION", title: question.slice(0, 120), body: answer, evidence: context, provider: new URL(process.env.AI_BASE_URL).host },
    select: { id: true },
  });
  response.json({ id: insight.id, answer, provider: new URL(process.env.AI_BASE_URL).host, analysisId, commitSha: analysis.commitSha });
}));

router.post("/ai/chat", wrap(async (request, response) => {
  const input = aiSchema.parse(request.body);
  request.body = { analysisId: input.analysisId, question: input.question };
  const analysisId = input.analysisId;
  const db = getDatabase();
  const analysis = await db.analysis.findUnique({
    where: { id: analysisId },
    include: { repository: { select: { fullName: true } }, metrics: true, issues: { where: { status: "OPEN" }, take: 30, include: { file: { select: { path: true } } } } },
  });
  if (!analysis || analysis.status !== "COMPLETED") {
    response.status(404).json({ error: { code: "ANALYSIS_NOT_READY", message: "A completed analysis is required for grounded AI insights." } });
    return;
  }
  if (!process.env.AI_BASE_URL || !process.env.AI_API_KEY) {
    response.status(503).json({ error: { code: "AI_NOT_CONFIGURED", message: "AI insights are unavailable because AI_BASE_URL and AI_API_KEY are not configured." } });
    return;
  }
  const evidence = {
    repository: analysis.repository.fullName,
    commit: analysis.commitSha,
    metrics: Object.fromEntries(analysis.metrics.map(({ name, value }) => [name, value])),
    findings: analysis.issues.map(({ id, title, severity, category, description, file, line, recommendation }) => ({ id, title, severity, category, description, recommendation, file: file?.path, line })),
  };
  const upstream = await fetch(`${process.env.AI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.AI_MODEL ?? "gpt-4o-mini", temperature: 0.2, messages: [
      { role: "system", content: "Answer using only supplied analysis evidence. Do not invent repository facts or metrics. Cite finding IDs and file:line references; state when evidence is insufficient." },
      { role: "user", content: JSON.stringify({ question: input.question, evidence }) },
    ] }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!upstream.ok) {
    console.error(`AI provider returned ${upstream.status}.`);
    response.status(502).json({ error: { code: "AI_PROVIDER_ERROR", message: "The configured AI provider could not complete the request." } });
    return;
  }
  const body = await upstream.json() as { choices?: Array<{ message?: { content?: string } }> };
  const answer = body.choices?.[0]?.message?.content;
  if (!answer) throw new Error("AI provider returned an empty answer.");
  const insight = await db.aIInsight.create({ data: { analysisId, kind: "CHAT", title: input.question.slice(0, 120), body: answer, evidence, provider: new URL(process.env.AI_BASE_URL).host }, select: { id: true } });
  response.json({ id: insight.id, answer, evidence: { analysisId, commitSha: analysis.commitSha }, provider: new URL(process.env.AI_BASE_URL).host });
}));

async function runAnalysis(analysisId: string, fullName: string, branch: string): Promise<void> {
  const db = getDatabase();
  try {
    console.info(`Analysis ${analysisId} fetching source for ${fullName}@${branch}.`);
    await db.analysis.update({ where: { id: analysisId }, data: { stage: "scanning repository tree and supported source files", progress: 15 } });
    const { sha, files } = await fetchSourceFiles(fullName, branch, async (stage, progress) => {
      await db.analysis.update({ where: { id: analysisId }, data: { stage, progress } });
    });
    await db.analysis.update({ where: { id: analysisId }, data: { commitSha: sha, stage: `scanned ${files.length} supported source files`, progress: 30 } });
    const result = await analyzeSource(files, async (stage, progress) => {
      await db.analysis.update({ where: { id: analysisId }, data: { stage, progress } });
    });
    await db.analysis.update({ where: { id: analysisId }, data: { stage: "persisting analysis snapshot", progress: 90 } });
    await db.$transaction(async (tx) => {
      const fileIds = new Map<string, string>();
      const savedFiles = await tx.file.createManyAndReturn({
        data: result.files.map((file) => ({
          analysisId,
          path: file.path,
          language: file.language,
          lineCount: file.lineCount,
          complexity: file.complexity,
          maintainability: file.maintainability,
          content: file.content,
        })),
        select: { id: true, path: true },
      });
      for (const file of savedFiles) fileIds.set(file.path, file.id);

      const issueData = result.findings.map((finding) => ({
        analysisId,
        fileId: fileIds.get(finding.filePath) ?? null,
        fingerprint: finding.fingerprint,
        severity: finding.severity,
        category: finding.category,
        title: finding.title,
        description: finding.description,
        line: finding.line,
        metric: finding.metric,
        impact: finding.impact,
        estimatedEffort: finding.estimatedEffort,
        recommendation: finding.recommendation,
      }));
      for (let index = 0; index < issueData.length; index += 250) {
        await tx.issue.createMany({ data: issueData.slice(index, index + 250) });
      }

      const dependencyData = [...new Map(result.dependencies
        .map((edge) => ({ analysisId, sourceFileId: findFileId(fileIds, edge.source), targetFileId: findFileId(fileIds, edge.target), kind: edge.kind, circular: edge.circular }))
        .filter((edge): edge is typeof edge & { sourceFileId: string; targetFileId: string } => Boolean(edge.sourceFileId && edge.targetFileId))
        .map((edge) => [`${edge.sourceFileId}:${edge.targetFileId}:${edge.kind}`, edge] as const)).values()];
      for (let index = 0; index < dependencyData.length; index += 500) {
        await tx.dependency.createMany({ data: dependencyData.slice(index, index + 500) });
      }
      await tx.metric.createMany({ data: Object.entries(result.metrics).map(([name, value]) => ({ analysisId, name, value })) });
      await tx.analysis.update({ where: { id: analysisId }, data: { status: "COMPLETED", stage: "complete", progress: 100, completedAt: new Date() } });
    }, { maxWait: 10_000, timeout: 120_000 });
    console.info(`Analysis ${analysisId} completed for ${fullName}@${branch}: ${result.files.length} files, ${result.findings.length} findings.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed unexpectedly.";
    console.error(`Analysis ${analysisId} failed:`, message);
    await db.analysis.update({ where: { id: analysisId }, data: { status: "FAILED", stage: "failed", error: message.slice(0, 1000), completedAt: new Date() } }).catch((persistError: unknown) => console.error("Could not persist analysis failure:", persistError));
  }
}

function findFileId(fileIds: Map<string, string>, normalizedPath: string): string | undefined {
  const match = [...fileIds.keys()].find((path) => path.replace(/\.(tsx?|jsx?|mjs|cjs)$/, "") === normalizedPath);
  return match ? fileIds.get(match) : undefined;
}
