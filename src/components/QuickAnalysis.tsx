import { useEffect, useRef, useState } from "react";
import Editor, { DiffEditor, type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import {
	Check,
	Clipboard,
	Code2,
	Copy,
	Eraser,
	Eye,
	LoaderCircle,
	RotateCcw,
	WandSparkles,
} from "lucide-react";
import { apiRequest } from "../services/api";
import "../quick-analysis.css";

type QuickLanguage = "javascript" | "typescript" | "python";
type QuickFinding = {
	id: string;
	severity: string;
	category: string;
	title: string;
	description: string;
	line: number;
	metric: Record<string, number | string>;
	recommendation: string;
	file?: { path: string };
};
type QuickResult = {
	metrics: Record<string, number>;
	issues: QuickFinding[];
	summary: { lines: number; language: string };
	reviewedCode: string | null;
};
type RefactoringResult = {
	languageDetected: string;
	enhancedCode: string;
	overallAnalysis: string;
	originalComplexity: {
		linesOfCode: number;
		cyclomaticComplexity: number;
		maximumNestingDepth: number;
	};
	enhancedComplexity: {
		linesOfCode: number;
		cyclomaticComplexity: number;
		maximumNestingDepth: number;
	};
};
const examples: Record<QuickLanguage, string> = {
	javascript: `function getUser(id, users) {
  if (id) {
    for (const user of users) {
      if (user.id === id && user.active) return user;
    }
  }
  return null;
}`,
	typescript: `export function validate(input: string, config: { strict?: boolean }) {
  if (!input) return false;
  if (config.strict && input.length < 8) return false;
  return input.includes("@") && input.includes(".");
}`,
	python: `def load_user(user_id, users):
    if user_id:
        for user in users:
            if user["id"] == user_id and user["active"]:
                return user
    return None`,
};

export default function QuickAnalysis() {
	const [language, setLanguage] = useState<QuickLanguage>("typescript");
	const [code, setCode] = useState("");
	const [result, setResult] = useState<QuickResult | null>(null);
	const [reviewedCode, setReviewedCode] = useState<string | null>(null);
	const [reviewOriginalCode, setReviewOriginalCode] = useState<string | null>(
		null,
	);
	const [selectedFinding, setSelectedFinding] = useState<QuickFinding | null>(
		null,
	);
	const [reviewOpen, setReviewOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

	const onMount: OnMount = (editor) => {
		editorRef.current = editor;
	};
	useEffect(() => {
		if (selectedFinding && editorRef.current) {
			editorRef.current.revealLineInCenter(selectedFinding.line);
			editorRef.current.setPosition({
				lineNumber: selectedFinding.line,
				column: 1,
			});
			editorRef.current.focus();
		}
	}, [selectedFinding]);

	const analyze = async () => {
		if (!code.trim()) {
			setError("Paste or write some code before analyzing.");
			return;
		}
		setBusy(true);
		setError("");
		setNotice("");
		setReviewOpen(false);
		setReviewedCode(null);
		setReviewOriginalCode(null);
		try {
			const next = await apiRequest<QuickResult>("/quick-analysis", {
				method: "POST",
				body: JSON.stringify({ language, code }),
			});
			setResult(next);
		} catch (reason) {
			setError(
				reason instanceof Error ? reason.message : "Quick Analysis failed.",
			);
		} finally {
			setBusy(false);
		}
	};
	const review = async () => {
		if (!result) return;
		setBusy(true);
		setError("");
		try {
			const response = await apiRequest<RefactoringResult>(
				"/quick-analysis/review",
				{
					method: "POST",
					body: JSON.stringify({ language, code, findings: result.issues }),
				},
			);
			setReviewOriginalCode(code);
			setReviewedCode(response.enhancedCode);
			setReviewOpen(true);
			setNotice(
				`${response.overallAnalysis} ${response.languageDetected}: complexity ${response.originalComplexity.cyclomaticComplexity} → ${response.enhancedComplexity.cyclomaticComplexity}; nesting ${response.originalComplexity.maximumNestingDepth} → ${response.enhancedComplexity.maximumNestingDepth}.`,
			);
		} catch (reason) {
			setError(
				reason instanceof Error
					? reason.message
					: "Could not generate a code review.",
			);
		} finally {
			setBusy(false);
		}
	};
	const clipboard = async (value: string, message: string) => {
		try {
			await navigator.clipboard.writeText(value);
			setNotice(message);
		} catch {
			setError(
				"Clipboard access is unavailable. Select the code and copy it manually.",
			);
		}
	};
	const clear = () => {
		setCode("");
		setResult(null);
		setReviewedCode(null);
		setReviewOriginalCode(null);
		setSelectedFinding(null);
		setReviewOpen(false);
		setError("");
		setNotice("");
	};
	const lines = code ? code.split(/\r?\n/).length : 0;
	const quality = result?.metrics.codeQuality ?? 0;

	return (
		<div className="quick-page">
			<div className="quick-heading">
				<div>
					<div className="eyebrow">QUICK ANALYSIS · INDEPENDENT MODE</div>
					<h1>Paste and inspect code</h1>
					<p>
						Run the same deterministic heuristics as repository analysis without
						GitHub or database persistence.
					</p>
				</div>
				<span className="quick-mode-badge">
					<Code2 size={14} /> Local snippet
				</span>
			</div>
			<section className="quick-editor-panel">
				<div className="quick-toolbar">
					<label>
						Language
						<select
							value={language}
							onChange={(event) =>
								setLanguage(event.target.value as QuickLanguage)
							}
						>
							<option value="typescript">TypeScript</option>
							<option value="javascript">JavaScript</option>
							<option value="python">Python</option>
						</select>
					</label>
					<button
						className="quick-tool"
						onClick={() => setCode(examples[language])}
					>
						<Eye size={14} />
						Example
					</button>
					<button
						className="quick-tool"
						onClick={() =>
							navigator.clipboard
								.readText()
								.then(setCode)
								.catch(() =>
									setError(
										"Clipboard access is unavailable. Paste manually into the editor.",
									),
								)
						}
					>
						<Clipboard size={14} />
						Paste
					</button>
					<button
						className="quick-tool"
						onClick={() => void clipboard(code, "Code copied")}
						disabled={!code}
					>
						<Copy size={14} />
						Copy
					</button>
					<span className="quick-toolbar-spacer" />
					<span className="quick-count">
						{lines} lines · {new Blob([code]).size.toLocaleString()} bytes
					</span>
					<button className="quick-tool" onClick={clear}>
						<Eraser size={14} />
						Clear
					</button>
					<button
						className="button-primary"
						onClick={() => void analyze()}
						disabled={busy}
					>
						{busy && !reviewOpen ? (
							<LoaderCircle className="spin" size={14} />
						) : (
							<WandSparkles size={14} />
						)}
						{busy && !reviewOpen ? "Analyzing…" : "Analyze code"}
					</button>
				</div>
				<div className="quick-editor">
					<Editor
						height="330px"
						language={language}
						theme="vs-dark"
						value={code}
						onChange={(value) => setCode(value ?? "")}
						onMount={onMount}
						options={{
							minimap: { enabled: false },
							fontSize: 13,
							padding: { top: 14 },
							wordWrap: "on",
							scrollBeyondLastLine: false,
						}}
					/>
				</div>
				<p className="quick-limit">
					Quick Analysis supports snippets up to 100,000 characters. Use
					Repository Analysis for larger codebases.
				</p>
			</section>
			{error && (
				<div className="quick-error" role="alert">
					{error}
				</div>
			)}
			{notice && (
				<div className="quick-notice">
					<Check size={14} />
					{notice}
				</div>
			)}
			{result && (
				<section className="quick-results">
					<div className="quick-results-head">
						<div>
							<div className="eyebrow">MEASURED RESULT</div>
							<h2>Analysis results</h2>
						</div>
						<button
							className="button-secondary"
							onClick={() => void review()}
							disabled={busy}
						>
							<WandSparkles size={14} />
							{busy ? "Reviewing…" : "Review code"}
						</button>
					</div>
					<div className="quick-metrics">
						<Metric label="Code quality" value={`${quality}`} />
						<Metric
							label="Complexity"
							value={`${result.metrics.complexity ?? 0}`}
						/>
						<Metric
							label="Maintainability"
							value={`${result.metrics.maintainability ?? 0}`}
						/>
						<Metric label="Issues" value={`${result.issues.length}`} />
						<Metric
							label="Lines"
							value={`${result.metrics.linesAnalyzed ?? result.summary.lines}`}
						/>
					</div>
					<div className="quick-findings">
						<h3>
							Findings <small>{result.issues.length} measured</small>
						</h3>
						{result.issues.length === 0 ? (
							<p className="quick-empty">
								No findings were detected by the active heuristics.
							</p>
						) : (
							result.issues.map((finding) => (
								<button
									className="quick-finding"
									key={finding.id}
									onClick={() => setSelectedFinding(finding)}
								>
									<span
										className={`finding-severity ${finding.severity.toLowerCase()}`}
									>
										{finding.severity}
									</span>
									<span>
										<b>{finding.title}</b>
										<small>
											Line {finding.line} ·{" "}
											{finding.metric.complexity
												? `Actual ${finding.metric.complexity}`
												: finding.category}
										</small>
										<em>{finding.description}</em>
									</span>
								</button>
							))
						)}
					</div>
				</section>
			)}
			{reviewOpen && reviewedCode !== null && reviewOriginalCode !== null && (
				<section className="quick-review">
					<div className="quick-results-head">
						<div>
							<div className="eyebrow">
								CORRECTED CODE · SIDE-BY-SIDE REVIEW
							</div>
							<h2>Original vs enhanced version</h2>
							<p className="quick-review-note">
								The left side is your pasted code. The right side is generated
								from the measured findings and can be applied only when you
								confirm.
							</p>
						</div>
						<div className="quick-review-actions">
							<button
								className="button-secondary"
								onClick={() =>
									void clipboard(reviewedCode, "Enhanced code copied")
								}
							>
								<Copy size={14} />
								Copy enhanced code
							</button>
							<button
								className="quick-tool"
								onClick={() => {
									setReviewOpen(false);
									setReviewedCode(null);
									setReviewOriginalCode(null);
									setNotice(
										"Review discarded; the original code is still in the editor.",
									);
								}}
							>
								<RotateCcw size={14} />
								Reset
							</button>
							<button
								className="button-primary"
								onClick={() => {
									setCode(reviewedCode);
									setReviewOpen(false);
									setReviewOriginalCode(null);
									setNotice(
										"Enhanced version applied to the editor. Your original code was not changed automatically.",
									);
								}}
							>
								<RotateCcw size={14} />
								Apply enhanced code
							</button>
						</div>
					</div>
					<div className="quick-diff-labels">
						<span>ORIGINAL · YOUR CODE</span>
						<span>ENHANCED · REVIEWED CODE</span>
					</div>
					<div className="quick-diff">
						<DiffEditor
							height="420px"
							language={language}
							theme="vs-dark"
							original={reviewOriginalCode}
							modified={reviewedCode}
							options={{
								readOnly: true,
								renderSideBySide: true,
								minimap: { enabled: false },
								fontSize: 12,
								wordWrap: "on",
								scrollBeyondLastLine: false,
								lineNumbers: "on",
							}}
						/>
					</div>
				</section>
			)}
		</div>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div className="quick-metric">
			<span>{label}</span>
			<b>{value}</b>
		</div>
	);
}
