import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Check, ExternalLink, GitBranch, LoaderCircle, Play, Sparkles, X } from "lucide-react";
import Editor from "@monaco-editor/react";
import { apiRequest, type AnalysisIssue, type AnalysisStatus, type AnalysisSummary, type AnalyzedDependency, type AnalyzedFile, type ConnectedRepository, type FileSource } from "../services/api";
import "../repository-analysis.css";

type Props = { onClose: () => void };
type ResultTab = "Findings" | "Explorer" | "Dependencies" | "Impact" | "AI insight";
type RepositoryBranch = { name: string; isDefault: boolean };
export type CompletedAnalysisSnapshot = {
  analysisId: string;
  repository: string;
  branch: string;
  commitSha: string;
  completedAt: string | null;
  metrics: Record<string, number>;
  counts: { files: number; issues: number; dependencies: number };
  issues: AnalysisIssue[];
};

export default function RepositoryAnalysis({ onClose, onAnalysisComplete, onRepositorySelected }: Props & {
  onAnalysisComplete: (snapshot: CompletedAnalysisSnapshot) => void;
  onRepositorySelected: (repository: ConnectedRepository, branch: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [repository, setRepository] = useState<ConnectedRepository | null>(null);
  const [repositories, setRepositories] = useState<ConnectedRepository[]>([]);
  const [branches, setBranches] = useState<RepositoryBranch[]>([]);
  const [branch, setBranch] = useState("");
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesError, setBranchesError] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisStatus | null>(null);
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [findings, setFindings] = useState<AnalysisIssue[]>([]);
  const [files, setFiles] = useState<AnalyzedFile[]>([]);
  const [dependencies, setDependencies] = useState<AnalyzedDependency[]>([]);
  const [source, setSource] = useState<FileSource | null>(null);
  const [resultTab, setResultTab] = useState<ResultTab>("Findings");
  const [impactedFiles, setImpactedFiles] = useState<string[]>([]);
  const [impactCounts, setImpactCounts] = useState<{ directlyAffected: number; transitiveAffected: number } | null>(null);
  const [question, setQuestion] = useState("What should we fix first?");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [analysisStarting, setAnalysisStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest<{ repositories: ConnectedRepository[] }>("/repositories")
      .then(({ repositories: saved }) => setRepositories(saved))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load repositories."));
  }, []);

  const loadBranches = async (selectedRepository: ConnectedRepository) => {
    const [owner, repoName] = selectedRepository.fullName.split("/");
    if (!owner || !repoName) throw new Error("The connected repository name is invalid.");
    setBranchesLoading(true);
    setBranchesError("");
    setBranches([]);
    setBranch("");
    try {
      const result = await apiRequest<{ defaultBranch: string | null; branches: RepositoryBranch[] }>(
        `/repositories/branches?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repoName)}`,
      );
      setBranches(result.branches);
      const defaultBranch = result.defaultBranch && result.branches.some((item) => item.name === result.defaultBranch)
        ? result.defaultBranch
        : "";
      setBranch(defaultBranch);
      onRepositorySelected(selectedRepository, defaultBranch);
    } catch (reason) {
      setBranchesError(reason instanceof Error ? reason.message : "Could not load repository branches.");
      throw reason;
    } finally {
      setBranchesLoading(false);
    }
  };

  const selectRepository = async (selected: ConnectedRepository) => {
    setRepository(selected);
    setAnalysis(null);
    setSummary(null);
    setFindings([]);
    setError("");
    try {
      await loadBranches(selected);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load repository branches.");
    }
  };

  const analysisId = analysis?.id;
  const analysisInProgress = Boolean(analysis && ["PROCESSING", "QUEUED"].includes(analysis.status));
  useEffect(() => {
    if (!analysisId || !analysisInProgress) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const { analysis: current } = await apiRequest<{ analysis: AnalysisStatus }>(`/analysis/${analysisId}`);
        if (cancelled) return;
        setError("");
        if (current.status === "COMPLETED") {
          const [result, issues, analyzedFiles, graph] = await Promise.all([
            apiRequest<AnalysisSummary>(`/analysis/${current.id}/summary`),
            apiRequest<{ issues: AnalysisIssue[] }>(`/analysis/${current.id}/issues`),
            apiRequest<{ files: AnalyzedFile[] }>(`/analysis/${current.id}/files`),
            apiRequest<{ dependencies: AnalyzedDependency[] }>(`/analysis/${current.id}/dependencies`),
          ]);
          if (cancelled) return;
          setAnalysis(current);
          setSummary(result);
          setFindings(issues.issues);
          setFiles(analyzedFiles.files);
          setDependencies(graph.dependencies);
          onAnalysisComplete({
            analysisId: current.id,
            repository: current.repository.fullName,
            branch: current.branch.name,
            commitSha: current.commitSha,
            completedAt: current.completedAt ?? null,
            metrics: result.metrics,
            counts: result.counts,
            issues: issues.issues,
          });
        } else if (current.status === "FAILED") {
          setAnalysis(current);
          setError(current.error ?? "The repository analysis failed. Check the API logs and try again.");
        } else {
          setAnalysis(current);
          timer = window.setTimeout(() => void poll(), 1100);
        }
      } catch (reason) {
        if (cancelled) return;
        setError(reason instanceof Error ? `Could not check analysis progress: ${reason.message}` : "Could not check analysis progress.");
        timer = window.setTimeout(() => void poll(), 2200);
      }
    };
    timer = window.setTimeout(() => void poll(), 500);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [analysisId, analysisInProgress]);

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ repository: ConnectedRepository }>("/repositories/connect", {
        method: "POST", body: JSON.stringify({ url }),
      });
      setRepository(result.repository);
      setRepositories((items) => [result.repository, ...items.filter((item) => item.id !== result.repository.id)]);
      setAnalysis(null);
      setSummary(null);
      setFindings([]);
      setFiles([]);
      setDependencies([]);
      setSource(null);
      setResultTab("Findings");
      await loadBranches(result.repository);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not connect repository.");
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!repository || !branch) {
      setError("Connect a repository and select a branch before starting analysis.");
      return;
    }
    setBusy(true);
    setAnalysisStarting(true);
    setError("");
    setSummary(null);
    setFindings([]);
    setFiles([]);
    setDependencies([]);
    setSource(null);
    setImpactCounts(null);
    setAnswer("");
    setAnalysis({
      id: "",
      status: "PROCESSING",
      stage: `Starting analysis for ${repository.fullName}@${branch}`,
      progress: 0,
      error: null,
      commitSha: "",
      repository: { fullName: repository.fullName, htmlUrl: repository.htmlUrl },
      branch: { name: branch },
    });
    try {
      const result = await apiRequest<{ analysisId: string; status: AnalysisStatus["status"] }>("/analysis/run", {
        method: "POST", body: JSON.stringify({ repositoryId: repository.id, branch }),
      });
      setAnalysis({
        id: result.analysisId, status: result.status, stage: "queued", progress: 5, error: null, commitSha: "",
        repository: { fullName: repository.fullName, htmlUrl: repository.htmlUrl }, branch: { name: branch },
      });
    } catch (reason) {
      setAnalysis(null);
      setError(reason instanceof Error ? reason.message : "Could not start analysis.");
    } finally {
      setBusy(false);
      setAnalysisStarting(false);
    }
  };

  const askAI = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!analysis || !question.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ answer: string }>("/ai/insights", {
        method: "POST", body: JSON.stringify({ analysisId: analysis.id, question }),
      });
      setAnswer(result.answer);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not request an insight.");
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (file: AnalyzedFile) => {
    if (!analysis) return;
    setResultTab("Explorer");
    setError("");
    try {
      const result = await apiRequest<{ file: FileSource }>(`/analysis/${analysis.id}/files/${file.id}`);
      setSource(result.file);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not read analyzed source.");
    }
  };

  const analyzeImpact = async () => {
    if (!analysis || !source) return;
    setError("");
    try {
      const result = await apiRequest<{ directlyAffected: number; transitiveAffected: number; files: Array<{ path: string }> }>(`/analysis/${analysis.id}/impact`, {
        method: "POST", body: JSON.stringify({ filePath: source.path }),
      });
      setImpactCounts({ directlyAffected: result.directlyAffected, transitiveAffected: result.transitiveAffected });
      setImpactedFiles(result.files.map((file) => file.path));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not calculate change impact.");
    }
  };

  const completed = analysis?.status === "COMPLETED" && summary;
  return <div className="analysis-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="analysis-dialog" role="dialog" aria-modal="true" aria-labelledby="analysis-title">
      <header className="analysis-dialog-head">
        <div className="analysis-brand-icon"><GitBranch size={17} /></div>
        <div><span className="analysis-kicker">LIVE REPOSITORY ANALYSIS</span><h2 id="analysis-title">Connect a codebase</h2></div>
        <button className="icon-button" aria-label="Close" onClick={onClose}><X size={17} /></button>
      </header>
      <div className="analysis-dialog-content">
        <p className="analysis-intro">Analyze a public GitHub repository using deterministic source heuristics. Findings are tied to the analyzed commit; they are not a substitute for a full compiler, test suite, or security audit.</p>
        {repositories.length > 0 && <div className="saved-repositories"><label htmlFor="saved-repository">Recently connected</label><select id="saved-repository" value={repository?.id ?? ""} onChange={(event) => {
          const selected = repositories.find((item) => item.id === event.target.value);
          if (selected) void selectRepository(selected);
        }}><option value="">Select a repository</option>{repositories.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select></div>}
        <form className="connect-form" onSubmit={connect}>
          <label htmlFor="github-url">GitHub repository URL</label>
          <div className="connect-input-row"><input id="github-url" type="url" required placeholder="https://github.com/owner/repository" value={url} onChange={(event) => setUrl(event.target.value)} /><button className="button-secondary" disabled={busy}>Connect</button></div>
        </form>
        {repository && <div className="repo-analysis-selection">
          <div className="connected-repo"><span className="connected-repo-dot" /><span><b>{repository.fullName}</b><small>Source is fetched from GitHub when you start analysis.</small></span><a href={repository.htmlUrl} target="_blank" rel="noreferrer" aria-label="Open repository on GitHub"><ExternalLink size={14} /></a></div>
          <div className="analysis-run-row"><label htmlFor="analysis-branch">Branch</label><select id="analysis-branch" value={branch} disabled={branchesLoading || branchesError !== "" || branches.length === 0 || analysisInProgress} onChange={(event) => { setBranch(event.target.value); setAnalysis(null); setSummary(null); setFindings([]); }}><option value="">{branchesLoading ? "Loading branches…" : branchesError ? "Could not load branches" : branches.length ? "Select a branch" : "No branches available"}</option>{branches.map((item) => <option key={item.name} value={item.name}>{item.name}{item.isDefault ? " (default)" : ""}</option>)}</select><button type="button" className="button-primary" disabled={busy || branchesLoading || branchesError !== "" || !branch || analysisInProgress} onClick={() => void run()}>{analysisStarting || analysisInProgress ? <LoaderCircle size={13} className="stage-spin" /> : <Play size={13} fill="currentColor" />}{analysisStarting || analysisInProgress ? "Analyzing..." : "Analyze"}</button></div>
        </div>}
        {analysis && <section className={`analysis-result ${analysis.status.toLowerCase()}`}>
          <div className="analysis-progress-head"><div><span className="analysis-status-dot" /><b>{analysis.status === "COMPLETED" ? "Analysis complete" : analysis.status === "FAILED" ? "Analysis failed" : "Analyzing repository"}</b><small>{analysis.stage}</small></div><strong>{analysis.progress}%</strong></div>
          <div className="analysis-progress-track"><i style={{ width: `${analysis.progress}%` }} /></div>
          <div className="analysis-stage-list">{[
            ["Connecting to repository", 15], ["Scanning supported files", 30], ["Analyzing complexity and maintainability", 38],
            ["Analyzing dependencies and cycles", 56], ["Detecting duplication", 72], ["Calculating debt and health", 86],
          ].map(([label, threshold], index, stages) => {
            const complete = analysis.progress >= Number(threshold) || analysis.status === "COMPLETED";
            const prior = index ? Number(stages[index - 1][1]) : 0;
            const current = !complete && analysis.progress >= prior && analysis.status === "PROCESSING";
            return <div className={`analysis-stage ${complete ? "complete" : current ? "current" : ""}`} key={String(label)}><span>{complete ? <Check size={11} /> : current ? <LoaderCircle size={10} className="stage-spin" /> : <i />}</span>{label}</div>;
          })}
          </div>
          <button className="analysis-stage-ai" disabled={analysis.status !== "COMPLETED"} onClick={() => setResultTab("AI insight")}><Sparkles size={11} />Generate AI insights <small>{analysis.status !== "COMPLETED" ? "available after analysis" : "optional · ask Logicloom below"}</small></button>
          {analysis.status === "FAILED" && <p className="analysis-error-detail">{analysis.error}</p>}
          {completed && <>
            <div className="live-metrics-grid">{[
              ["Code quality", completed.metrics.codeQuality], ["Codebase health", completed.metrics.codebaseHealth],
              ["Debt estimate", `${completed.metrics.technicalDebtHours}h`], ["Analyzed files", completed.counts.files],
            ].map(([name, value]) => <div key={name} className="live-metric"><span>{name}</span><b>{value}</b></div>)}</div>
            <div className="analysis-counts">{completed.counts.issues} findings <i>·</i> {completed.counts.dependencies} local dependencies <i>·</i> commit {analysis.commitSha.slice(0, 7)}</div>
            <nav className="analysis-result-tabs" aria-label="Live analysis results">{(["Findings", "Explorer", "Dependencies", "Impact", "AI insight"] as ResultTab[]).map((tab) => <button key={tab} className={resultTab === tab ? "active" : ""} onClick={() => setResultTab(tab)}>{tab}</button>)}</nav>
            {resultTab === "Findings" && <div className="live-findings"><h3>Evidence-backed findings</h3>{findings.slice(0, 30).map((finding) => <article key={finding.id}><span className={`finding-severity ${finding.severity.toLowerCase()}`}>{finding.severity}</span><span><b>{finding.title}</b><small>{finding.file?.path ?? "Repository"}:{finding.line} · {finding.category}</small><p>{finding.description}</p>{finding.file && <button className="finding-open-file" onClick={() => { const file = files.find((item) => item.path === finding.file?.path); if (file) void openFile(file); }}>Open source evidence</button>}</span></article>)}{findings.length === 0 && <p className="no-findings"><Check size={14} />No heuristic findings were detected in the analyzed files.</p>}</div>}
            {resultTab === "Explorer" && <div className="analysis-explorer"><div className="analysis-file-list"><b>{files.length} analyzed files</b>{files.map((file) => <button key={file.id} className={source?.id === file.id ? "selected" : ""} onClick={() => void openFile(file)}><span>{file.path}</span><small>{file.lineCount} lines · {file.complexity} complexity</small></button>)}</div><div className="analysis-source-view">{source ? <><div className="source-file-head"><b>{source.path}</b><span>{source.issues.length} finding{source.issues.length === 1 ? "" : "s"}</span></div><Editor height="320px" language={source.language.toLowerCase()} theme="vs-dark" value={source.content} options={{ readOnly: true, minimap: { enabled: false }, fontSize: 11, lineNumbers: "on", scrollBeyondLastLine: false, wordWrap: "on" }} /></> : <div className="source-empty">Choose an analyzed file to inspect source and metrics.</div>}</div></div>}
            {resultTab === "Dependencies" && <div className="live-findings"><h3>{dependencies.length} resolved local import edges</h3>{dependencies.slice(0, 80).map((edge) => <article key={edge.id}><span className={`finding-severity ${edge.circular ? "high" : "low"}`}>{edge.circular ? "CYCLE" : "IMPORT"}</span><span><b>{edge.sourceFile.path}</b><small>imports</small><p>{edge.targetFile.path}</p></span></article>)}{dependencies.length === 0 && <p className="no-findings">No resolvable relative imports were found in this snapshot.</p>}</div>}
            {resultTab === "Impact" && <div className="live-findings"><h3>Change impact · analyzed dependency graph</h3><p className="impact-help">Select a file in Explorer first, then calculate its reverse dependency reach.</p>{source ? <><div className="impact-target">{source.path}<button className="button-secondary" onClick={() => void analyzeImpact()}>Calculate impact</button></div>{impactCounts && <><div className="analysis-counts">{impactCounts.directlyAffected} direct dependents <i>·</i> {impactCounts.transitiveAffected} total affected files</div>{impactedFiles.slice(0, 30).map((path) => <div className="impact-file" key={path}>{path}</div>)}</>}</> : <p className="source-empty">Open a source file in Explorer to select an impact target.</p>}</div>}
            {resultTab === "AI insight" && <div className="live-findings"><h3>Ask about this commit</h3><p className="impact-help">The configured AI provider receives this question and a bounded set of findings/metrics from the analyzed commit.</p><form className="analysis-ai-form" onSubmit={(event) => void askAI(event)}><Sparkles size={15} /><input value={question} onChange={(event) => setQuestion(event.target.value)} aria-label="Ask about analysis" /><button type="submit" disabled={busy}>Ask</button></form>{answer && <div className="analysis-ai-answer"><b>Grounded AI insight · {analysis.commitSha.slice(0, 7)}</b><p>{answer}</p></div>}</div>}
          </>}
        </section>}
        {error && <div className="analysis-error" role="alert"><AlertTriangle size={15} /><span>{error}</span></div>}
        {!repository && <div className="analysis-setup-note"><AlertTriangle size={14} /><span>Repository persistence requires <code>DATABASE_URL</code>. Private repositories also require a server-side <code>GITHUB_TOKEN</code>. See <code>.env.example</code>.</span></div>}
      </div>
      <footer className="analysis-dialog-foot"><span><LoaderCircle size={13} />No repository content is sent to the browser until requested.</span><button className="text-action" onClick={onClose}>Close <ArrowRight size={13} /></button></footer>
    </section>
  </div>;
}
