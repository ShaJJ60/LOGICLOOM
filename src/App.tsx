import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import {
	Activity,
	ArrowDownRight,
	ArrowRight,
	ArrowUpRight,
	Bell,
	Braces,
	Bug,
	Check,
	ChevronDown,
	ChevronRight,
	CircleHelp,
	Clock3,
	Command,
	Code2,
	FileCode2,
	GitBranch,
	GitCommitHorizontal,
	GitFork,
	GitPullRequest,
	GitCompareArrows,
	History,
	LayoutDashboard,
	ListFilter,
	LockKeyhole,
	Menu,
	MoreHorizontal,
	Network,
	PanelLeftClose,
	Play,
	Plus,
	Radar,
	Search,
	Settings2,
	ShieldAlert,
	Sparkles,
	Split,
	WandSparkles,
	X,
	Zap,
} from "lucide-react";
import {
	codeSamples,
	dnaDimensions,
	files,
	issues,
	nodes,
	refactorDiff,
	rootCauses,
	timeline,
	type Issue,
} from "./data";
import {
	repositoryMetrics,
	simulateSampleChange,
} from "./services/mockAnalysis";
import LoginScreen from "./components/LoginScreen";
import RepositoryAnalysis, {
	type CompletedAnalysisSnapshot,
} from "./components/RepositoryAnalysis";
import QuickAnalysis from "./components/QuickAnalysis";
import {
	LiveArchitecture,
	LiveChangeImpact,
	LiveCodeExplorer,
	LiveInsights,
	LiveIssuesPage,
	toDashboardIssue,
} from "./components/LiveAnalysisPages";
import {
	apiRequest,
	type AnalysisIssue,
	type AnalysisSummary,
	type ConnectedRepository,
} from "./services/api";
import {
	getAuthSession,
	persistAuthSession,
	signOut as clearAuthSession,
	type AuthUser,
} from "./services/auth";

type Page =
	| "Overview"
	| "Quick Analysis"
	| "Issues"
	| "Code explorer"
	| "Architecture"
	| "Dependencies"
	| "Change impact"
	| "AI insights"
	| "Root causes"
	| "Time machine"
	| "Codebase DNA"
	| "Pre-commit";
type PersistedRepository = ConnectedRepository & {
	analyses: Array<{
		id: string;
		status: string;
		completedAt: string | null;
		branch: { name: string };
	}>;
};
type ArrayResponseRepository = { repositories: PersistedRepository[] };
const pageIcons = {
	Overview: LayoutDashboard,
	"Quick Analysis": WandSparkles,
	Issues: Bug,
	"Code explorer": FileCode2,
	Architecture: Network,
	Dependencies: Network,
	"Change impact": GitFork,
	"AI insights": Sparkles,
	"Root causes": ShieldAlert,
	"Time machine": History,
	"Codebase DNA": Radar,
	"Pre-commit": GitCompareArrows,
};

