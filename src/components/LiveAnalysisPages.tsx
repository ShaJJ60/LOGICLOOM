import { useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { AlertTriangle, Check, Code2, FileCode2, Network, Play, Search, ShieldAlert, Sparkles, X } from "lucide-react";
import { apiRequest, type AnalysisIssue, type AnalysisSummary, type AnalyzedDependency, type AnalyzedFile, type FileSource } from "../services/api";
import type { Issue } from "../data";
import "../live-analysis-pages.css";

type HeadingProps = { title: string; subtitle: string; action?: React.ReactNode };
function Heading({ title, subtitle, action }: HeadingProps) {
  return <div className="page-heading"><div><div className="eyebrow">LIVE REPOSITORY ANALYSIS</div><h1>{title}</h1><p>{subtitle}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}
const severityLabel = (value: string) => value === "CRITICAL" ? "Critical" : value[0] + value.slice(1).toLowerCase();
const categoryLabel = (value: string) => value[0] + value.slice(1).toLowerCase();

type IssueDetails = AnalysisIssue & {
  impact?: string;
  estimatedEffort?: number;
  status?: string;
  metric?: Record<string, number | string>;
  file: ({ id: string; path: string; content?: string; language?: string } | null);
};

export function LiveIssuesPage({ analysisId, onOpenCode, initialIssueId, debtOnly = false }: { analysisId: string; onOpenCode: (issue: IssueDetails) => void; initialIssueId?: string; debtOnly?: boolean }) {
  const [items, setItems] = useState<IssueDetails[]>([]);
  const [category, setCategory] = useState("All");
  const [severity, setSeverity] = useState("All");
  const [status, setStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [fileFilter, setFileFilter] = useState("");
  const [sortBy, setSortBy] = useState("Severity");
  const [selected, setSelected] = useState<IssueDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const load = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await apiRequest<{ issues: IssueDetails[] }>(`/issues?analysisId=${encodeURIComponent(analysisId)}&status=${status === "All" ? "" : status}&category=${category === "All" ? "" : category.toUpperCase()}&severity=${severity === "All" ? "" : severity.toUpperCase()}`);
      setItems(result.issues);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load analysis findings.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [analysisId, category, severity, status]);
  useEffect(() => {
    if (!initialIssueId) return;
    const match = items.find((issue) => issue.id === initialIssueId);
    if (match) setSelected(match);
  }, [initialIssueId, items]);
  const markResolved = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await apiRequest<{ issue: IssueDetails }>(`/issues/${selected.id}`, { method: "PATCH", body: JSON.stringify({ status: "RESOLVED" }) });
      setSelected(result.issue);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update issue.");
    } finally {
      setBusy(false);
    }
  };
  const showDetails = async (issue: IssueDetails) => {
    setSelected(issue);
    setAiAnswer("");
    setDetailLoading(true);
    try {
      const result = await apiRequest<{ issue: IssueDetails }>(`/issues/${issue.id}`);
      setSelected(result.issue);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load issue details.");
    } finally {
      setDetailLoading(false);
    }
  };
  const askAI = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ answer: string }>("/ai/chat", { method: "POST", body: JSON.stringify({ analysisId, question: `Explain finding ${selected.id}: ${selected.title}. Include a concrete remediation recommendation based only on this analysis evidence.` }) });
      setAiAnswer(result.answer);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not request AI explanation.");
    } finally {
      setBusy(false);
    }
  };
  const severityRank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  const visibleItems = items.filter((issue) => (!debtOnly || (issue.estimatedEffort ?? 0) > 0) &&
    `${issue.title} ${issue.description} ${issue.file?.path ?? ""} ${issue.category} ${issue.id}`.toLowerCase().includes(search.toLowerCase()) &&
    (fileFilter === "" || (issue.file?.path ?? "").toLowerCase().includes(fileFilter.toLowerCase())))
    .sort((left, right) => sortBy === "File"
      ? (left.file?.path ?? "").localeCompare(right.file?.path ?? "")
      : sortBy === "Complexity"
        ? Number(right.metric?.complexity ?? 0) - Number(left.metric?.complexity ?? 0)
        : sortBy === "Line number"
          ? left.line - right.line
          : severityRank[right.severity] - severityRank[left.severity] || left.title.localeCompare(right.title));
  return <>
    <Heading title="Issues" subtitle="Evidence-backed findings from this analysis snapshot." action={<span className="live-snapshot-badge"><i />LIVE · {analysisId.slice(0, 8)}</span>} />
    <section className="panel live-issues-panel">
      <div className="live-filter-bar">
        <label>Search<input className="live-filter-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Title, description…" /></label>
        <label>File<input className="live-filter-input" value={fileFilter} onChange={(event) => setFileFilter(event.target.value)} placeholder="Filter file path" /></label>
        <label>Severity<select value={severity} onChange={(event) => setSeverity(event.target.value)}>{["All", "Critical", "High", "Medium", "Low"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{["All", "Complexity", "Duplication", "Architecture", "Security", "Dependency", "Maintainability"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}>{["OPEN", "IN_PROGRESS", "RESOLVED", "IGNORED", "All"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Sort<select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>{["Severity", "File", "Complexity", "Line number"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <span className="live-results-count">{visibleItems.length} findings</span>
      </div>
      <div className="table-scroll"><table className="issues-table"><thead><tr><th>SEVERITY</th><th>ISSUE</th><th>CATEGORY</th><th>FILE · LINE</th><th>IMPACT</th><th>EFFORT</th><th>STATUS</th></tr></thead>
        <tbody>{visibleItems.map((issue) => <tr key={issue.id} onClick={() => void showDetails(issue)}><td><span className={`severity-label severity-text-${severityLabel(issue.severity).toLowerCase()}`}>{severityLabel(issue.severity)}</span></td><td><b>{issue.title}</b></td><td><span className="category-tag">{categoryLabel(issue.category)}</span></td><td className="location-cell">{issue.file?.path ?? "—"}:{issue.line || "—"}</td><td>{issue.impact ?? issue.description}</td><td>{issue.estimatedEffort ?? 0}h</td><td><span className="category-tag">{issue.status ?? "OPEN"}</span></td></tr>)}</tbody>
      </table>{loading && <div className="live-empty">Loading analysis…</div>}{!loading && !error && visibleItems.length === 0 && <div className="live-empty"><Check size={16} />No findings match these filters for this snapshot.</div>}</div>
      {error && <p className="live-error" role="alert"><AlertTriangle size={14} />{error}</p>}
    </section>
    {selected && <div className="live-detail-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
      <aside className="live-issue-detail" role="dialog" aria-modal="true" aria-label="Issue details">
        <header><div><span className="eyebrow">ISSUE DETAILS</span><h2>{selected.title}</h2></div><button className="icon-button" aria-label="Close details" onClick={() => setSelected(null)}><X size={16} /></button></header>
        <div className="live-detail-content">
        {detailLoading && <p className="live-detail-loading">Loading source evidence…</p>}
          <div className="detail-badges"><span className={`severity-label severity-text-${severityLabel(selected.severity).toLowerCase()}`}>{severityLabel(selected.severity)}</span><span className="category-tag">{categoryLabel(selected.category)}</span><span className="category-tag">{selected.status ?? "OPEN"}</span></div>
          <p>{selected.description}</p>
          <div className="detail-fact"><span>Affected file</span><b>{selected.file?.path ?? "Repository"}{selected.line > 0 ? `:${selected.line}` : ""}</b></div>
          <div className="detail-fact"><span>Why it matters</span><b>{selected.impact ?? "No impact rationale was recorded by the analyzer."}</b></div>
          <div className="detail-fact"><span>Estimated effort</span><b>{selected.estimatedEffort === undefined ? "Not estimated" : `${selected.estimatedEffort} hours`}</b></div>
          <div className="detail-fact"><span>Measured evidence</span><b>{selected.metric ? Object.entries(selected.metric).map(([key, value]) => `${key}: ${value}`).join(" · ") : "See source and finding details"}</b></div>
          {selected.file?.content !== undefined && <div className="detail-code"><div>{selected.file.path}:{selected.line}</div><pre>{selected.file.content.split(/\r?\n/).slice(Math.max(0, selected.line - 3), selected.line + 2).map((line, index) => <code className={index === Math.min(2, selected.line - 1) ? "target-line" : ""} key={index}>{line || " "}</code>)}</pre></div>}
          <div className="detail-fact recommendation"><span>Recommended fix</span><b>{selected.recommendation}</b></div>
          {aiAnswer && <div className="live-ai-answer"><b>AI explanation</b><p>{aiAnswer}</p></div>}
          {error && <p className="live-error" role="alert">{error}</p>}
        </div>
        <footer><button className="button-secondary" onClick={() => onOpenCode(selected)}><Code2 size={14} />Open in Code Explorer</button><button className="button-secondary" disabled={busy} onClick={() => void askAI()}><Sparkles size={14} />Ask AI</button><button className="button-primary" disabled={busy || selected.status === "RESOLVED"} onClick={() => void markResolved()}><Check size={14} />Mark Resolved</button></footer>
      </aside>
    </div>}
  </>;
}

export function LiveCodeExplorer({ analysisId, selectedIssue, selectedFilePath, onIssueSelect }: { analysisId: string; selectedIssue: Issue | null; selectedFilePath?: string; onIssueSelect: (issue: Issue) => void }) {
  const [files, setFiles] = useState<AnalyzedFile[]>([]);
  const [dependencies, setDependencies] = useState<AnalyzedDependency[]>([]);
  const [file, setFile] = useState<FileSource | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingSource, setLoadingSource] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  useEffect(() => {
    setLoadingFiles(true);
    setError("");
    apiRequest<{ files: AnalyzedFile[] }>(`/code/files?analysisId=${encodeURIComponent(analysisId)}`)
      .then(({ files: list }) => setFiles(list))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load analyzed files."))
      .finally(() => setLoadingFiles(false));
  }, [analysisId]);
  useEffect(() => {
    apiRequest<{ dependencies: AnalyzedDependency[] }>(`/dependencies?analysisId=${encodeURIComponent(analysisId)}`)
      .then(({ dependencies: result }) => setDependencies(result))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load file dependencies."));
  }, [analysisId]);
  const loadFile = async (item: AnalyzedFile) => {
    setLoadingSource(true);
    setError("");
    setFile(null);
    try {
      const result = await apiRequest<{ file: FileSource }>(`/code/file/${item.id}`);
      setFile(result.file);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load source file.");
    } finally {
      setLoadingSource(false);
    }
  };
  useEffect(() => {
    const path = selectedIssue?.file ?? selectedFilePath;
    if (!path) return;
    const match = files.find((item) => item.path === path);
    if (match) void loadFile(match);
  }, [analysisId, selectedIssue?.file, selectedIssue?.line, selectedFilePath, files]);
  const onMount: OnMount = (editor) => { editorRef.current = editor; setEditorReady(true); };
  useEffect(() => {
    if (!file) return;
    const editor = editorRef.current;
    if (!editor) return;
    const activeLine = selectedIssue?.file === file.path ? selectedIssue.line : undefined;
    if (activeLine) editor.revealLineInCenter(activeLine);
    const decorations = editor.deltaDecorations([], file.issues.filter((issue) => issue.line > 0).map((issue) => ({
      range: { startLineNumber: issue.line, startColumn: 1, endLineNumber: issue.line, endColumn: 1 },
      options: { isWholeLine: true, className: issue.line === activeLine ? "logicloom-highlight-line-active" : "logicloom-highlight-line", glyphMarginClassName: "logicloom-highlight-glyph" },
    })));
    return () => { editor.deltaDecorations(decorations, []); };
  }, [editorReady, file, selectedIssue]);
  const visibleFiles = files.filter((item) => item.path.toLowerCase().includes(filter.toLowerCase()));
  const filesByFolder = new Map<string, AnalyzedFile[]>();
  for (const item of visibleFiles) {
    const folder = item.path.includes("/") ? item.path.slice(0, item.path.lastIndexOf("/")) : "(root)";
    filesByFolder.set(folder, [...(filesByFolder.get(folder) ?? []), item]);
  }
  return <>
    <Heading title="Code Explorer" subtitle="Browse analyzed source with file-level metrics and finding locations." action={<span className="live-snapshot-badge"><i />COMMIT {analysisId.slice(0, 8)}</span>} />
    <div className="live-code-layout">
      <section className="panel live-file-browser"><h3>Repository files <small>{files.length}</small></h3><label className="live-file-search"><Search size={13} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter files" /></label>{loadingFiles ? <div className="live-empty">Loading analysis…</div> : [...filesByFolder].map(([folder, folderFiles]) => <details className="live-file-folder" key={folder} open><summary>{folder} <small>{folderFiles.length}</small></summary>{folderFiles.map((item) => <button className={file?.id === item.id ? "selected" : ""} key={item.id} onClick={() => void loadFile(item)}><FileCode2 size={13} /><span>{item.path.split("/").pop()}</span></button>)}</details>)}{!loadingFiles && !error && files.length === 0 && <div className="live-empty">No analyzed files are available.</div>}</section>
      <section className="panel live-editor-panel">{loadingSource && <div className="live-empty">Loading source file…</div>}{file && !loadingSource ? <><div className="live-editor-head"><b>{file.path}</b><span>{file.language} · {file.lineCount} lines</span></div><Editor height="620px" language={file.language.toLowerCase()} theme="vs-dark" value={file.content} onMount={onMount} options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, lineNumbers: "on", glyphMargin: true, scrollBeyondLastLine: false, wordWrap: "on" }} /></> : !loadingSource && <div className="live-empty">Select an analyzed file to inspect its source.</div>}</section>
      <aside className="panel live-code-inspector"><h3>Code Intelligence</h3>{file ? <><div className="detail-fact"><span>Code quality</span><b>{file.maintainability}/100 maintainability</b></div><div className="detail-fact"><span>Complexity</span><b>{file.complexity}</b></div><div className="detail-fact"><span>Issues</span><b>{file.issues.length}</b></div><div className="live-file-findings">{file.issues.map((issue) => <button key={issue.id} onClick={() => onIssueSelect({ id: issue.id, title: issue.title, file: file.path, line: issue.line, category: (issue.category ? categoryLabel(issue.category) : "Complexity") as Issue["category"], severity: severityLabel(issue.severity) as Issue["severity"], score: 0, detail: issue.description ?? issue.title, description: issue.description, recommendation: issue.recommendation })}><span>{issue.title}</span><small>Line {issue.line} · {issue.severity}</small><p>What is wrong? {issue.description ?? issue.title}</p><p>How to improve: {issue.recommendation}</p></button>)}</div><div className="detail-fact"><span>Dependencies</span><b>{dependencies.filter((edge) => edge.sourceFile.path === file.path).length}</b></div><div className="detail-fact"><span>Dependents</span><b>{dependencies.filter((edge) => edge.targetFile.path === file.path).length}</b></div>{dependencies.filter((edge) => edge.sourceFile.path === file.path).slice(0, 8).map((edge) => <div className="graph-related-file" key={edge.id}>{edge.targetFile.path}</div>)}</> : <p>Select a file to see source metrics and its findings.</p>}{error && <p className="live-error">{error}</p>}</aside>
    </div>
  </>;
}

export function LiveArchitecture({ analysisId, onOpenCode }: { analysisId: string; onOpenCode: (path: string) => void }) {
  const [files, setFiles] = useState<AnalyzedFile[]>([]);
  const [edges, setEdges] = useState<AnalyzedDependency[]>([]);
  const [issues, setIssues] = useState<AnalysisIssue[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([
      apiRequest<{ files: AnalyzedFile[] }>(`/code/files?analysisId=${encodeURIComponent(analysisId)}`),
      apiRequest<{ dependencies: AnalyzedDependency[] }>(`/dependencies?analysisId=${encodeURIComponent(analysisId)}`),
      apiRequest<{ issues: AnalysisIssue[] }>(`/issues?analysisId=${encodeURIComponent(analysisId)}`),
    ])
      .then(([fileResult, dependencyResult, issueResult]) => {
        setFiles(fileResult.files);
        setEdges(dependencyResult.dependencies);
        setIssues(issueResult.issues);
        setSelected(fileResult.files[0]?.path ?? dependencyResult.dependencies[0]?.sourceFile.path ?? "");
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load dependency graph."))
      .finally(() => setLoading(false));
  }, [analysisId]);
  const nodes = useMemo(() => {
    const map = new Map<string, { path: string; dependencies: Set<string>; dependents: Set<string>; cycles: number }>();
    for (const file of files) map.set(file.path, { path: file.path, dependencies: new Set(), dependents: new Set(), cycles: 0 });
    for (const edge of edges) {
      for (const item of [edge.sourceFile, edge.targetFile]) if (!map.has(item.path)) map.set(item.path, { path: item.path, dependencies: new Set(), dependents: new Set(), cycles: 0 });
      map.get(edge.sourceFile.path)?.dependencies.add(edge.targetFile.path);
      map.get(edge.targetFile.path)?.dependents.add(edge.sourceFile.path);
      if (edge.circular) { map.get(edge.sourceFile.path)!.cycles += 1; map.get(edge.targetFile.path)!.cycles += 1; }
    }
    return [...map.values()].sort((a, b) => (b.cycles * 10 + b.dependents.size) - (a.cycles * 10 + a.dependents.size)).slice(0, 80);
  }, [edges, files]);
  const graphNodes = nodes.slice(0, 40);
  const positions = new Map(graphNodes.map((item, index) => [item.path, { x: 10 + (index % 5) * 20, y: 8 + Math.floor(index / 5) * 12 }]));
  const node = nodes.find((item) => item.path === selected);
  return <>
    <Heading title="Architecture" subtitle="Dependency relationships resolved from the analyzed source snapshot." action={<span className="live-snapshot-badge"><i />{nodes.length} MODULES · {edges.length} EDGES</span>} />
    <div className="live-architecture-layout"><section className="panel live-graph-panel"><div className="live-graph-legend"><span><i />Module</span><span className="cycle"><i />Circular dependency</span><span className="coupled"><i />High fan-in</span></div>{loading && <div className="live-empty">Loading analysis…</div>}{!loading && graphNodes.length > 0 && <div className="live-graph-canvas"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Analyzed module dependency graph">{edges.slice(0, 250).map((edge) => { const start = positions.get(edge.sourceFile.path); const end = positions.get(edge.targetFile.path); return start && end ? <line key={edge.id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={`${edge.circular ? "cycle" : ""} ${selected === edge.sourceFile.path || selected === edge.targetFile.path ? "active" : ""}`} /> : null; })}</svg>{graphNodes.map((item) => { const position = positions.get(item.path)!; return <button key={item.path} title={`${item.path} · ${item.dependencies.size} dependencies · ${item.dependents.size} dependents`} style={{ left: `${position.x}%`, top: `${position.y}%` }} className={`live-graph-node ${selected === item.path ? "selected" : ""} ${item.cycles ? "cycle" : ""} ${item.dependents.size >= 8 ? "coupled" : ""}`} onClick={() => setSelected(item.path)}><i />{item.path.split("/").pop()}</button>; })}</div>}{nodes.length > graphNodes.length && <p className="graph-node-limit">Showing 40 of {nodes.length} analyzed files, prioritized by cycle and fan-in risk.</p>}{!edges.length && nodes.length > 0 && <p className="live-graph-note">No local import edges were detected; showing analyzed files as standalone modules.</p>}{error && <p className="live-error" role="alert">{error}</p>}{!loading && !nodes.length && !error && <div className="live-empty"><Network size={17} />No analyzed files or local import edges were found.</div>}</section><aside className="panel live-code-inspector"><h3>Module profile</h3>{node ? <><code>{node.path}</code><div className="detail-fact"><span>Dependencies</span><b>{node.dependencies.size}</b></div><div className="detail-fact"><span>Dependents</span><b>{node.dependents.size}</b></div><div className="detail-fact"><span>Cycle edges</span><b>{node.cycles}</b></div><h4>Imported modules</h4>{node.dependencies.size ? [...node.dependencies].slice(0, 12).map((path) => <div className="graph-related-file" key={path}>{path}</div>) : <p>This module has no detected local imports.</p>}<h4>Incoming dependents</h4>{node.dependents.size ? [...node.dependents].slice(0, 12).map((path) => <div className="graph-related-file" key={path}>{path}</div>) : <p>No analyzed files import this module.</p>}<h4>Related findings</h4>{issues.filter((issue) => issue.file?.path === node.path).map((issue) => <button className="graph-related-file" key={issue.id} onClick={() => onOpenCode(node.path)}>{severityLabel(issue.severity)} · {issue.title}:{issue.line}</button>)}{!issues.some((issue) => issue.file?.path === node.path) && <p>No findings are attached to this module.</p>}<button className="button-secondary" onClick={() => onOpenCode(node.path)}><Code2 size={14} />Open in Code Explorer</button></> : <p>Select a module to inspect its relationships.</p>}</aside></div>
  </>;
}

export function LiveChangeImpact({ analysisId }: { analysisId: string }) {
  const [files, setFiles] = useState<AnalyzedFile[]>([]);
  const [filePath, setFilePath] = useState("");
  const [change, setChange] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [result, setResult] = useState<null | { directFiles: Array<{ path: string }>; indirectFiles: Array<{ path: string }>; directDependencies: Array<{ path: string }>; relatedIssues: Array<{ id: string; severity: string; title: string; line: number; file: { path: string } | null }>; risk: string; blastRadius: number; risks: string[]; precautions: string[] }>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setLoadingFiles(true);
    setError("");
    apiRequest<{ files: AnalyzedFile[] }>(`/code/files?analysisId=${encodeURIComponent(analysisId)}`)
      .then(({ files: list }) => { setFiles(list); setFilePath(list[0]?.path ?? ""); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load analyzed files."))
      .finally(() => setLoadingFiles(false));
  }, [analysisId]);
  const simulate = async () => {
    if (!filePath) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await apiRequest<NonNullable<typeof result>>(`/analysis/${analysisId}/impact`, { method: "POST", body: JSON.stringify({ filePath, change }) });
      setResult(response);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not calculate change impact.");
    } finally { setBusy(false); }
  };
  return <>
    <Heading title="Change Impact" subtitle="Trace the analyzed reverse-dependency graph before changing a module." />
    <section className="panel live-impact-panel"><label>Target file<select value={filePath} onChange={(event) => setFilePath(event.target.value)} disabled={loadingFiles || files.length === 0}>{files.map((file) => <option key={file.id} value={file.path}>{file.path}</option>)}</select></label><label>Proposed change<textarea value={change} onChange={(event) => setChange(event.target.value)} placeholder="e.g. Refactor checkout validation." /></label><button className="button-primary" disabled={busy || loadingFiles || !filePath} onClick={() => void simulate()}><Play size={14} fill="currentColor" />{busy ? "Analyzing…" : "SIMULATE CHANGE"}</button></section>
    {!loadingFiles && !error && !files.length && <p className="live-empty">This analysis contains no source files to simulate. Run a new analysis of a supported JavaScript or TypeScript repository.</p>}
    {loadingFiles && <p className="live-empty">Loading analysis…</p>}
    {error && <p className="live-error"><AlertTriangle size={14} />{error}</p>}
    {result && <section className="panel live-impact-result"><div className="impact-result-head"><div><span className="eyebrow">ANALYZED BLAST RADIUS</span><h2>{result.blastRadius} affected files</h2></div><span className={`severity-label severity-text-${result.risk.toLowerCase()}`}>{result.risk} risk</span></div><div className="live-impact-columns"><div><h3>Direct dependents · {result.directFiles.length}</h3>{result.directFiles.map((file) => <div className="graph-related-file" key={file.path}>{file.path}</div>)}</div><div><h3>Transitive dependents · {result.indirectFiles.length}</h3>{result.indirectFiles.map((file) => <div className="graph-related-file" key={file.path}>{file.path}</div>)}</div><div><h3>Direct dependencies · {result.directDependencies.length}</h3>{result.directDependencies.map((file) => <div className="graph-related-file" key={file.path}>{file.path}</div>)}</div></div><h3>Related findings · {result.relatedIssues.length}</h3>{result.relatedIssues.length ? result.relatedIssues.map((issue) => <div className="graph-related-file" key={issue.id}>{severityLabel(issue.severity)} · {issue.title} · {issue.file?.path ?? "Repository"}:{issue.line}</div>) : <p>No open findings were measured in the changed file or affected modules.</p>}<h3>Risk indicators</h3>{result.risks.length ? result.risks.map((risk) => <p key={risk}>{risk}</p>) : <p>No high-severity findings or high blast-radius threshold were measured in affected files.</p>}<h3>Recommended precautions</h3>{result.precautions.map((item) => <p key={item}>{item}</p>)}</section>}
  </>;
}

export function LiveInsights({ analysisId, initialQuestion }: { analysisId: string; initialQuestion: string }) {
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [issues, setIssues] = useState<AnalysisIssue[]>([]);
  const [question, setQuestion] = useState(initialQuestion);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [aiNotConfigured, setAiNotConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([apiRequest<AnalysisSummary>(`/analysis/${analysisId}/summary`), apiRequest<{ issues: AnalysisIssue[] }>(`/issues?analysisId=${encodeURIComponent(analysisId)}&status=OPEN`)])
      .then(([metrics, findings]) => { setSummary(metrics); setIssues(findings.issues); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load analysis evidence."))
      .finally(() => setLoading(false));
  }, [analysisId]);
  useEffect(() => { setQuestion(initialQuestion); }, [initialQuestion]);
  const ask = async () => {
    if (!question.trim()) return;
    setBusy(true); setError(""); setAnswer(""); setAiNotConfigured(false);
    try {
      const result = await apiRequest<{ answer: string }>("/ai/chat", { method: "POST", body: JSON.stringify({ analysisId, question }) });
      setAnswer(result.answer);
    } catch (reason) {
      setAiNotConfigured(reason instanceof Error && "code" in reason && reason.code === "AI_NOT_CONFIGURED");
      setError(reason instanceof Error ? reason.message : "Could not generate an AI explanation.");
    } finally { setBusy(false); }
  };
  return <>
    <Heading title="AI Insights" subtitle="Evidence-grounded explanations and remediation priorities for this commit." action={<span className="live-snapshot-badge"><Sparkles size={12} />GROUNDED IN ANALYSIS</span>} />
    {loading && <div className="live-empty">Loading analysis…</div>}
    {error && <p className="live-error" role="alert"><AlertTriangle size={14} />{error}</p>}
    {summary && <div className="live-insight-summary"><section className="panel"><span className="eyebrow">CODEBASE SUMMARY · MEASURED INPUT</span><p>{summary.counts.files} source files and {summary.counts.issues} findings were analyzed at commit {summary.analysis.commitSha.slice(0, 7)}. The deterministic quality score is {summary.metrics.codeQuality}/100 and estimated remediation effort is {summary.metrics.technicalDebtHours} hours.</p></section><section className="panel"><h3>Top problems</h3>{issues.slice(0, 5).map((issue) => <div className="graph-related-file" key={issue.id}><ShieldAlert size={13} />{issue.title} · {issue.file?.path}:{issue.line}</div>)}{issues.length === 0 && <p>No open findings were returned by this analysis.</p>}</section><section className="panel live-recommendations"><h3>Recommended refactoring · analyzer suggestions</h3>{issues.slice(0, 5).map((issue) => <article key={issue.id}><b>{issue.recommendation}</b><p>{issue.title} · {issue.impact ?? issue.description}</p><small>{issue.file?.path}:{issue.line} · estimated effort {issue.estimatedEffort ?? 0}h</small></article>)}{issues.length === 0 && <p>No remediation recommendations are available because there are no open findings.</p>}</section></div>}
    <section className="panel live-ask-panel"><h2><Sparkles size={16} />Ask Logicloom</h2><div className="live-question-chips">{["Summarize the most important technical debt.", "Which file has the highest-impact findings?", "Recommend a remediation order using only these findings."].map((suggestion) => <button key={suggestion} onClick={() => setQuestion(suggestion)}>{suggestion}</button>)}</div><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about the analyzed repository…" /><button className="button-primary" disabled={busy || !question.trim() || loading} onClick={() => void ask()}><Sparkles size={14} />{busy ? "Asking…" : "Generate insight"}</button>{aiNotConfigured && <p className="live-ai-setup">AI insights are unavailable. Configure AI_API_KEY on the server. Set AI_BASE_URL as well for the provider endpoint, then restart the API.</p>}{answer && <div className="live-ai-answer"><b>Analysis-grounded response</b><p>{answer}</p></div>}{error && !aiNotConfigured && <p className="live-error" role="alert"><AlertTriangle size={14} />{error}</p>}</section>
  </>;
}

export function toDashboardIssue(issue: AnalysisIssue): Issue {
  const severity = severityLabel(issue.severity) as Issue["severity"];
  const category = (issue.category === "MAINTAINABILITY" ? "Maintainability" : categoryLabel(issue.category)) as Issue["category"];
  const riskScores: Record<string, number> = { CRITICAL: 100, HIGH: 85, MEDIUM: 60, LOW: 35 };
  return {
    id: issue.id, title: issue.title, file: issue.file?.path ?? "Repository", line: issue.line,
    category, severity, score: riskScores[issue.severity] ?? 0, detail: issue.description,
    description: issue.description, impact: issue.impact, recommendation: issue.recommendation,
    estimatedEffort: issue.estimatedEffort, status: issue.status,
  };
}