function App() {
	const [user, setUser] = useState<AuthUser | null>(() => getAuthSession());
	const [authLeaving, setAuthLeaving] = useState(false);
	const [authTransition, setAuthTransition] = useState<
		"idle" | "loading" | "closing"
	>("idle");
	const [accountMenuOpen, setAccountMenuOpen] = useState(false);
	const [page, setPage] = useState<Page>("Overview");
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [repo, setRepo] = useState("Connect repository");
	const [toast, setToast] = useState("");
	const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
	const [activeFilePath, setActiveFilePath] = useState("");
	const [commandOpen, setCommandOpen] = useState(false);
	const [commandQuery, setCommandQuery] = useState("");
	const [analysisOpen, setAnalysisOpen] = useState(false);
	const [connectedRepository, setConnectedRepository] =
		useState<ConnectedRepository | null>(null);
	const [selectedBranch, setSelectedBranch] = useState("Choose branch");
	const [liveSnapshot, setLiveSnapshot] =
		useState<CompletedAnalysisSnapshot | null>(null);
	const [analysisRestoring, setAnalysisRestoring] = useState(true);
	const [healthHistory, setHealthHistory] = useState<number[]>([]);
	const [detailIssueId, setDetailIssueId] = useState<string | undefined>();
	const [debtIssuesOnly, setDebtIssuesOnly] = useState(false);
	const [aiQuestion, setAiQuestion] = useState("Why is technical debt high?");
	useEffect(() => {
		if (!user || authLeaving) return;
		const remember = Boolean(
			window.localStorage.getItem("logicloom-session") ||
			!window.sessionStorage.getItem("logicloom-session-tab"),
		);
		persistAuthSession(user, remember);
	}, [authLeaving, user]);
	const dashboardIssues = useMemo(() => {
		if (liveSnapshot) return liveSnapshot.issues.map(toDashboardIssue);
		return issues;
	}, [liveSnapshot]);

	useEffect(() => {
		if (!connectedRepository) return;
		apiRequest<{ analyses: Array<{ metrics: Record<string, number> }> }>(
			`/repositories/${connectedRepository.id}/history`,
		)
			.then(({ analyses }) =>
				setHealthHistory(
					analyses
						.map((item) => item.metrics.codebaseHealth)
						.filter((value): value is number => typeof value === "number"),
				),
			)
			.catch((reason: unknown) =>
				notify(
					reason instanceof Error
						? `Could not load analysis history: ${reason.message}`
						: "Could not load analysis history.",
				),
			);
	}, [connectedRepository?.id]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				setCommandOpen((open) => !open);
			}
			if (event.key === "Escape") {
				setCommandOpen(false);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const notify = (message: string) => {
		setToast(message);
		window.setTimeout(() => setToast(""), 2600);
	};

	useEffect(() => {
		if (!user) {
			setAnalysisRestoring(false);
			return;
		}
		let cancelled = false;
		const restoreLatestAnalysis = async () => {
			try {
				const { repositories } = await apiRequest<ArrayResponseRepository>(
					"/repositories",
				).then((response) => response as ArrayResponseRepository);
				if (cancelled || repositories.length === 0) return;
				const selected =
					repositories
						.filter((item) => item.analyses.length > 0)
						.sort(
							(left, right) =>
								Date.parse(right.analyses[0].completedAt ?? "") -
								Date.parse(left.analyses[0].completedAt ?? ""),
						)[0] ?? repositories[0];
				setConnectedRepository(selected);
				setRepo(selected.fullName);
				const latest = selected.analyses[0];
				if (!latest) {
					setSelectedBranch(selected.defaultBranch);
					return;
				}
				setSelectedBranch(latest.branch.name);
				const [summary, findings, history] = await Promise.all([
					apiRequest<AnalysisSummary>(`/analysis/${latest.id}/summary`),
					apiRequest<{ issues: AnalysisIssue[] }>(
						`/analysis/${latest.id}/issues`,
					),
					apiRequest<{ analyses: Array<{ metrics: Record<string, number> }> }>(
						`/repositories/${selected.id}/history`,
					),
				]);
				if (cancelled) return;
				setLiveSnapshot({
					analysisId: latest.id,
					repository: selected.fullName,
					branch: latest.branch.name,
					commitSha: summary.analysis.commitSha,
					completedAt: latest.completedAt,
					metrics: summary.metrics,
					counts: summary.counts,
					issues: findings.issues,
				});
				setHealthHistory(
					history.analyses
						.map((item) => item.metrics.codebaseHealth)
						.filter((value): value is number => typeof value === "number"),
				);
			} catch (reason) {
				if (!cancelled)
					notify(
						reason instanceof Error
							? `Could not restore the latest analysis: ${reason.message}`
							: "Could not restore the latest analysis.",
					);
			} finally {
				if (!cancelled) setAnalysisRestoring(false);
			}
		};
		void restoreLatestAnalysis();
		return () => {
			cancelled = true;
		};
	}, [user]);

	const openIssue = (issue: Issue) => {
		setActiveIssue(issue);
		if (
			liveSnapshot &&
			liveSnapshot.issues.some((item) => item.id === issue.id)
		) {
			setDetailIssueId(issue.id);
			setPage("Issues");
		} else setPage("Code explorer");
	};
	const runCommand = (label: string, target: Page) => {
		const asksWhy = /why|explain|risky|architecture risk/i.test(label);
		setCommandOpen(false);
		setCommandQuery("");
		if (asksWhy) {
			setAiQuestion(label);
			if (liveSnapshot) setPage("AI insights");
			else setAnalysisOpen(true);
		} else {
			setPage(target === "Dependencies" ? "Architecture" : target);
		}
	};
	const createDemoBranch = () => {
		notify(
			"Creating branches is not available in this local analysis prototype.",
		);
	};
	const signIn = (nextUser: AuthUser) => {
		setUser(nextUser);
		setAuthTransition("loading");
		setPage("Overview");
		notify("Demo workspace ready");
		window.setTimeout(() => setAuthTransition("closing"), 2200);
		window.setTimeout(() => setAuthTransition("idle"), 2880);
	};
	const signOut = () => {
		setAuthLeaving(true);
		setAccountMenuOpen(false);
		window.setTimeout(() => {
			clearAuthSession();
			setUser(null);
			setAuthLeaving(false);
		}, 420);
	};

	if (!user) return <LoginScreen onSignIn={signIn} />;

	return (
		<div
			className={`app-shell dashboard-enter ${authLeaving ? "dashboard-leaving" : ""}`}
		>
			{authTransition !== "idle" && (
				<WorkspaceTransition
					user={user}
					closing={authTransition === "closing"}
				/>
			)}
			{sidebarOpen && (
				<button
					className="mobile-scrim"
					aria-label="Close navigation"
					onClick={() => setSidebarOpen(false)}
				/>
			)}
			<aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
				<div className="brand-row">
					<div className="brand-mark">
						<Braces size={18} strokeWidth={2.5} />
					</div>
					<span className="brand-name">
						logicloom<span className="brand-period">.</span>
					</span>
					<button
						className="icon-button sidebar-collapse"
						aria-label="Close sidebar"
						onClick={() => setSidebarOpen(false)}
					>
						<PanelLeftClose size={16} />
					</button>
				</div>
				<button
					className="workspace-select"
					onClick={() => setAnalysisOpen(true)}
				>
					<span className="workspace-avatar">A</span>
					<span className="workspace-text">
						<b>{connectedRepository?.fullName ?? "Connect a repository"}</b>
						<small>
							{liveSnapshot
								? `${liveSnapshot.branch} · ${liveSnapshot.commitSha.slice(0, 7)}`
								: "Local analysis workspace"}
						</small>
					</span>
					<ChevronDown size={14} />
				</button>
				<div className="side-label">WORKSPACE</div>
				<nav className="main-nav" aria-label="Main navigation">
					{(
						[
							"Overview",
							"Quick Analysis",
							"Issues",
							"Code explorer",
							"Architecture",
							"Change impact",
							"AI insights",
						] as Page[]
					).map((item) => {
						const Icon = pageIcons[item];
						return (
							<button
								key={item}
								onClick={() => {
									setPage(item);
									setSidebarOpen(false);
								}}
								className={`nav-item ${page === item ? "nav-active" : ""}`}
							>
								<Icon size={17} strokeWidth={1.8} />
								<span>{item}</span>
								{item === "Issues" && liveSnapshot && (
									<span className="nav-count">
										{liveSnapshot.counts.issues}
									</span>
								)}
							</button>
						);
					})}
				</nav>
				<div className="side-label side-label-spaced">REPOSITORY</div>
				<button
					className="project-link project-active"
					onClick={() => setAnalysisOpen(true)}
				>
					<span className="project-dot lime-dot" />
					{liveSnapshot?.repository.split("/").pop() ?? "Connect a repository"}
				</button>
				<div className="sidebar-bottom">
					<div className="plan-card">
						<div className="plan-head">
							<span className="plan-icon">
								<Zap size={14} />
							</span>
							<span>Local workspace</span>
							<span className="plan-status">READY</span>
						</div>
						<p>Connect a repository to start a measured analysis.</p>
						<div className="plan-foot">
							<span>
								{connectedRepository
									? "1 repository connected"
									: "No repository connected"}
							</span>
							<button onClick={() => setAnalysisOpen(true)}>
								Connect <ArrowRight size={12} />
							</button>
						</div>
					</div>
					<div className="account-menu-wrap">
						<button
							className="profile-button"
							aria-expanded={accountMenuOpen}
							onClick={() => setAccountMenuOpen(!accountMenuOpen)}
						>
							<span className="profile-avatar">
								{user.fullName
									.split(" ")
									.map((part) => part[0])
									.join("")
									.slice(0, 2)
									.toUpperCase()}
							</span>
							<span>
								<b>{user.fullName}</b>
								<small>{user.email}</small>
							</span>
							<MoreHorizontal size={17} />
						</button>
						{accountMenuOpen && (
							<div className="account-menu">
								<div className="account-menu-user">
									<b>{user.fullName}</b>
									<span>{user.email}</span>
									<small>
										{connectedRepository?.fullName ?? "No repository connected"}
									</small>
								</div>
								<button
									onClick={() => {
										setAccountMenuOpen(false);
										setAnalysisOpen(true);
									}}
								>
									Repository & branch settings
								</button>
								<button className="account-logout" onClick={signOut}>
									<span>Sign out</span>
									<span>End this session</span>
								</button>
							</div>
						)}
					</div>
				</div>
			</aside>
			<main className="main-area">
				<header className="topbar">
					<button
						className="mobile-menu icon-button"
						onClick={() => setSidebarOpen(true)}
						aria-label="Open navigation"
					>
						<Menu size={19} />
					</button>
					<div className="repo-picker-wrap">
						<button
							className="repo-picker"
							onClick={() => setAnalysisOpen(true)}
						>
							<span className="github-mark">⌘</span>
							<span>
								{liveSnapshot?.repository ??
									connectedRepository?.fullName ??
									repo}
							</span>
							<ChevronDown size={14} />
						</button>
					</div>
					<div className="top-divider" />
					<button className="branch-pill" onClick={() => setAnalysisOpen(true)}>
						<GitBranch size={14} />
						{liveSnapshot?.branch ?? selectedBranch}
						<ChevronDown size={13} />
					</button>
					<div className="topbar-spacer" />
					<button
						className="button-secondary live-analysis-button"
						onClick={() => setAnalysisOpen(true)}
					>
						<Play size={13} fill="currentColor" />
						Run analysis
					</button>
					<button
						className="global-search"
						onClick={() => setCommandOpen(true)}
					>
						<Search size={15} />
						<span>Ask Logicloom or search…</span>
						<kbd>
							<Command size={11} /> K
						</kbd>
					</button>
					<button
						className="icon-button notification-button"
						aria-label="Notifications"
						onClick={() => notify("You're all caught up")}
					>
						<Bell size={17} />
						<i />
					</button>
					<button
						className="help-button"
						onClick={() =>
							notify("Tip: search issues, files, and code from here")
						}
					>
						<CircleHelp size={16} />
					</button>
				</header>
				<div className="page-wrap">
					{renderPage(page, {
						liveSnapshot,
						dashboardIssues,
						healthHistory,
						analysisRestoring,
						aiQuestion,
						activeIssue,
						activeFilePath,
						debtIssuesOnly,
						onPage: (next) => {
							if (next === "Issues") setDebtIssuesOnly(false);
							setPage(next);
						},
						onStartAnalysis: () => setAnalysisOpen(true),
						onCorrectedCode: () => setPage("Code explorer"),
						onOpenIssue: openIssue,
						onDebtIssues: () => {
							setDebtIssuesOnly(true);
							setPage(liveSnapshot ? "Issues" : "Quick Analysis");
						},
						onIssueSelect: setActiveIssue,
						onFileSelect: setActiveFilePath,
						detailIssueId,
						notify,
						onCreateBranch: createDemoBranch,
					})}
				</div>
			</main>
			{commandOpen && (
				<CommandPalette
					query={commandQuery}
					setQuery={setCommandQuery}
					onClose={() => setCommandOpen(false)}
					onRun={runCommand}
					hasLiveAnalysis={Boolean(liveSnapshot)}
				/>
			)}
			{analysisOpen && (
				<RepositoryAnalysis
					onClose={() => setAnalysisOpen(false)}
					onRepositorySelected={(repository, branch) => {
						setConnectedRepository(repository);
						setSelectedBranch(branch);
						setRepo(repository.fullName);
					}}
					onAnalysisComplete={(snapshot) => {
						setLiveSnapshot(snapshot);
						setActiveIssue(null);
						setActiveFilePath("");
						setSelectedBranch(snapshot.branch);
						setRepo(snapshot.repository);
						setDebtIssuesOnly(false);
						if (connectedRepository) {
							apiRequest<{
								analyses: Array<{ metrics: Record<string, number> }>;
							}>(`/repositories/${connectedRepository.id}/history`)
								.then(({ analyses }) =>
									setHealthHistory(
										analyses
											.map((item) => item.metrics.codebaseHealth)
											.filter(
												(value): value is number => typeof value === "number",
											),
									),
								)
								.catch((reason: unknown) =>
									notify(
										reason instanceof Error
											? reason.message
											: "Could not refresh analysis history.",
									),
								);
						}
						notify(
							`Analysis completed for ${snapshot.repository} · ${snapshot.counts.issues} findings`,
						);
					}}
				/>
			)}
			{toast && (
				<div className="toast">
					<Check size={16} />
					{toast}
					<button
						onClick={() => setToast("")}
						aria-label="Dismiss notification"
					>
						<X size={14} />
					</button>
				</div>
			)}
		</div>
	);
}

function WorkspaceTransition({
	user,
	closing,
}: {
	user: AuthUser;
	closing: boolean;
}) {
	return (
		<div
			className={`workspace-transition ${closing ? "is-closing" : ""}`}
			role="status"
			aria-live="polite"
		>
			<div className="transition-grid" />
			<div className="transition-content">
				<div className="transition-brand">
					<span className="transition-brand-mark">
						<Braces size={17} />
					</span>
					<span>
						logicloom<span>.</span>
					</span>
				</div>
				<div className="transition-orbit" aria-hidden="true">
					<div className="transition-ring transition-ring-one" />
					<div className="transition-ring transition-ring-two" />
					<div className="transition-core">
						<Sparkles size={22} />
					</div>
					<span className="transition-node transition-node-one">TS</span>
					<span className="transition-node transition-node-two">PY</span>
					<span className="transition-node transition-node-three">JS</span>
				</div>
				<div className="transition-code" aria-hidden="true">
					<span>const workspace = await logicloom.connect()</span>
					<span>→ indexing dependencies...</span>
					<span>→ calibrating refactoring engine...</span>
				</div>
				<p className="transition-kicker">WORKSPACE INITIALIZATION</p>
				<h1>Welcome, {user.fullName.split(" ")[0]}.</h1>
				<p className="transition-copy">
					Mapping your engineering intelligence workspace
				</p>
				<div className="transition-progress">
					<span />
				</div>
				<div className="transition-steps">
					<span className="transition-step-active">
						<Check size={11} /> Session verified
					</span>
					<span>
						<Network size={11} /> Loading analysis surface
					</span>
					<span>
						<Sparkles size={11} /> Ready to explore
					</span>
				</div>
			</div>
		</div>
	);
}

type PageRenderProps = {
	liveSnapshot: CompletedAnalysisSnapshot | null;
	dashboardIssues: Issue[];
	healthHistory: number[];
	analysisRestoring: boolean;
	aiQuestion: string;
	activeIssue: Issue | null;
	activeFilePath: string;
	debtIssuesOnly: boolean;
	onPage: (page: Page) => void;
	onStartAnalysis: () => void;
	onCorrectedCode: () => void;
	onOpenIssue: (issue: Issue) => void;
	onDebtIssues: () => void;
	onIssueSelect: (issue: Issue | null) => void;
	onFileSelect: (path: string) => void;
	detailIssueId?: string;
	notify: (message: string) => void;
	onCreateBranch: () => void;
};

function renderPage(page: Page, props: PageRenderProps) {
	const {
		liveSnapshot,
		dashboardIssues,
		healthHistory,
		analysisRestoring,
		aiQuestion,
		activeIssue,
		activeFilePath,
		debtIssuesOnly,
		onPage,
		onStartAnalysis,
		onCorrectedCode,
		onOpenIssue,
		onDebtIssues,
		onIssueSelect,
		onFileSelect,
		detailIssueId,
		notify,
		onCreateBranch,
	} = props;
	switch (page) {
		case "Quick Analysis":
			return <QuickAnalysis />;
		case "Overview":
			return (
				<Overview
					onPage={onPage}
					onOpenIssue={onOpenIssue}
					onStartAnalysis={onStartAnalysis}
					onCorrectedCode={onCorrectedCode}
					liveSnapshot={liveSnapshot}
					liveIssues={dashboardIssues}
					healthHistory={healthHistory}
					onDebtIssues={onDebtIssues}
					loading={analysisRestoring}
				/>
			);
		case "Issues":
			return liveSnapshot ? (
				<LiveIssuesPage
					analysisId={liveSnapshot.analysisId}
					onOpenCode={(issue) => {
						onIssueSelect({
							...toDashboardIssue(issue),
							file: issue.file?.path ?? "Repository",
						});
						onPage("Code explorer");
					}}
					initialIssueId={detailIssueId}
					debtOnly={debtIssuesOnly}
				/>
			) : (
				<EmptyAnalysisPage
					title="Issues"
					onConnect={onStartAnalysis}
					loading={analysisRestoring}
				/>
			);
		case "Code explorer":
			return liveSnapshot ? (
				<LiveCodeExplorer
					analysisId={liveSnapshot.analysisId}
					selectedIssue={activeIssue}
					selectedFilePath={activeFilePath}
					onIssueSelect={onIssueSelect}
				/>
			) : (
				<EmptyAnalysisPage
					title="Code Explorer"
					onConnect={onStartAnalysis}
					loading={analysisRestoring}
				/>
			);
		case "Architecture":
			return liveSnapshot ? (
				<LiveArchitecture
					analysisId={liveSnapshot.analysisId}
					onOpenCode={(path) => {
						onIssueSelect(null);
						onFileSelect(path);
						onPage("Code explorer");
					}}
				/>
			) : (
				<EmptyAnalysisPage
					title="Architecture"
					onConnect={onStartAnalysis}
					loading={analysisRestoring}
				/>
			);
		case "Dependencies":
			return (
				<EmptyAnalysisPage
					title="Dependencies"
					onConnect={onStartAnalysis}
					loading={analysisRestoring}
				/>
			);
		case "Change impact":
			return liveSnapshot ? (
				<LiveChangeImpact analysisId={liveSnapshot.analysisId} />
			) : (
				<EmptyAnalysisPage
					title="Change Impact"
					onConnect={onStartAnalysis}
					loading={analysisRestoring}
				/>
			);
		case "AI insights":
			return liveSnapshot ? (
				<LiveInsights
					analysisId={liveSnapshot.analysisId}
					initialQuestion={aiQuestion}
				/>
			) : (
				<EmptyAnalysisPage
					title="AI Insights"
					onConnect={onStartAnalysis}
					loading={analysisRestoring}
				/>
			);
		case "Root causes":
			return <RootCauses onOpenIssue={onOpenIssue} />;
		case "Time machine":
			return <TimeMachine />;
		case "Codebase DNA":
			return <CodebaseDNA />;
		case "Pre-commit":
			return <PreCommit notify={notify} onCreateBranch={onCreateBranch} />;
	}
}

function PageHeading({
	eyebrow,
	title,
	subtitle,
	action,
}: {
	eyebrow?: string;
	title: string;
	subtitle: string;
	action?: React.ReactNode;
}) {
	return (
		<div className="page-heading">
			<div>
				<div className="eyebrow">{eyebrow ?? "CODEBASE OVERVIEW"}</div>
				<h1>{title}</h1>
				<p>{subtitle}</p>
			</div>
			{action && <div className="heading-action">{action}</div>}
		</div>
	);
}
function EmptyAnalysisPage({
	title,
	onConnect,
	loading = false,
}: {
	title: string;
	onConnect: () => void;
	loading?: boolean;
}) {
	return (
		<>
			<PageHeading
				title={title}
				subtitle="Analysis data is shared across the repository workspace."
				action={
					!loading && (
						<button className="button-primary" onClick={onConnect}>
							<Play size={14} fill="currentColor" />
							Run analysis
						</button>
					)
				}
			/>
			{loading && (
				<div className="analysis-page-loading" role="status">
					Loading analysis…
				</div>
			)}
		</>
	);
}
function SectionTitle({
	title,
	detail,
	action,
}: {
	title: string;
	detail?: string;
	action?: React.ReactNode;
}) {
	return (
		<div className="section-title">
			<div>
				<h2>{title}</h2>
				{detail && <span>{detail}</span>}
			</div>
			{action}
		</div>
	);
}
function Overview({
	onPage,
	onOpenIssue,
	onStartAnalysis,
	onCorrectedCode,
	liveSnapshot,
	liveIssues,
	healthHistory,
	onDebtIssues,
	loading,
}: {
	onPage: (page: Page) => void;
	onOpenIssue: (issue: Issue) => void;
	onStartAnalysis: () => void;
	onCorrectedCode: () => void;
	liveSnapshot: CompletedAnalysisSnapshot | null;
	liveIssues: Issue[];
	healthHistory: number[];
	onDebtIssues: () => void;
	loading: boolean;
}) {
	const [range, setRange] = useState("Last 30 scans");
	if (!liveSnapshot) {
		return (
			<>
				<PageHeading
					title="Overview"
					subtitle="Repository health and technical debt from your latest completed analysis."
					action={
						<button className="button-primary" onClick={onStartAnalysis}>
							<Play size={14} fill="currentColor" />
							Run analysis
						</button>
					}
				/>
				<section className="panel live-empty overview-empty-state">
					{loading ? (
						<b>Loading analysis…</b>
					) : (
						<>
							<Code2 size={20} />
							<b>Connect a repository and run an analysis to see results.</b>
							<button className="button-primary" onClick={onStartAnalysis}>
								<GitBranch size={14} />
								Connect repository
							</button>
						</>
					)}
				</section>
			</>
		);
	}
	const quality = liveSnapshot.metrics.codeQuality;
	const health = liveSnapshot.metrics.codebaseHealth;
	const debt = liveSnapshot.metrics.technicalDebtHours;
	const categoryCounts = Object.fromEntries(
		[
			"COMPLEXITY",
			"DUPLICATION",
			"ARCHITECTURE",
			"DEPENDENCY",
			"MAINTAINABILITY",
			"SECURITY",
		].map((category) => [
			category,
			liveSnapshot.issues.filter((finding) => finding.category === category)
				.length,
		]),
	);
	const recentIssues = [...liveIssues]
		.sort((left, right) => right.score - left.score)
		.slice(0, 4);
	return (
		<>
			<PageHeading
				title="Overview"
				subtitle="Latest measured repository health, technical debt, and analysis activity."
				action={
					<>
						<button
							className="button-secondary"
							onClick={() => onPage("Change impact")}
						>
							<GitPullRequest size={15} />
							Simulate change
						</button>
						<button className="button-primary" onClick={onStartAnalysis}>
							<Play size={14} fill="currentColor" />
							Run analysis
						</button>
					</>
				}
			/>
			<div className="overview-meta">
				<div className="scan-live">
					<span className="live-dot" />
					{liveSnapshot.repository} · {liveSnapshot.branch} ·{" "}
					{liveSnapshot.commitSha.slice(0, 7)}
					{liveSnapshot.completedAt && (
						<>
							<span className="meta-sep">·</span>Analyzed{" "}
							{new Date(liveSnapshot.completedAt).toLocaleString()}
						</>
					)}
				</div>
				<button
					className="range-button"
					onClick={() =>
						setRange(
							range === "Last 30 scans" ? "Last 7 scans" : "Last 30 scans",
						)
					}
				>
					<Clock3 size={14} />
					{range}
					<ChevronDown size={13} />
				</button>
			</div>
			<div className="overview-stat-grid">
				<OverviewStatCard
					label="Code quality"
					value={quality}
					suffix="/100"
					tone="lime"
					detail={`${liveSnapshot.counts.files} files analyzed`}
					onClick={() => onPage("Issues")}
				/>
				<OverviewStatCard
					label="Technical debt"
					value={debt}
					suffix=" hrs"
					tone="teal"
					detail={`${liveIssues.length} measured findings`}
					onClick={onDebtIssues}
				/>
				<OverviewStatCard
					label="Architecture risk"
					value={liveSnapshot.metrics.architectureRisk}
					suffix="/100"
					tone="amber"
					detail={`${liveSnapshot.counts.dependencies} dependency edges`}
					onClick={() => onPage("Architecture")}
				/>
				<OverviewStatCard
					label="Test coverage"
					value={undefined}
					suffix=""
					tone="violet"
					detail="Not measured by static analysis"
				/>
			</div>
			<div className="overview-grid dashboard-overview-grid">
				<CodebaseHealthPanel
					range={range}
					health={health}
					history={healthHistory}
					live
					onRange={() =>
						setRange(
							range === "Last 30 scans" ? "Last 7 scans" : "Last 30 scans",
						)
					}
				/>
				<section className="panel issues-panel">
					<SectionTitle
						title="Priority issues"
						detail="Needs your attention"
						action={
							<button className="text-action" onClick={() => onPage("Issues")}>
								View all <ArrowRight size={13} />
							</button>
						}
					/>
					<div className="priority-list">
						{recentIssues.map((issue) => (
							<button
								key={issue.id}
								className="priority-item"
								onClick={() => onOpenIssue(issue)}
							>
								<span
									className={`severity-icon severity-${issue.severity.toLowerCase()}`}
								>
									{issue.severity === "High" ||
									issue.severity === "Critical" ? (
										<ShieldAlert size={15} />
									) : issue.severity === "Medium" ? (
										<Activity size={15} />
									) : (
										<CircleHelp size={15} />
									)}
								</span>
								<span className="priority-copy">
									<b>{issue.title}</b>
									<small>
										<span>{issue.file.split("/").slice(-1)}</span>
										<i>·</i>
										{issue.category}
									</small>
								</span>
								<span
									className={`severity-label severity-text-${issue.severity.toLowerCase()}`}
								>
									{issue.severity}
								</span>
								<ChevronRight size={15} className="priority-chevron" />
							</button>
						))}
						{recentIssues.length === 0 && (
							<div className="live-empty">
								No findings were detected in this analysis.
							</div>
						)}
					</div>
				</section>
				<TechnicalDebtPanel
					onIssues={onDebtIssues}
					debt={debt}
					issues={liveIssues}
				/>
				<section className="panel activity-panel">
					<SectionTitle
						title="Recent activity"
						detail="Latest completed repository analysis"
						action={
							<button
								className="text-action"
								onClick={() => onPage("AI insights")}
							>
								See insights <ArrowRight size={13} />
							</button>
						}
					/>
					<div className="activity-list">
						<ActivityItem
							icon={<Check size={14} />}
							color="green"
							title={`Analysis completed · ${liveSnapshot.counts.issues} findings`}
							who={`${liveSnapshot.repository} · ${liveSnapshot.branch}`}
							when={
								liveSnapshot.completedAt
									? new Date(liveSnapshot.completedAt).toLocaleString()
									: "Completion time unavailable"
							}
						/>
					</div>
				</section>
			</div>
			<section className="panel corrected-code-panel">
				<div>
					<span className="eyebrow">CORRECTED CODE</span>
					<h2>Review measured findings and produce a safer version</h2>
					<p>
						{liveSnapshot.repository === "Pasted code"
							? "Open the pasted snippet to generate an original-versus-reviewed Monaco diff. Applying a review is always explicit."
							: "Open the analyzed source explorer to inspect the exact file and findings before making a correction."}
					</p>
				</div>
				<button className="button-secondary" onClick={onCorrectedCode}>
					<WandSparkles size={14} />
					{liveSnapshot.repository === "Pasted code"
						? "Review corrected code"
						: "Open source findings"}
					<ArrowRight size={13} />
				</button>
			</section>
			<section className="panel overview-analysis-breakdown">
				<SectionTitle
					title="Analysis breakdown"
					detail={`${liveSnapshot.counts.files} files · ${liveSnapshot.counts.dependencies} dependency edges`}
				/>
				<div className="overview-breakdown-grid">
					<div>
						<span>Issue count</span>
						<b>{liveSnapshot.counts.issues}</b>
					</div>
					<div>
						<span>Average complexity</span>
						<b>{liveSnapshot.metrics.complexity ?? "—"}</b>
					</div>
					<div>
						<span>Duplication findings</span>
						<b>{categoryCounts.DUPLICATION}</b>
					</div>
					<div>
						<span>Architecture findings</span>
						<b>{categoryCounts.ARCHITECTURE}</b>
					</div>
					<div>
						<span>Dependency findings</span>
						<b>{categoryCounts.DEPENDENCY}</b>
					</div>
					<div>
						<span>Maintainability</span>
						<b>
							{liveSnapshot.metrics.maintainability ?? "—"}
							{liveSnapshot.metrics.maintainability !== undefined ? "/100" : ""}
						</b>
					</div>
				</div>
			</section>
			<div className="demo-footnote">
				<LockKeyhole size={12} />
				Measured from {liveSnapshot.counts.files} source files at{" "}
				{liveSnapshot.repository === "Pasted code"
					? "a local snippet"
					: `commit ${liveSnapshot.commitSha.slice(0, 12)}`}{" "}
				· deterministic analysis
			</div>
		</>
	);
}
function OverviewStatCard({
	label,
	value,
	suffix,
	tone,
	detail,
	onClick,
}: {
	label: string;
	value?: number;
	suffix: string;
	tone: string;
	detail: string;
	onClick?: () => void;
}) {
	return (
		<button
			className={`overview-stat-card ${tone}`}
			onClick={onClick}
			disabled={!onClick}
		>
			<span className="overview-stat-label">
				{label}
				<MoreHorizontal size={14} />
			</span>
			<strong>
				{value === undefined ? "—" : value}
				<small>{suffix}</small>
			</strong>
			<span className="overview-stat-detail">{detail}</span>
			<i className="overview-stat-spark" />
		</button>
	);
}
function CodebaseHealthPanel({
	range,
	health,
	history,
	live,
	onRange,
}: {
	range: string;
	health?: number;
	history: number[];
	live: boolean;
	onRange: () => void;
}) {
	const points =
		live && history.length
			? history.slice(range === "Last 7 scans" ? -7 : -30)
			: [];
	const delta =
		points.length > 1 ? points[points.length - 1] - points[0] : null;
	const trendPath =
		points.length > 1
			? points
					.map(
						(value, index) =>
							`${(index / (points.length - 1)) * 240},${64 - Math.max(0, Math.min(value, 100)) * 0.55}`,
					)
					.join(" ")
			: "";
	return (
		<section className="panel overview-feature health-feature">
			<div className="feature-kicker">
				<span className="feature-icon health-icon">
					<Activity size={15} />
				</span>
				<span>02 · CODEBASE HEALTH</span>
				<button className="select-button" onClick={onRange}>
					{range}
					<ChevronDown size={12} />
				</button>
			</div>
			<div className="health-score-row">
				<div>
					<strong>{health ?? "—"}</strong>
					<span>/100 overall</span>
				</div>
				{delta !== null && (
					<span className={`health-trend ${delta < 0 ? "text-red" : ""}`}>
						{delta > 0 ? (
							<ArrowUpRight size={13} />
						) : delta < 0 ? (
							<ArrowDownRight size={13} />
						) : null}
						{delta > 0 ? "+" : ""}
						{delta} pts
					</span>
				)}
			</div>
			<div className="health-feature-chart">
				<div className="health-feature-grid" />
				<svg
					viewBox="0 0 240 70"
					preserveAspectRatio="none"
					aria-label="Codebase health trend from completed analysis snapshots"
				>
					{points.length > 0 && (
						<>
							<polyline
								points={trendPath}
								fill="none"
								stroke="#a3e635"
								strokeWidth="2"
								vectorEffect="non-scaling-stroke"
							/>
							<circle
								cx={points.length > 1 ? 240 : 120}
								cy={
									64 -
									Math.max(
										0,
										Math.min(points[points.length - 1] ?? health ?? 0, 100),
									) *
										0.55
								}
								r="3"
								fill="#c5ed88"
							/>
						</>
					)}
				</svg>
			</div>
			<div className="feature-footer">
				<span>
					<i className="live-dot" />
					{`${points.length} completed snapshots`}
				</span>
				<span className="health-threshold">Target ≥ 80</span>
			</div>
		</section>
	);
}
function TechnicalDebtPanel({
	onIssues,
	debt,
	issues: findings,
}: {
	onIssues: () => void;
	debt?: number;
	issues: Issue[];
}) {
	const categories = [
		{ label: "Complexity", color: "lime" },
		{ label: "Duplication", color: "blue" },
		{ label: "Architecture", color: "violet" },
		{ label: "Security", color: "orange" },
		{ label: "Dependency", color: "blue" },
		{ label: "Maintainability", color: "lime" },
	];
	const breakdown = categories.map((item) => ({
		...item,
		value: findings
			.filter(
				(finding) =>
					finding.category === item.label ||
					(item.label === "Complexity" &&
						finding.category === "Maintainability"),
			)
			.reduce((sum, finding) => sum + (finding.estimatedEffort ?? 0), 0),
	}));
	const total = debt;
	return (
		<section className="panel overview-feature debt-feature">
			<div className="feature-kicker">
				<span className="feature-icon debt-icon">
					<GitFork size={15} />
				</span>
				<span>03 · TECHNICAL DEBT</span>
				<button
					className="feature-more"
					aria-label="Review technical debt findings"
					onClick={onIssues}
				>
					<MoreHorizontal size={16} />
				</button>
			</div>
			<div className="debt-feature-total">
				<strong>{total ?? "—"}</strong>
				<span>hours estimated</span>
				<small>{`Across ${findings.length} analyzed findings`}</small>
			</div>
			<div className="debt-category-list">
				{breakdown.map((item) => (
					<div className="debt-category" key={item.label}>
						<span>{item.label}</span>
						<div className="debt-track">
							<i
								className={`debt-fill ${item.color}`}
								style={{ width: `${total ? (item.value / total) * 100 : 0}%` }}
							/>
						</div>
						<b>{item.value}h</b>
					</div>
				))}
			</div>
			<div className="feature-footer">
				<span>Effort to remediate</span>
				<button className="text-action" onClick={onIssues}>
					Explore debt <ArrowRight size={13} />
				</button>
			</div>
		</section>
	);
}
function ActivityItem({
	icon,
	color,
	title,
	who,
	when,
}: {
	icon: React.ReactNode;
	color: string;
	title: string;
	who: string;
	when: string;
}) {
	return (
		<div className="activity-item">
			<span className={`activity-icon ${color}`}>{icon}</span>
			<span className="activity-copy">
				<b>{title}</b>
				<small>{who}</small>
			</span>
			<time>{when}</time>
		</div>
	);
}

export function IssuesPage({
	search,
	onOpenIssue,
	notify,
	sourceIssues = issues,
}: {
	search: string;
	onOpenIssue: (issue: Issue) => void;
	notify: (message: string) => void;
	sourceIssues?: Issue[];
}) {
	const [category, setCategory] = useState("All issues");
	const [severity, setSeverity] = useState("All severities");
	const [sortBy, setSortBy] = useState("Risk score");
	const filtered = useMemo(
		() =>
			sourceIssues
				.filter((i) => {
					const q = search.toLowerCase();
					return (
						(!q ||
							`${i.title} ${i.file} ${i.category} ${i.id}`
								.toLowerCase()
								.includes(q)) &&
						(category === "All issues" || i.category === category) &&
						(severity === "All severities" || i.severity === severity)
					);
				})
				.sort((a, b) =>
					sortBy === "Risk score"
						? b.score - a.score
						: a.title.localeCompare(b.title),
				),
		[category, search, severity, sortBy, sourceIssues],
	);
	return (
		<>
			<PageHeading
				eyebrow="CODE QUALITY"
				title="Issues"
				subtitle="Find, prioritize, and resolve code quality risks."
				action={
					<button
						className="button-primary"
						onClick={() =>
							notify("Analysis complete — sample repository data refreshed.")
						}
					>
						<Play size={14} fill="currentColor" />
						Run analysis
					</button>
				}
			/>
			<div className="issue-summary-row">
				<div>
					<b>6</b>
					<span>sample findings</span>
				</div>
				<div>
					<b className="text-red">2</b>
					<span>high severity</span>
				</div>
				<div>
					<b className="text-amber">3</b>
					<span>medium severity</span>
				</div>
				<div>
					<b className="text-green">1</b>
					<span>low severity</span>
				</div>
				<div className="issue-summary-score">
					<span>Code quality</span>
					<b>
						71 <small>/ 100</small>
					</b>
					<span className="score-trend">
						<ArrowUpRight size={12} /> 4.8% this month
					</span>
				</div>
			</div>
			<section className="panel issue-table-panel">
				<div className="table-toolbar">
					<div>
						<SectionTitle
							title="All findings"
							detail={`${filtered.length} results`}
						/>
					</div>
					<div className="filter-group">
						<label className="filter-select">
							<ListFilter size={14} />
							<select
								value={category}
								onChange={(e) => setCategory(e.target.value)}
							>
								<option>All issues</option>
								{["Complexity", "Duplication", "Architecture", "Security"].map(
									(v) => (
										<option key={v}>{v}</option>
									),
								)}
							</select>
							<ChevronDown size={13} />
						</label>
						<label className="filter-select">
							<select
								value={severity}
								onChange={(e) => setSeverity(e.target.value)}
							>
								<option>All severities</option>
								{["High", "Medium", "Low"].map((v) => (
									<option key={v}>{v}</option>
								))}
							</select>
							<ChevronDown size={13} />
						</label>
						<label className="filter-select">
							<select
								value={sortBy}
								onChange={(e) => setSortBy(e.target.value)}
							>
								<option>Risk score</option>
								<option>Title</option>
							</select>
							<ChevronDown size={13} />
						</label>
					</div>
				</div>
				<div className="table-scroll">
					<table className="issues-table">
						<thead>
							<tr>
								<th>ISSUE</th>
								<th>CATEGORY</th>
								<th>LOCATION</th>
								<th>SEVERITY</th>
								<th>RISK SCORE</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{filtered.map((issue) => (
								<tr key={issue.id} onClick={() => onOpenIssue(issue)}>
									<td>
										<div className="issue-title-cell">
											<span
												className={`severity-dot ${issue.severity.toLowerCase()}`}
											/>
											<span>
												<b>{issue.title}</b>
												<small>
													{issue.id} <i>·</i> Detected 2 days ago
												</small>
											</span>
										</div>
									</td>
									<td>
										<span className="category-tag">{issue.category}</span>
									</td>
									<td className="location-cell">
										<FileCode2 size={13} />
										{issue.file}
										<span>:{issue.line}</span>
									</td>
									<td>
										<span
											className={`severity-label severity-text-${issue.severity.toLowerCase()}`}
										>
											{issue.severity}
										</span>
									</td>
									<td>
										<div className="risk-cell">
											<div className="risk-track">
												<i
													style={{ width: `${issue.score}%` }}
													className={issue.severity.toLowerCase()}
												/>
											</div>
											<b>{issue.score}</b>
										</div>
									</td>
									<td>
										<button className="table-more" aria-label="Open issue">
											<ChevronRight size={15} />
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{filtered.length === 0 && (
						<div className="empty-state">
							<Search size={21} />
							<b>No matching issues</b>
							<span>Try changing your filters or search term.</span>
						</div>
					)}
				</div>
				<div className="table-footer">
					<span>
						Showing <b>{filtered.length}</b> of 6 sample findings
					</span>
					<div>
						<button disabled>Previous</button>
						<button className="page-number">1</button>
						<button
							onClick={() => {
								setCategory("Architecture");
							}}
						>
							2
						</button>
						<button
							onClick={() => {
								setCategory("Security");
							}}
						>
							Next <ArrowRight size={12} />
						</button>
					</div>
				</div>
			</section>
			<div className="demo-footnote">
				<LockKeyhole size={12} /> Showing illustrative findings from a sample
				repository
			</div>
		</>
	);
}

export function CodeExplorer({
	issue,
	onSelectIssue,
	notify,
}: {
	issue: Issue;
	onSelectIssue: (issue: Issue) => void;
	notify: (message: string) => void;
}) {
	const [file, setFile] = useState(issue.file);
	const [rightTab, setRightTab] = useState("AST");
	const [editorTab, setEditorTab] = useState("Code");
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [savedFiles, setSavedFiles] = useState<Record<string, string>>({});
	const fileMeta = files.find((f) => f.path === file) ?? files[0];
	const selectedIssue = issues.find((item) => item.file === file) ?? issue;
	const baseCode = codeSamples[file] ?? codeSamples[files[0].path];
	const code = drafts[file] ?? savedFiles[file] ?? baseCode;
	const hasChanges = code !== (savedFiles[file] ?? baseCode);
	return (
		<>
			<PageHeading
				eyebrow="CODE EXPLORER"
				title="Understand every line"
				subtitle="Browse your source with code intelligence built in."
				action={
					<button
						className="button-secondary"
						onClick={() => notify("Shareable code link copied")}
					>
						<GitBranch size={15} />
						main <ChevronDown size={12} />
					</button>
				}
			/>
			<div className="explorer-layout">
				<section className="panel file-panel">
					<div className="file-panel-head">
						<div>
							<span className="eyebrow">EXPLORER</span>
							<button aria-label="File options">
								<MoreHorizontal size={15} />
							</button>
						</div>
						<label>
							<Search size={13} />
							<input placeholder="Filter files" />
						</label>
					</div>
					<div className="file-tree-root">
						<ChevronDown size={13} />
						<span className="folder-icon">⌂</span>storefront
					</div>
					<div className="tree-folder">
						<ChevronDown size={13} />
						<span className="folder-icon">▱</span>src
					</div>
					<div className="tree-folder tree-indent">
						<ChevronDown size={13} />
						<span className="folder-icon">▱</span>services
					</div>
					{files.map((item) => (
						<button
							className={`file-tree-item ${file === item.path ? "file-selected" : ""}`}
							key={item.path}
							onClick={() => setFile(item.path)}
						>
							<FileCode2 size={14} />
							<span>{item.name}</span>
							<i className={`tree-debt ${item.debt.toLowerCase()}`} />
						</button>
					))}
				</section>
				<section className="panel editor-panel">
					<div className="editor-breadcrumb">
						<span>src</span>
						<ChevronRight size={12} />
						<span>{file.split("/").slice(-2, -1)}</span>
						<ChevronRight size={12} />
						<b>{fileMeta.name}</b>
						<span className={`debt-badge ${fileMeta.debt.toLowerCase()}`}>
							{fileMeta.debt} debt
						</span>
						<div className="editor-actions">
							{hasChanges && (
								<button
									className="editor-save"
									onClick={() => {
										setSavedFiles({ ...savedFiles, [file]: code });
										notify("Saved in this demo session");
									}}
								>
									<Check size={12} />
									Save
								</button>
							)}
							<button
								onClick={() => notify("File link copied")}
								aria-label="Copy file link"
							>
								<Split size={14} />
							</button>
							<button
								onClick={() => notify("File options opened")}
								aria-label="More file options"
							>
								<MoreHorizontal size={17} />
							</button>
						</div>
					</div>
					<div className="editor-tabs">
						<button
							className={editorTab === "Code" ? "active" : ""}
							onClick={() => setEditorTab("Code")}
						>
							<FileCode2 size={13} />
							{fileMeta.name}
							{hasChanges && <i className="editor-dirty" />}
							<X size={12} />
						</button>
						<button
							className={editorTab === "History" ? "active" : ""}
							onClick={() => setEditorTab("History")}
						>
							<GitCommitHorizontal size={13} />
							History
						</button>
					</div>
					{editorTab === "Code" ? (
						<div className="monaco-wrap">
							<Editor
								height="100%"
								language="typescript"
								theme="vs-dark"
								value={code}
								onChange={(value) =>
									setDrafts({ ...drafts, [file]: value ?? "" })
								}
								options={{
									readOnly: false,
									minimap: { enabled: false },
									fontSize: 12.5,
									lineHeight: 21,
									fontFamily: "'SFMono-Regular', Consolas, monospace",
									scrollBeyondLastLine: false,
									renderLineHighlight: "gutter",
									lineNumbersMinChars: 3,
									padding: { top: 14 },
									overviewRulerBorder: false,
									scrollbar: {
										verticalScrollbarSize: 6,
										horizontalScrollbarSize: 6,
									},
									wordWrap: "on",
								}}
								loading={
									<div className="editor-loading">
										<Braces size={19} />
										Loading code editor…
									</div>
								}
							/>
						</div>
					) : (
						<div className="history-view">
							<div className="history-commit">
								<span className="commit-avatar">JD</span>
								<div>
									<b>Handle empty cart state</b>
									<small>Jordan Davis · 12 minutes ago</small>
								</div>
								<code>8f2ab41</code>
							</div>
							<div className="history-commit">
								<span className="commit-avatar violet">MC</span>
								<div>
									<b>Improve checkout validation</b>
									<small>Maya Chen · Yesterday</small>
								</div>
								<code>2bc17da</code>
							</div>
							<div className="history-commit">
								<span className="commit-avatar blue">JD</span>
								<div>
									<b>Initial checkout flow</b>
									<small>Jordan Davis · 3 days ago</small>
								</div>
								<code>c14d903</code>
							</div>
						</div>
					)}
				</section>
				<aside className="panel inspector-panel">
					<div className="inspector-tabs">
						{["AST", "Debt", "Issues"].map((tab) => (
							<button
								key={tab}
								className={rightTab === tab ? "selected" : ""}
								onClick={() => setRightTab(tab)}
							>
								{tab}
								{tab === "Issues" && <span>1</span>}
							</button>
						))}
					</div>
					{rightTab === "AST" ? (
						<>
							<div className="inspector-summary">
								<div className="inspector-icon">
									<Braces size={17} />
								</div>
								<div>
									<b>processCheckout</b>
									<span>Function declaration</span>
								</div>
							</div>
							<div className="inspector-content">
								<div className="inspector-section-label">STRUCTURE</div>
								<div className="ast-row">
									<span className="ast-dot lime" />
									<b>FunctionDeclaration</b>
									<span>1</span>
								</div>
								<div className="ast-child">
									<span className="ast-dot violet" />
									Identifier <code>processCheckout</code>
								</div>
								<div className="ast-child">
									<span className="ast-dot blue" />
									Parameters <code>2</code>
								</div>
								<div className="ast-child">
									<span className="ast-dot orange" />
									BlockStatement <code>38 lines</code>
								</div>
								<div className="inspector-section-label ast-spaced">
									METRICS
								</div>
								<div className="inspector-metric">
									<span>Cyclomatic complexity</span>
									<b className="text-red">
										{fileMeta.complexity} <i>High</i>
									</b>
								</div>
								<div className="inspector-metric">
									<span>Lines of code</span>
									<b>{fileMeta.lines}</b>
								</div>
								<div className="inspector-metric">
									<span>Parameters</span>
									<b>2</b>
								</div>
								<div className="inspector-metric">
									<span>Maintainability</span>
									<b className="text-amber">B−</b>
								</div>
								<div className="complexity-meter">
									<span />
								</div>
								<div className="complexity-scale">
									<span>Low</span>
									<span>Moderate</span>
									<span>High</span>
								</div>
							</div>
						</>
					) : rightTab === "Debt" ? (
						<div className="inspector-content">
							<div className="debt-score-card">
								<span>TECHNICAL DEBT</span>
								<b>
									{fileMeta.debt === "High"
										? "4.8"
										: fileMeta.debt === "Medium"
											? "2.6"
											: "0.9"}{" "}
									<small>hrs</small>
								</b>
								<p>Estimated time to resolve findings in this file.</p>
							</div>
							<div className="inspector-section-label ast-spaced">
								BREAKDOWN
							</div>
							<div className="inspector-metric">
								<span>Complexity</span>
								<b>2.5 hrs</b>
							</div>
							<div className="inspector-metric">
								<span>Test gaps</span>
								<b>1.5 hrs</b>
							</div>
							<div className="inspector-metric">
								<span>Architecture</span>
								<b>0.8 hrs</b>
							</div>
							<button
								className="button-secondary full-button"
								onClick={() => notify("Debt breakdown exported")}
							>
								Export breakdown
							</button>
						</div>
					) : (
						<div className="inspector-content">
							<div className="inspector-section-label">
								FINDINGS IN THIS FILE
							</div>
							<button
								className="inspector-issue"
								onClick={() => onSelectIssue(selectedIssue)}
							>
								<span
									className={`severity-dot ${selectedIssue.severity.toLowerCase()}`}
								/>
								<b>{selectedIssue.title}</b>
								<small>
									{selectedIssue.id} · line {selectedIssue.line}
								</small>
								<ChevronRight size={14} />
							</button>
							<button
								className="button-secondary full-button"
								onClick={() => notify("Issue marked as resolved")}
							>
								<Check size={14} />
								Mark resolved
							</button>
						</div>
					)}
				</aside>
			</div>
		</>
	);
}

export function Dependencies({
	onOpenCode,
}: {
	onOpenCode: (filePath: string) => void;
}) {
	const [selected, setSelected] = useState("Checkout");
	const [layout, setLayout] = useState("Force");
	const edges = [
		[28, 27, 49, 43],
		[24, 57, 49, 43],
		[70, 26, 49, 43],
		[76, 57, 49, 43],
		[39, 76, 49, 43],
		[83, 77, 49, 43],
		[14, 40, 28, 27],
		[24, 57, 39, 76],
		[70, 26, 76, 57],
		[76, 57, 83, 77],
	];
	const current = nodes.find((node) => node.id === selected) ?? nodes[0];
	const selectedFile =
		(
			{
				Checkout: "src/services/checkout.ts",
				"Cart store": "src/hooks/useCart.ts",
				useCart: "src/hooks/useCart.ts",
				Validation: "src/utils/validate.ts",
				"Tax service": "src/services/checkout.ts",
				"Order UI": "src/components/OrderSummary.tsx",
				"Payment API": "src/api/session.ts",
				Formatter: "src/utils/validate.ts",
			} as Record<string, string>
		)[current.id] ?? files[0].path;
	return (
		<>
			<PageHeading
				eyebrow="ANALYZED DEPENDENCY GRAPH"
				title="Architecture"
				subtitle="An interactive map of modules, relationships, and where change may travel."
				action={
					<button
						className="button-secondary"
						onClick={() => setLayout(layout === "Force" ? "Radial" : "Force")}
					>
						<Network size={14} />
						{layout} layout
						<ChevronDown size={13} />
					</button>
				}
			/>
			<div className="graph-summary">
				<div>
					<span className="summary-icon purple">
						<GitFork size={16} />
					</span>
					<span>
						<b>148</b>
						<small>Modules</small>
					</span>
				</div>
				<div>
					<span className="summary-icon blue">
						<GitBranch size={16} />
					</span>
					<span>
						<b>326</b>
						<small>Dependencies</small>
					</span>
				</div>
				<div>
					<span className="summary-icon orange">
						<Activity size={16} />
					</span>
					<span>
						<b>3</b>
						<small>Circular deps</small>
					</span>
				</div>
				<div>
					<span className="summary-icon lime">
						<Zap size={16} />
					</span>
					<span>
						<b>0.72</b>
						<small>Modularity score</small>
					</span>
				</div>
			</div>
			<div className="graph-layout">
				<section className="panel graph-panel">
					<div className="graph-toolbar">
						<div className="graph-tabs">
							<button className="selected">System map</button>
							<button
								onClick={() =>
									setLayout(layout === "Force" ? "Radial" : "Force")
								}
							>
								Cycles <span className="graph-tab-count">3</span>
							</button>
						</div>
						<div className="graph-tools">
							<button
								onClick={() =>
									setLayout(layout === "Force" ? "Radial" : "Force")
								}
							>
								<Settings2 size={14} />
								{layout}
							</button>
							<button onClick={() => setSelected("Checkout")}>
								<Plus size={15} /> Zoom
							</button>
							<button onClick={() => setSelected("Checkout")}>
								<Split size={14} />
							</button>
						</div>
					</div>
					<div className="graph-canvas">
						<div className="graph-grid" />
						<svg
							className="graph-edges"
							viewBox="0 0 100 100"
							preserveAspectRatio="none"
						>
							{edges.map((edge, i) => (
								<line
									key={i}
									x1={edge[0]}
									y1={edge[1]}
									x2={edge[2]}
									y2={edge[3]}
									className={
										(edge[2] === current.x && edge[3] === current.y) ||
										(edge[0] === current.x && edge[1] === current.y)
											? "edge-active"
											: ""
									}
								/>
							))}
						</svg>
						{nodes.map((node) => (
							<button
								key={node.id}
								className={`graph-node ${node.color} ${selected === node.id ? "node-selected" : ""}`}
								style={{
									left: `${node.x}%`,
									top: `${node.y}%`,
									width: node.size * 2,
									height: node.size * 2,
								}}
								onClick={() => setSelected(node.id)}
								aria-label={`Select ${node.id}`}
							>
								<span>{node.id}</span>
							</button>
						))}
						<div className="graph-legend">
							<span>
								<i className="lime" />
								Application / core
							</span>
							<span>
								<i className="blue" />
								Service / utility
							</span>
							<span>
								<i className="purple" />
								UI / hook
							</span>
							<span>
								<i className="orange" />
								API / external
							</span>
						</div>
						<div className="graph-zoom">
							<button onClick={() => setSelected("Checkout")}>+</button>
							<button onClick={() => setSelected("Checkout")}>−</button>
							<button onClick={() => setSelected("Checkout")}>
								<Split size={13} />
							</button>
						</div>
					</div>
					<div className="graph-foot">
						<span>
							<span className="live-dot" />
							Showing 8 of 148 sample modules
						</span>
						<span>
							Relationships highlight direct and indirect paths · Select a node
						</span>
					</div>
				</section>
				<aside className="panel node-details">
					<div className="node-detail-top">
						<span className={`node-detail-icon ${current.color}`}>
							<Braces size={17} />
						</span>
						<button aria-label="More node actions">
							<MoreHorizontal size={16} />
						</button>
					</div>
					<span className="eyebrow">MODULE PROFILE · SAMPLE</span>
					<h3>{current.id}</h3>
					<code>{selectedFile}</code>
					<p className="node-detail-desc">
						{current.id === "Checkout"
							? "Coordinates order validation, payment processing, promotion rules, and cart lifecycle. This concentration makes checkout a central change-risk point."
							: `${current.id} is connected to the checkout flow in this illustrative storefront architecture map.`}
					</p>
					<div className="node-stat-row">
						<span>Health / risk</span>
						<b className="text-amber">
							62 / 74 <i>Elevated</i>
						</b>
					</div>
					<div className="node-stat-row">
						<span>Complexity</span>
						<b className="text-amber">
							{current.id === "Checkout" ? "18" : current.size}{" "}
							<i>{current.id === "Checkout" ? "High" : "Sample"}</i>
						</b>
					</div>
					<div className="node-stat-row">
						<span>Dependencies</span>
						<b>{current.detail.split(" · ")[0].replace(" imports", "")}</b>
					</div>
					<div className="node-stat-row">
						<span>Dependents</span>
						<b>{current.detail.split(" · ")[1].replace(" dependents", "")}</b>
					</div>
					<div className="node-stat-row">
						<span>Test coverage</span>
						<b>78%</b>
					</div>
					<div className="node-stat-row">
						<span>Technical debt</span>
						<b>~4.8h</b>
					</div>
					<div className="inspector-section-label ast-spaced">
						CONNECTED MODULES · SAMPLE RELATIONSHIPS
					</div>
					<button
						className="connected-file"
						onClick={() => setSelected("Cart store")}
					>
						<span className="node-mini blue" />
						stores/cart <span className="edge-kind">DIRECT</span>
						<ArrowRight size={13} />
					</button>
					<button
						className="connected-file"
						onClick={() => setSelected("Validation")}
					>
						<span className="node-mini orange" />
						utils/validate <span className="edge-kind api-edge">API</span>
						<ArrowRight size={13} />
					</button>
					<button
						className="connected-file"
						onClick={() => setSelected("Tax service")}
					>
						<span className="node-mini blue" />
						services/tax <span className="edge-kind test-edge">TEST</span>
						<ArrowRight size={13} />
					</button>
					<div className="node-ai-note">
						<Sparkles size={13} />
						<span>
							Sample explanation: checkout combines multiple responsibilities
							and has several downstream consumers.
						</span>
					</div>
					<button
						className="open-file-button"
						onClick={() => onOpenCode(selectedFile)}
					>
						<FileCode2 size={14} />
						Open file intelligence
					</button>
				</aside>
			</div>
		</>
	);
}

export function ChangeImpact({
	notify,
}: {
	notify: (message: string) => void;
}) {
	const [target, setTarget] = useState("src/services/checkout.ts");
	const [includeTests, setIncludeTests] = useState(true);
	const [simulated, setSimulated] = useState(false);
	const [proposal, setProposal] = useState("");
	const [diffOpen, setDiffOpen] = useState(false);
	const targetIssues = issues.filter((issue) => issue.file === target);
	const prediction = simulateSampleChange(target, includeTests);
	const relatedFiles = target.includes("checkout")
		? ["useCart.ts", "OrderSummary.tsx", "cartStore.ts"]
		: target.includes("session")
			? ["legacyAuth.ts", "userService.ts", "auth.test.ts"]
			: ["checkout.ts", "useCart.ts", "OrderSummary.tsx"];
	return (
		<>
			<PageHeading
				eyebrow="SIMULATE · CHANGE IMPACT"
				title="Impact Simulator"
				subtitle="Understand the blast radius and predicted trade-offs before changing code."
				action={
					<span className="demo-tag">
						<span className="live-dot" />
						SIMULATION MODE
					</span>
				}
			/>
			<section className="panel proposal-card">
				<div>
					<span className="eyebrow">PROPOSED CHANGE · OPTIONAL</span>
					<textarea
						value={proposal}
						onChange={(event) => setProposal(event.target.value)}
						placeholder="Describe the proposed change… e.g. Extract checkout validation into a dedicated service."
					/>
				</div>
				<div>
					<span className="sample-context">
						<LockKeyhole size={12} />
						Predictions use illustrative repository data
					</span>
					<button
						className="button-secondary"
						onClick={() => setDiffOpen(true)}
					>
						<GitCompareArrows size={14} />
						Preview refactor
					</button>
				</div>
			</section>
			<div className="impact-layout">
				<section className="panel impact-config">
					<SectionTitle
						title="Configure simulation"
						detail="Choose the change surface"
					/>
					<label className="form-label">TARGET FILE / MODULE</label>
					<label className="target-select">
						<FileCode2 size={15} />
						<select
							value={target}
							onChange={(event) => {
								setTarget(event.target.value);
								setSimulated(false);
							}}
						>
							{files.map((file) => (
								<option value={file.path} key={file.path}>
									{file.path}
								</option>
							))}
						</select>
						<ChevronDown size={14} />
					</label>
					<label className="form-label form-spaced">CHANGE TYPE</label>
					<div className="change-type-grid">
						<button
							className="change-type selected"
							onClick={() => setSimulated(false)}
						>
							<Braces size={16} />
							<b>Refactor</b>
							<small>Restructure without behavior changes</small>
						</button>
						<button
							className="change-type"
							onClick={() =>
								notify("Feature changes include sample API surface analysis")
							}
						>
							<Plus size={16} />
							<b>New feature</b>
							<small>Add or extend functionality</small>
						</button>
						<button
							className="change-type"
							onClick={() =>
								notify("Bug fix impact focuses on sample call sites")
							}
						>
							<Bug size={16} />
							<b>Bug fix</b>
							<small>Correct existing behavior</small>
						</button>
						<button
							className="change-type"
							onClick={() =>
								notify(
									"Dependency changes include sample package risk analysis",
								)
							}
						>
							<GitBranch size={16} />
							<b>Dependency</b>
							<small>Update an imported module</small>
						</button>
					</div>
					<label className="toggle-row">
						<span>
							<b>Include test coverage analysis</b>
							<small>Show tests that may need updating</small>
						</span>
						<button
							className={`toggle ${includeTests ? "on" : ""}`}
							onClick={() => setIncludeTests(!includeTests)}
							aria-label="Toggle test coverage"
						>
							<i />
						</button>
					</label>
					<button
						className="button-primary simulate-button"
						onClick={() => {
							setSimulated(true);
							notify(
								"Impact simulation complete · predicted values are illustrative",
							);
						}}
					>
						<Play size={14} fill="currentColor" />
						Simulate impact <ArrowRight size={14} />
					</button>
					<div className="simulation-note">
						<LockKeyhole size={12} />
						No source files are modified by this simulation.
					</div>
				</section>
				<section className="panel impact-results">
					<div className="impact-result-head">
						<div>
							<span className="eyebrow">BLAST RADIUS · SAMPLE MODEL</span>
							<h2>{simulated ? "Simulation results" : "Ready to simulate"}</h2>
						</div>
						<span className={`impact-status ${simulated ? "complete" : ""}`}>
							<i />
							{simulated ? "JUST NOW" : "AWAITING INPUT"}
						</span>
					</div>
					<div className="impact-file">
						<span className="impact-file-icon">
							<FileCode2 size={16} />
						</span>
						<span>
							<b>{target.split("/").slice(-1)[0]}</b>
							<small>{target}</small>
						</span>
						<span
							className={`debt-badge ${files.find((file) => file.path === target)?.debt.toLowerCase()}`}
						>
							{files.find((file) => file.path === target)?.debt} debt
						</span>
					</div>
					<div className="impact-counts">
						{[
							[
								GitFork,
								simulated ? String(prediction.directFiles) : "—",
								"DIRECT",
							],
							[
								Network,
								simulated ? String(prediction.indirectFiles) : "—",
								"INDIRECT",
							],
							[
								GitPullRequest,
								simulated ? String(prediction.apiPaths) : "—",
								"API PATHS",
							],
							[
								Bug,
								simulated && includeTests
									? String(prediction.affectedTests)
									: "—",
								"TESTS",
							],
						].map(([Icon, value, label]) => (
							<div key={String(label)}>
								<Icon size={14} />
								<b>{value as string}</b>
								<span>{label as string}</span>
							</div>
						))}
					</div>
					<div className="impact-score">
						<div className="impact-score-ring">
							<b>{simulated ? (targetIssues.length ? "72" : "91") : "—"}</b>
							<small>/100</small>
						</div>
						<span>
							<b>{simulated ? "Moderate impact" : "Impact score"}</b>
							<small>
								{simulated
									? "Architecture impact · High · verify affected callers"
									: "Run a simulation to see its modelled risk score"}
							</small>
						</span>
					</div>
					{simulated && (
						<div className="impact-predicted-mini">
							<div>
								<span>TECHNICAL DEBT</span>
								<b>
									{prediction.debtBefore} <ArrowRight size={11} />{" "}
									{prediction.debtAfter}
								</b>
							</div>
							<div>
								<span>ARCHITECTURE RISK</span>
								<b>
									{prediction.architectureBefore} <ArrowRight size={11} />{" "}
									{prediction.architectureAfter}
								</b>
							</div>
							<div>
								<span>COMPLEXITY</span>
								<b>
									{prediction.complexityBefore} <ArrowRight size={11} />{" "}
									{prediction.complexityAfter}
								</b>
							</div>
						</div>
					)}
					<div className="impact-breakdown">
						{[
							[
								GitFork,
								"Affected modules",
								simulated ? "17" : "—",
								"4 direct · 13 indirect",
							],
							[
								Bug,
								"Potentially impacted tests",
								simulated && includeTests ? "7" : "—",
								"Estimated from sample import graph",
							],
							[
								ShieldAlert,
								"Related open issues",
								simulated ? String(targetIssues.length || 1) : "—",
								"Existing findings in this area",
							],
						].map(([Icon, label, value, description], index) => (
							<div className="impact-breakdown-row" key={String(label)}>
								<span className={`impact-break-icon tone-${index}`}>
									<Icon size={15} />
								</span>
								<span>
									<b>{label as string}</b>
									<small>{description as string}</small>
								</span>
								<strong>{value as string}</strong>
							</div>
						))}
					</div>
					<div className="impact-connected">
						<span className="inspector-section-label">
							DEPENDENCY PATH · SAMPLE
						</span>
						<div className="impact-path">
							<b>{target.split("/").slice(-1)[0]}</b>
							<ArrowDownRight size={13} />
							{relatedFiles.map((file) => (
								<span key={file}>{file}</span>
							))}
						</div>
					</div>
					<div className="impact-result-actions">
						<button
							className="text-action"
							onClick={() =>
								notify(
									"Sample dependency path is highlighted in the codebase twin",
								)
							}
						>
							View dependency graph <ArrowRight size={13} />
						</button>
						{simulated && (
							<button
								className="button-secondary"
								onClick={() => setDiffOpen(true)}
							>
								Preview diff
							</button>
						)}
					</div>
				</section>
			</div>
			{simulated && (
				<section className="panel impact-prediction">
					<div>
						<span className="eyebrow">PREDICTED OUTCOME · SIMULATED</span>
						<h2>
							{proposal ||
								"Extract checkout validation into a dedicated service"}
						</h2>
						<p>
							{prediction.effort} · Estimates are not guarantees. Risks:{" "}
							{prediction.risks.join(" · ")}
						</p>
					</div>
					<div className="prediction-values">
						{[
							["Technical debt", prediction.debtBefore, prediction.debtAfter],
							[
								"Architecture risk",
								prediction.architectureBefore,
								prediction.architectureAfter,
							],
							[
								"Complexity",
								prediction.complexityBefore,
								prediction.complexityAfter,
							],
						].map(([label, before, after]) => (
							<div key={String(label)}>
								<span>{label}</span>
								<b>
									{before} <ArrowRight size={12} /> <strong>{after}</strong>
								</b>
							</div>
						))}
					</div>
					<button
						className="button-secondary"
						onClick={() => setDiffOpen(true)}
					>
						Generate refactor preview <ArrowRight size={13} />
					</button>
				</section>
			)}
			{diffOpen && <DiffDialog onClose={() => setDiffOpen(false)} />}
			<div className="demo-footnote">
				<LockKeyhole size={12} />
				Predicted values and dependency paths are simulated from illustrative
				repository data
			</div>
		</>
	);
}

export function Insights({
	notify,
	onCreateBranch,
}: {
	notify: (message: string) => void;
	onCreateBranch: () => void;
}) {
	const [applied, setApplied] = useState<string[]>([]);
	const [ignored, setIgnored] = useState<string[]>([]);
	const [diffOpen, setDiffOpen] = useState(false);
	const recommendations = [
		{
			id: "extract-validation",
			icon: Braces,
			label: "REFACTORING OPPORTUNITY",
			title: "Extract checkout validation",
			text: "Move promo code, address, and payment checks into focused validators. This would reduce processCheckout complexity from 18 to an estimated 9.",
			impact: "−2.5 hrs debt",
			confidence: "94% confidence",
			color: "lime",
			files: "src/services/checkout.ts · src/utils/validate.ts",
		},
		{
			id: "break-cycle",
			icon: GitFork,
			label: "ARCHITECTURE",
			title: "Break the cart ↔ checkout cycle",
			text: "Move shared cart types into a neutral module and replace the barrel import in useCart. 7 downstream modules will benefit.",
			impact: "−1.8 hrs debt",
			confidence: "87% confidence",
			color: "violet",
			files: "src/hooks/useCart.ts · src/stores/cart.ts",
		},
		{
			id: "token-compare",
			icon: ShieldAlert,
			label: "SECURITY IMPROVEMENT",
			title: "Use constant-time token comparison",
			text: "The session token is compared as a regular string. A constant-time comparison avoids leaking timing information.",
			impact: "Risk reduction",
			confidence: "91% confidence",
			color: "orange",
			files: "src/api/session.ts",
		},
	];
	return (
		<>
			<PageHeading
				eyebrow="CODECUT INTELLIGENCE"
				title="AI insights"
				subtitle="Thoughtful, actionable recommendations grounded in your codebase."
				action={
					<button
						className="button-secondary"
						onClick={() => notify("Recommendations are up to date")}
					>
						<Sparkles size={15} />
						Refresh insights
					</button>
				}
			/>
			<div className="insights-banner">
				<div className="insights-banner-icon">
					<WandSparkles size={19} />
				</div>
				<div>
					<b>Your codebase has room to get healthier.</b>
					<p>
						3 recommendations · 4.3 hours of estimated debt reduction ·
						Generated from your latest sample scan
					</p>
				</div>
				<span className="banner-confidence">
					<span className="live-dot" />
					PERSONALIZED
				</span>
			</div>
			<div className="insights-content">
				<div className="insight-feed">
					<div className="insight-feed-head">
						<SectionTitle
							title="Recommended for you"
							detail="Ranked by impact and confidence"
						/>
						<button
							className="filter-select"
							onClick={() => {
								setIgnored([]);
								notify("All recommendations restored");
							}}
						>
							<ListFilter size={14} />
							{ignored.length ? "Restore dismissed" : "All recommendations"}
							<ChevronDown size={13} />
						</button>
					</div>
					{recommendations
						.filter((item) => !ignored.includes(item.id))
						.map((item) => {
							const Icon = item.icon;
							const done = applied.includes(item.id);
							return (
								<article
									className={`panel recommendation ${done ? "recommendation-done" : ""}`}
									key={item.id}
								>
									<div className={`recommendation-icon ${item.color}`}>
										<Icon size={17} />
									</div>
									<div className="recommendation-main">
										<div className="recommendation-label">
											{item.label}
											<span>·</span>
											{item.confidence}
										</div>
										<h3>
											{item.title}
											{done && (
												<span className="applied-chip">
													<Check size={11} />
													Branch ready
												</span>
											)}
										</h3>
										<p>{item.text}</p>
										<div className="recommendation-file">
											<FileCode2 size={13} />
											{item.files}
										</div>
										<div className="recommendation-footer">
											<span className="impact-chip">
												<ArrowDownRight size={13} />
												{item.impact}
											</span>
											<div>
												<button
													className="button-secondary"
													onClick={() =>
														notify(`Opened ${item.files.split(" · ")[0]}`)
													}
												>
													View code
												</button>
												<button
													className="button-secondary"
													onClick={() =>
														notify(
															"Simulation complete · predicted debt reduction 2.5h",
														)
													}
												>
													Simulate
												</button>
												<button
													className="button-secondary"
													onClick={() => setDiffOpen(true)}
												>
													Preview diff
												</button>
												<button
													className="button-secondary"
													onClick={() => setIgnored([...ignored, item.id])}
												>
													Ignore
												</button>
												<button
													className={`button-primary ${done ? "applied-button" : ""}`}
													disabled={done}
													onClick={() => {
														onCreateBranch();
														setApplied([...applied, item.id]);
													}}
												>
													{done ? (
														<>
															<Check size={14} />
															Branch ready
														</>
													) : (
														<>Create branch</>
													)}
												</button>
											</div>
										</div>
									</div>
								</article>
							);
						})}
				</div>
				<aside className="panel insight-sidebar">
					<span className="insight-sidebar-icon">
						<Activity size={16} />
					</span>
					<h3>AI confidence</h3>
					<p>Every insight is backed by static analysis of your repository.</p>
					<div className="confidence-row">
						<span>Code understanding</span>
						<b>96%</b>
					</div>
					<div className="confidence-track">
						<i style={{ width: "96%" }} />
					</div>
					<div className="confidence-row">
						<span>Impact prediction</span>
						<b>89%</b>
					</div>
					<div className="confidence-track purple-track">
						<i style={{ width: "89%" }} />
					</div>
					<div className="insight-source">
						<LockKeyhole size={12} />
						Your source code stays private. Recommendations are based on local
						analysis results.
					</div>
					<div className="insight-sidebar-footer">
						<span>Last updated</span>
						<b>12 minutes ago</b>
					</div>
				</aside>
			</div>
			<div className="demo-footnote">
				<LockKeyhole size={12} />
				AI recommendations are illustrative and based on sample repository data
			</div>
			{diffOpen && <DiffDialog onClose={() => setDiffOpen(false)} />}
		</>
	);
}

function RootCauses({ onOpenIssue }: { onOpenIssue: (issue: Issue) => void }) {
	const [expanded, setExpanded] = useState<string | null>(rootCauses[0].id);
	return (
		<>
			<PageHeading
				eyebrow="DIAGNOSE · ROOT CAUSE ENGINE"
				title="Symptoms to causes"
				subtitle="Group individual findings into the engineering patterns driving risk."
				action={
					<span className="demo-tag">
						<span className="live-dot" />
						DEMO ANALYSIS
					</span>
				}
			/>
			<div className="rootcause-summary">
				<b>
					6 <small>findings</small>
				</b>
				<ArrowRight size={17} />
				<b>
					3 <small>root causes</small>
				</b>
				<span>Grouped from the same sample issue set shown in Issues</span>
			</div>
			<div className="rootcause-list">
				{rootCauses.map((cause, index) => {
					const isOpen = expanded === cause.id;
					return (
						<section
							className={`panel rootcause-card ${isOpen ? "rootcause-open" : ""}`}
							key={cause.id}
						>
							<button
								className="rootcause-head"
								onClick={() => setExpanded(isOpen ? null : cause.id)}
							>
								<span
									className={`rootcause-number ${index === 0 ? "critical" : ""}`}
								>
									0{index + 1}
								</span>
								<span className="rootcause-main">
									<span className="rootcause-kicker">
										ROOT CAUSE · {cause.severity.toUpperCase()}
									</span>
									<b>{cause.title}</b>
									<small>{cause.summary}</small>
								</span>
								<span className="rootcause-issue-count">
									{cause.issueIds.length} issues
								</span>
								<ChevronDown size={16} className={isOpen ? "rotate" : ""} />
							</button>
							{isOpen && (
								<div className="rootcause-detail">
									<div className="evidence-grid">
										{cause.evidence.map((evidence) => (
											<div key={evidence}>
												<span className="live-dot" />
												<b>{evidence}</b>
											</div>
										))}
									</div>
									<div className="rootcause-stats">
										<span>
											<b>{cause.issueIds.length}</b> affected issues
										</span>
										<span>
											<b>{cause.files.length}</b> affected files
										</span>
										<span>
											<b>{cause.debtHours}h</b> potential debt reduction
										</span>
									</div>
									<div className="rootcause-columns">
										<div>
											<span className="inspector-section-label">
												CONNECTED ISSUES
											</span>
											{cause.issueIds.map((id) => {
												const issue = issues.find((item) => item.id === id);
												return issue ? (
													<button
														className="cause-issue"
														key={id}
														onClick={() => onOpenIssue(issue)}
													>
														<i
															className={`severity-dot ${issue.severity.toLowerCase()}`}
														/>
														<span>
															<b>{issue.title}</b>
															<small>
																{issue.id} · {issue.file}:{issue.line}
															</small>
														</span>
														<ArrowRight size={14} />
													</button>
												) : null;
											})}
										</div>
										<div>
											<span className="inspector-section-label">
												AFFECTED FILES
											</span>
											{cause.files.map((file) => (
												<div className="cause-file" key={file}>
													<FileCode2 size={14} />
													{file}
												</div>
											))}
											<button
												className="button-secondary"
												onClick={() => setExpanded(null)}
											>
												Mark cause reviewed
											</button>
										</div>
									</div>
								</div>
							)}
						</section>
					);
				})}
			</div>
			<div className="demo-footnote">
				<LockKeyhole size={12} />
				Root-cause groups are illustrative and derived from the sample issue set
			</div>
		</>
	);
}

function TimeMachine() {
	const [selectedId, setSelectedId] = useState("current");
	const selected =
		timeline.find((point) => point.id === selectedId) ??
		timeline[timeline.length - 1];
	const previous =
		timeline[
			Math.max(0, timeline.findIndex((point) => point.id === selectedId) - 1)
		];
	return (
		<>
			<PageHeading
				eyebrow="HISTORY · MODELLED FROM SAMPLE SCANS"
				title="Codebase time machine"
				subtitle="Trace how architecture and quality changed across recent sprints."
				action={
					<span className="demo-tag">
						<History size={12} />
						HISTORICAL SNAPSHOTS
					</span>
				}
			/>
			<section className="panel time-chart-panel">
				<div className="time-chart-heading">
					<SectionTitle
						title="Repository health timeline"
						detail="Select a sprint to inspect its snapshot"
					/>
					<div className="chart-legend">
						<span>
							<i className="legend-lime" />
							Quality
						</span>
						<span>
							<i className="legend-purple" />
							Architecture risk
						</span>
					</div>
				</div>
				<div className="time-line-chart">
					<div className="timeline-axis">
						<span>100</span>
						<span>75</span>
						<span>50</span>
						<span>25</span>
					</div>
					<div className="timeline-plot">
						<div className="timeline-gridline one" />
						<div className="timeline-gridline two" />
						<div className="timeline-gridline three" />
						<svg viewBox="0 0 600 180" preserveAspectRatio="none">
							<polyline
								points={timeline
									.map((point, i) => `${i * 150},${165 - point.quality * 1.45}`)
									.join(" ")}
								fill="none"
								stroke="#a3e635"
								strokeWidth="2.5"
								vectorEffect="non-scaling-stroke"
							/>
							<polyline
								points={timeline
									.map(
										(point, i) =>
											`${i * 150},${165 - point.architecture * 1.45}`,
									)
									.join(" ")}
								fill="none"
								stroke="#a58af1"
								strokeWidth="2.5"
								vectorEffect="non-scaling-stroke"
							/>
						</svg>
						{timeline.map((point, index) => (
							<button
								key={point.id}
								className={`timeline-point ${selectedId === point.id ? "selected" : ""}`}
								style={{
									left: `${index * 25}%`,
									top: `${100 - point.quality * 0.8}%`,
								}}
								onClick={() => setSelectedId(point.id)}
								aria-label={`View ${point.label}`}
							>
								<i />
								<span>{point.label}</span>
							</button>
						))}
					</div>
				</div>
			</section>
			<div className="time-snapshot-grid">
				<section className="panel snapshot-panel">
					<div className="snapshot-head">
						<div>
							<span className="eyebrow">
								{selected.date} · {selected.label.toUpperCase()}
							</span>
							<h2>{selected.event}</h2>
						</div>
						<span className="demo-tag">HISTORICAL SNAPSHOT</span>
					</div>
					<div className="snapshot-metrics">
						<div>
							<span>Technical debt</span>
							<b>
								{selected.debt}
								<small> hrs</small>
							</b>
							<i>
								{selected.debt - previous.debt > 0 ? "+" : ""}
								{selected.debt - previous.debt} vs prior sprint
							</i>
						</div>
						<div>
							<span>Architecture risk</span>
							<b>
								{selected.architecture}
								<small>/100</small>
							</b>
							<i>
								{selected.architecture - previous.architecture > 0 ? "+" : ""}
								{selected.architecture - previous.architecture} vs prior sprint
							</i>
						</div>
						<div>
							<span>Code quality</span>
							<b>
								{selected.quality}
								<small>/100</small>
							</b>
							<i>
								{selected.quality - previous.quality > 0 ? "+" : ""}
								{selected.quality - previous.quality} vs prior sprint
							</i>
						</div>
					</div>
				</section>
				<section className="panel time-explanation">
					<span className="insight-sidebar-icon">
						<Sparkles size={16} />
					</span>
					<div>
						<span className="eyebrow">ARCHITECTURE EVENT</span>
						<h3>{selected.event}</h3>
						<p>
							{selected.id === "sprint-2"
								? "The largest risk increase in this sample followed the checkout rewrite: several services began depending directly on checkout internals. The snapshot suggests a coupling spike; it is not a live repository measurement."
								: selected.id === "current"
									? "Current sample metrics reflect the latest demo scan. Use the sprint markers to compare prior snapshots and spot potential changes in risk."
									: "This historical sample shows incremental changes in debt, architecture risk, and quality. Select another sprint to compare its snapshot."}
						</p>
					</div>
				</section>
			</div>
			<section className="panel trajectory-panel">
				<div>
					<span className="eyebrow">RISK TRAJECTORY · MODEL PROJECTION</span>
					<h2>
						Current risk <b>{selected.risk}</b>
						<span> · threshold 85</span>
					</h2>
					<p>
						Based on the sample trend, risk may approach the configured
						threshold in 3 sprints. This is a model projection, not a guarantee.
					</p>
				</div>
				<div className="trajectory-chart">
					<svg
						viewBox="0 0 420 95"
						preserveAspectRatio="none"
						aria-label="Historical risk and projected risk"
					>
						<line x1="0" y1="26" x2="420" y2="26" className="threshold-line" />
						<polyline
							points={timeline
								.map(
									(point, index) => `${index * 85},${90 - point.risk * 0.72}`,
								)
								.join(" ")}
							className="risk-history-line"
						/>
						<polyline
							points="340,37 380,25 420,10"
							className="risk-projection-line"
						/>
						<circle cx="340" cy="37" r="4" className="risk-current-point" />
						<circle cx="380" cy="25" r="3" className="risk-projected-point" />
						<circle cx="420" cy="10" r="3" className="risk-projected-point" />
					</svg>
					<div className="trajectory-labels">
						<span>Past · sample scans</span>
						<span>Projected · illustrative</span>
					</div>
				</div>
			</section>
			<div className="demo-footnote">
				<LockKeyhole size={12} />
				Timeline uses illustrative snapshots, not live Git history
			</div>
		</>
	);
}

function CodebaseDNA() {
	const points = dnaDimensions
		.map((dimension, index) => {
			const angle = (Math.PI * 2 * index) / dnaDimensions.length - Math.PI / 2;
			const radius = (98 * dimension.value) / 100;
			return `${140 + Math.cos(angle) * radius},${140 + Math.sin(angle) * radius}`;
		})
		.join(" ");
	return (
		<>
			<PageHeading
				eyebrow="CODEBASE PROFILE"
				title="Codebase DNA"
				subtitle="A multi-dimensional fingerprint of engineering health and change behavior."
				action={
					<span className="demo-tag">
						<Radar size={12} />
						ILLUSTRATIVE PROFILE
					</span>
				}
			/>
			<div className="dna-layout">
				<section className="panel dna-radar-panel">
					<SectionTitle
						title="Engineering profile"
						detail="Higher is more pronounced · test health is inverse risk"
					/>
					<div className="dna-visual">
						<svg
							viewBox="0 0 280 280"
							role="img"
							aria-label="Radar chart of codebase dimensions"
						>
							<polygon
								points="140,42 209,71 238,140 209,209 140,238 71,209 42,140 71,71"
								className="dna-ring"
							/>
							<polygon
								points="140,66 192,88 214,140 192,192 140,214 88,192 66,140 88,88"
								className="dna-ring"
							/>
							<polygon
								points="140,91 175,105 189,140 175,175 140,189 105,175 91,140 105,105"
								className="dna-ring"
							/>
							<polygon
								points="140,140 140,42 140,140 209,71 140,140 238,140 140,140 209,209 140,140 140,238 140,140 71,209 140,140 42,140 140,140 71,71"
								className="dna-spokes"
							/>
							<polygon points={points} className="dna-shape" />
							{dnaDimensions.map((item, index) => {
								const angle =
									(Math.PI * 2 * index) / dnaDimensions.length - Math.PI / 2;
								return (
									<circle
										key={item.label}
										cx={140 + (Math.cos(angle) * 98 * item.value) / 100}
										cy={140 + (Math.sin(angle) * 98 * item.value) / 100}
										r="3.5"
										fill={item.color}
									/>
								);
							})}
						</svg>
					</div>
					<div className="dna-foot">
						<span>
							<i className="live-dot" />
							Current profile
						</span>
						<span>
							vs 30-day sample baseline <b>+4.8%</b>
						</span>
					</div>
				</section>
				<section className="panel dna-dimensions">
					<SectionTitle title="Dimensions" detail="Score out of 100" />
					<div className="dna-list">
						{dnaDimensions.map((item) => (
							<div className="dna-row" key={item.label}>
								<span className="dna-name">
									<i style={{ background: item.color }} />
									{item.label}
								</span>
								<div className="dna-track">
									<i
										style={{ width: `${item.value}%`, background: item.color }}
									/>
								</div>
								<b>{item.value}</b>
								<span className="dna-delta">
									{item.value > 70 ? "↑" : "→"}{" "}
									{item.value > 70 ? "3.2" : "0.8"}
								</span>
							</div>
						))}
					</div>
					<div className="dna-insight">
						<Sparkles size={15} />
						<span>
							<b>Pattern detected</b>
							<small>
								Complexity and architecture risk are elevated together. Checkout
								is the strongest contributor in this sample.
							</small>
						</span>
					</div>
				</section>
			</div>
			<div className="demo-footnote">
				<LockKeyhole size={12} />
				Profile values are illustrative; they do not represent a live repository
				scan
			</div>
		</>
	);
}

function PreCommit({
	notify,
	onCreateBranch,
}: {
	notify: (message: string) => void;
	onCreateBranch: () => void;
}) {
	const [compared, setCompared] = useState(false);
	const [branchCreated, setBranchCreated] = useState(false);
	const prediction = simulateSampleChange("src/services/checkout.ts", true);
	return (
		<>
			<PageHeading
				eyebrow="SHIP WITH CONFIDENCE"
				title="Pre-commit intelligence"
				subtitle="Compare a proposed change with the current sample baseline before you branch."
				action={
					<span className="demo-tag">
						<GitCompareArrows size={12} />
						SIMULATED CHANGESET
					</span>
				}
			/>
			<section className="panel precommit-config">
				<div>
					<span className="eyebrow">PROPOSED CHANGE</span>
					<h2>Extract checkout validation into a dedicated service</h2>
					<p>
						Target: <code>src/services/checkout.ts</code> · Refactor · No source
						files will be modified
					</p>
				</div>
				<button
					className="button-primary"
					onClick={() => {
						setCompared(true);
						setBranchCreated(false);
						notify("Before/after comparison is ready");
					}}
				>
					<GitCompareArrows size={14} />
					Compare change
				</button>
			</section>
			<div className="before-after">
				<section className="panel compare-panel">
					<div className="compare-heading">
						<span className="compare-dot before" />
						CURRENT STATE <span className="eyebrow">BASELINE</span>
					</div>
					<CompareMetric
						label="Technical debt"
						before={`${repositoryMetrics.technicalDebtHours} hrs`}
						after={`${repositoryMetrics.technicalDebtHours} hrs`}
					/>
					<CompareMetric
						label="Architecture risk"
						before={String(repositoryMetrics.architectureRisk)}
						after={String(repositoryMetrics.architectureRisk)}
					/>
					<CompareMetric
						label="Complexity"
						before={String(repositoryMetrics.complexity)}
						after={String(repositoryMetrics.complexity)}
					/>
					<CompareMetric
						label="Test coverage"
						before={`${repositoryMetrics.testCoverage}%`}
						after={`${repositoryMetrics.testCoverage}%`}
					/>
				</section>
				<div className="compare-arrow">
					<ArrowRight size={18} />
				</div>
				<section
					className={`panel compare-panel ${compared ? "predicted-panel" : ""}`}
				>
					<div className="compare-heading">
						<span className="compare-dot after" />
						{compared ? "PREDICTED STATE" : "PROJECTION"}{" "}
						<span className="eyebrow">SIMULATED</span>
					</div>
					<CompareMetric
						label="Technical debt"
						before={`${prediction.debtBefore} hrs`}
						after={compared ? `${prediction.debtAfter} hrs` : "—"}
						improved={compared}
					/>
					<CompareMetric
						label="Architecture risk"
						before={String(prediction.architectureBefore)}
						after={compared ? String(prediction.architectureAfter) : "—"}
						improved={compared}
					/>
					<CompareMetric
						label="Complexity"
						before={String(prediction.complexityBefore)}
						after={compared ? String(prediction.complexityAfter) : "—"}
						improved={compared}
					/>
					<CompareMetric
						label="Test coverage"
						before={`${repositoryMetrics.testCoverage}%`}
						after={compared ? "81%" : "—"}
						improved={compared}
					/>
				</section>
			</div>
			<div className="precommit-bottom">
				<section className="panel precommit-findings">
					<SectionTitle
						title="Change consequences"
						detail={
							compared
								? "Predicted from the demo dependency model"
								: "Run comparison to see predicted outcomes"
						}
					/>
					{(compared
						? [
								["✓", "4 issues resolved", "green"],
								["⚠", "2 new risks introduced", "amber"],
								["✓", "1 dependency cycle removed", "green"],
							]
						: [
								["·", "Issue changes will appear here", "muted"],
								["·", "Dependency changes will appear here", "muted"],
								["·", "Affected tests will appear here", "muted"],
							]
					).map(([icon, label, tone]) => (
						<div className={`consequence-row ${tone}`} key={label}>
							<b>{icon}</b>
							<span>{label}</span>
						</div>
					))}
					{compared && (
						<p className="tradeoff-note">
							<Sparkles size={14} />
							Extracting validation reduces branching and coupling in checkout.
							Predicted improvements are modelled estimates, not guarantees.
						</p>
					)}
				</section>
				<section className="panel precommit-branch">
					<span className="inspector-section-label">NEXT STEP</span>
					<h3>
						{branchCreated ? "Branch prepared" : "Review the simulated change"}
					</h3>
					<p>
						{branchCreated
							? "logicloom/refactor/checkout-validation · demo only"
							: "No source code is changed by this demo flow. Branch creation is a local confirmation only."}
					</p>
					<button
						className="button-secondary"
						onClick={() =>
							notify("Diff preview: checkout validation extraction")
						}
					>
						Preview diff
					</button>
					<button
						className="button-primary"
						disabled={!compared || branchCreated}
						onClick={() => {
							setBranchCreated(true);
							onCreateBranch();
						}}
					>
						<GitBranch size={14} />
						{branchCreated ? "Branch ready" : "Create demo branch"}
					</button>
				</section>
			</div>
			<div className="demo-footnote">
				<LockKeyhole size={12} />
				All before/after values are simulated predictions from demo data
			</div>
		</>
	);
}

function CompareMetric({
	label,
	before,
	after,
	improved = false,
}: {
	label: string;
	before: string;
	after: string;
	improved?: boolean;
}) {
	return (
		<div className="compare-metric">
			<span>{label}</span>
			<b>{before}</b>
			<ArrowRight size={13} />
			<strong className={improved ? "metric-improved" : ""}>{after}</strong>
			<i>{improved ? "improved" : " "}</i>
		</div>
	);
}

function CommandPalette({
	query,
	setQuery,
	onClose,
	onRun,
	hasLiveAnalysis,
}: {
	query: string;
	setQuery: (query: string) => void;
	onClose: () => void;
	onRun: (label: string, target: Page) => void;
	hasLiveAnalysis: boolean;
}) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const commands: { label: string; description: string; target: Page }[] = [
		{
			label: "Show me the riskiest module",
			description: "Open the analyzed architecture graph",
			target: "Architecture",
		},
		{
			label: "Why is checkout risky?",
			description: hasLiveAnalysis
				? "Ask the configured AI with current analysis evidence"
				: "Connect a repository to ask this question",
			target: "AI insights",
		},
		{
			label: "Simulate removing auth dependency",
			description: "Open the impact simulator",
			target: "Change impact",
		},
		{
			label: "Find duplicated code",
			description: "Filter to duplication findings",
			target: "Issues",
		},
		{
			label: "Generate a refactoring plan",
			description: "Review AI recommendations",
			target: "AI insights",
		},
	];
	const matches = commands.filter((item) =>
		`${item.label} ${item.description}`
			.toLowerCase()
			.includes(query.toLowerCase()),
	);
	return (
		<div
			className="modal-backdrop command-backdrop"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<section
				className="command-palette"
				role="dialog"
				aria-modal="true"
				aria-label="Ask Logicloom"
			>
				<div className="command-input">
					<Sparkles size={17} />
					<input
						autoFocus
						value={query}
						onChange={(event) => {
							setQuery(event.target.value);
							setSelectedIndex(0);
						}}
						onKeyDown={(event) => {
							if (event.key === "ArrowDown") {
								event.preventDefault();
								setSelectedIndex((index) =>
									Math.min(index + 1, matches.length - 1),
								);
							} else if (event.key === "ArrowUp") {
								event.preventDefault();
								setSelectedIndex((index) => Math.max(index - 1, 0));
							} else if (event.key === "Enter" && matches[selectedIndex]) {
								onRun(
									matches[selectedIndex].label,
									matches[selectedIndex].target,
								);
							}
						}}
						placeholder="Ask about your codebase or jump to a view…"
					/>
					<kbd>ESC</kbd>
					<button onClick={onClose} aria-label="Close command center">
						<X size={16} />
					</button>
				</div>
				<div className="command-group-label">
					{query ? "SUGGESTED ACTIONS" : "ASK LOGICLOOM · SUGGESTED"}
				</div>
				{matches.length ? (
					matches.map((item, index) => (
						<button
							key={item.label}
							className={`command-result ${selectedIndex === index ? "command-highlighted" : ""}`}
							onMouseEnter={() => setSelectedIndex(index)}
							onClick={() => onRun(item.label, item.target)}
						>
							<span className="command-result-icon">
								{index === 0 ? <Search size={15} /> : <ArrowRight size={15} />}
							</span>
							<span>
								<b>{item.label}</b>
								<small>{item.description}</small>
							</span>
							<kbd>↵</kbd>
						</button>
					))
				) : (
					<div className="command-empty">
						No matching actions. Try “checkout risk” or “time machine”.
					</div>
				)}
				<div className="command-footer">
					<span>
						<kbd>↑</kbd>
						<kbd>↓</kbd> to navigate
					</span>
					<span>
						<kbd>↵</kbd> to open <b>·</b> Mock repository context only
					</span>
				</div>
			</section>
		</div>
	);
}

function DiffDialog({ onClose }: { onClose: () => void }) {
	return (
		<div
			className="modal-backdrop"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<section
				className="diff-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="diff-title"
			>
				<div className="dialog-head">
					<span className="dialog-ai-icon">
						<GitCompareArrows size={16} />
					</span>
					<div>
						<span className="eyebrow">PREVIEW · NO FILES MODIFIED</span>
						<h2 id="diff-title">Extract checkout validation</h2>
					</div>
					<button
						className="icon-button"
						onClick={onClose}
						aria-label="Close diff preview"
					>
						<X size={17} />
					</button>
				</div>
				<div className="diff-meta">
					<FileCode2 size={14} />
					src/services/checkout.ts <span>·</span>Illustrative refactor preview{" "}
					<span className="confidence-badge">94% confidence</span>
				</div>
				<div className="diff-columns">
					<div>
						<h3>
							<i className="diff-minus" />
							Before
						</h3>
						<pre>{refactorDiff.before}</pre>
					</div>
					<div>
						<h3>
							<i className="diff-plus" />
							Proposed
						</h3>
						<pre>{refactorDiff.after}</pre>
					</div>
				</div>
				<div className="diff-dialog-foot">
					<span>
						<LockKeyhole size={12} />
						Preview is illustrative; it does not patch source files.
					</span>
					<button className="button-primary" onClick={onClose}>
						Continue review <ArrowRight size={13} />
					</button>
				</div>
			</section>
		</div>
	);
}

export default App;
