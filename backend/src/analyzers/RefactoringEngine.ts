export type DetectedLanguage = "Python" | "JavaScript" | "TypeScript";

export type ComplexityMetrics = {
	linesOfCode: number;
	functions: number;
	cyclomaticComplexity: number;
	maximumFunctionComplexity: number;
	loops: number;
	conditionals: number;
	maximumNestingDepth: number;
};

export type RefactoringIssue = {
	severity: "high" | "medium" | "low";
	type: string;
	line: number;
	description: string;
	suggestion: string;
};

export type RefactoringChange = { change: string; reason: string };

export type RefactoringResult = {
	languageDetected: DetectedLanguage;
	issuesFound: RefactoringIssue[];
	originalComplexity: ComplexityMetrics;
	enhancedCode: string;
	changesMade: RefactoringChange[];
	enhancedComplexity: ComplexityMetrics;
	beforeVsAfter: Array<{ metric: string; before: number; after: number }>;
	complexityExplanation: string;
	overallAnalysis: string;
};

const lineNumber = (source: string, index: number): number =>
	source.slice(0, index).split(/\r?\n/).length;

export function detectLanguage(source: string): DetectedLanguage {
	if (
		/^\s*(?:def|async\s+def|from\s+\w+\s+import|import\s+\w+|class\s+\w+\s*\(?[^)]*\)?\s*:)/m.test(
			source,
		) ||
		/^\s*(?:elif|except|finally|with)\b[^\n]*:/m.test(source)
	)
		return "Python";
	if (
		/\b(?:interface|type)\s+[A-Z]\w*\s*[={<]|:\s*(?:string|number|boolean|unknown|void)\b|as\s+const\b/.test(
			source,
		)
	)
		return "TypeScript";
	return "JavaScript";
}

const stripCommentsAndStrings = (source: string): string =>
	source
		.replace(/\/\*[\s\S]*?\*\//g, " ")
		.replace(/\/\/.*$/gm, " ")
		.replace(/#.*$/gm, " ")
		.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g, " ");

function nestingDepth(source: string, language: DetectedLanguage): number {
	if (language === "Python") {
		return source.split(/\r?\n/).reduce((maximum, line) => {
			if (!line.trim() || line.trimStart().startsWith("#")) return maximum;
			return Math.max(
				maximum,
				Math.floor((line.length - line.trimStart().length) / 4) + 1,
			);
		}, 0);
	}
	let depth = 0;
	let maximum = 0;
	for (const character of stripCommentsAndStrings(source)) {
		if (character === "{") {
			depth += 1;
			maximum = Math.max(maximum, depth);
		}
		if (character === "}") depth = Math.max(0, depth - 1);
	}
	return maximum;
}

function flattenAdjacentGuards(
	source: string,
	language: DetectedLanguage,
): { code: string; count: number } {
	const lines = source.split(/\r?\n/);
	let count = 0;
	for (let index = 0; index < lines.length - 1; index += 1) {
		const outer =
			language === "Python"
				? /^(\s*)if\s+(.+):\s*$/.exec(lines[index])
				: /^(\s*)if\s*\((.+)\)\s*\{\s*$/.exec(lines[index]);
		const inner =
			language === "Python"
				? /^(\s+)if\s+(.+):\s*$/.exec(lines[index + 1])
				: /^(\s+)if\s*\((.+)\)\s*\{\s*$/.exec(lines[index + 1]);
		if (
			!outer ||
			!inner ||
			inner[1].length !== outer[1].length + (language === "Python" ? 4 : 2)
		)
			continue;
		if (language === "Python") {
			lines[index] = `${outer[1]}if ${outer[2]} and ${inner[2]}:`;
			lines.splice(index + 1, 1);
			for (let body = index + 1; body < lines.length; body += 1) {
				if (
					lines[body].trim() &&
					(lines[body].match(/^\s*/)?.[0]?.length ?? 0) <= inner[1].length
				)
					break;
				lines[body] = lines[body].replace(/^\s{4}/, "");
			}
		} else {
			lines[index] = `${outer[1]}if (${outer[2]} && ${inner[2]}) {`;
			lines.splice(index + 1, 1);
			let depth = 0;
			for (let body = index; body < lines.length; body += 1) {
				depth +=
					(lines[body].match(/\{/g) ?? []).length -
					(lines[body].match(/\}/g) ?? []).length;
				if (body > index && depth === 1 && /^\s*}\s*$/.test(lines[body])) {
					lines.splice(body, 1);
					break;
				}
			}
		}
		count += 1;
		index -= 1;
	}
	return { code: lines.join("\n"), count };
}

export function measureComplexity(
	source: string,
	language: DetectedLanguage,
): ComplexityMetrics {
	const sanitized = stripCommentsAndStrings(source);
	const linesOfCode = source
		.split(/\r?\n/)
		.filter(
			(line) =>
				line.trim() &&
				!line.trim().startsWith("//") &&
				!line.trim().startsWith("#"),
		).length;
	const functions =
		language === "Python"
			? (source.match(/^\s*(?:async\s+)?def\s+\w+\s*\(/gm) ?? []).length
			: (
					source.match(
						/\bfunction\b|\b(?:async\s+)?\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
					) ?? []
				).length;
	const loops = (
		sanitized.match(
			language === "Python" ? /\b(?:for|while)\b/g : /\b(?:for|while|do)\b/g,
		) ?? []
	).length;
	const conditionals = (
		sanitized.match(
			language === "Python"
				? /\b(?:if|elif|else)\b|\band\b|\bor\b/g
				: /\b(?:if|else\s+if|else|case|catch)\b|&&|\|\||\?/g,
		) ?? []
	).length;
	const cyclomaticComplexity = 1 + loops + conditionals;
	return {
		linesOfCode,
		functions,
		cyclomaticComplexity,
		maximumFunctionComplexity: functions
			? Math.max(1, cyclomaticComplexity - Math.max(0, functions - 1))
			: 0,
		loops,
		conditionals,
		maximumNestingDepth: nestingDepth(source, language),
	};
}

export function refactorSource(
	source: string,
	findings: Array<{ line: number; recommendation: string }> = [],
): RefactoringResult {
	const languageDetected = detectLanguage(source);
	const originalComplexity = measureComplexity(source, languageDetected);
	const issuesFound: RefactoringIssue[] = [];
	const changesMade: RefactoringChange[] = [];
	const sanitized = stripCommentsAndStrings(source);
	const addIssue = (
		severity: RefactoringIssue["severity"],
		type: string,
		index: number,
		description: string,
		suggestion: string,
	) => {
		issuesFound.push({
			severity,
			type,
			line: lineNumber(source, index),
			description,
			suggestion,
		});
	};

	const evalIndex =
		languageDetected === "Python"
			? sanitized.search(/\beval\s*\(/)
			: sanitized.search(/\beval\s*\(/);
	if (evalIndex >= 0) {
		addIssue(
			"high",
			"dynamic-evaluation",
			evalIndex,
			"Dynamic evaluation can execute untrusted input.",
			languageDetected === "Python"
				? "Use json.loads() for JSON data or an explicit parser."
				: "Use JSON.parse() for JSON data or an explicit parser.",
		);
	}
	const credentialMatch =
		/\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][A-Za-z0-9_./+=-]{16,}["']/i.exec(
			source,
		);
	if (credentialMatch?.index !== undefined)
		addIssue(
			"high",
			"hard-coded-credential",
			credentialMatch.index,
			"A credential-like value is embedded in source code.",
			"Read the value from the process environment or a secret manager.",
		);
	const broadExceptIndex =
		languageDetected === "Python" ? source.search(/^\s*except\s*:\s*$/m) : -1;
	if (broadExceptIndex >= 0)
		addIssue(
			"medium",
			"broad-exception",
			broadExceptIndex,
			"A bare except catches system-exiting and interruption exceptions as well as application errors.",
			"Catch Exception explicitly and handle the expected failure at the boundary.",
		);
	const rawHtmlMatch =
		languageDetected !== "Python"
			? /dangerouslySetInnerHTML\s*=/.exec(source)
			: null;
	if (rawHtmlMatch?.index !== undefined)
		addIssue(
			"high",
			"raw-html",
			rawHtmlMatch.index,
			"Raw HTML rendering can execute untrusted markup.",
			"Escape untrusted text before rendering or sanitize it with a trusted sanitizer.",
		);
	if (originalComplexity.cyclomaticComplexity > 10)
		addIssue(
			"medium",
			"complexity",
			0,
			`The source has ${originalComplexity.cyclomaticComplexity} decision paths.`,
			"Split decision-heavy logic into named functions.",
		);
	if (originalComplexity.maximumNestingDepth > 3)
		addIssue(
			"medium",
			"deep-nesting",
			0,
			`The deepest nesting level is ${originalComplexity.maximumNestingDepth}.`,
			"Use guard clauses or extract nested logic into helper functions.",
		);
	for (const finding of findings) {
		if (
			!issuesFound.some(
				(issue) =>
					issue.line === finding.line &&
					issue.suggestion === finding.recommendation,
			)
		) {
			issuesFound.push({
				severity: "low",
				type: "analyzer-finding",
				line: finding.line,
				description: finding.recommendation,
				suggestion: finding.recommendation,
			});
		}
	}

	let enhancedCode = source;
	if (evalIndex >= 0) {
		const replacement =
			languageDetected === "Python" ? "json.loads(" : "JSON.parse(";
		enhancedCode = enhancedCode.replace(/\beval\s*\(/g, replacement);
		if (
			languageDetected === "Python" &&
			!/^\s*(?:from\s+\S+\s+)?import\s+json\b/m.test(enhancedCode)
		)
			enhancedCode = `import json\n${enhancedCode}`;
		changesMade.push({
			change:
				languageDetected === "Python"
					? "Replaced eval() with json.loads()."
					: "Replaced eval() with JSON.parse().",
			reason:
				"Avoids executing arbitrary source text and uses a data parser for JSON input.",
		});
	}
	if (credentialMatch) {
		const environmentValue =
			languageDetected === "Python"
				? 'os.environ.get("LOGICLOOM_SECRET", "")'
				: 'process.env.LOGICLOOM_SECRET ?? ""';
		enhancedCode = enhancedCode.replace(
			/(\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*)["'][A-Za-z0-9_./+=-]{16,}["']/gi,
			`$1${environmentValue}`,
		);
		if (
			languageDetected === "Python" &&
			!/^\s*import\s+os\b/m.test(enhancedCode)
		)
			enhancedCode = `import os\n${enhancedCode}`;
		changesMade.push({
			change: "Moved the hard-coded credential to LOGICLOOM_SECRET.",
			reason: "Prevents secrets from being committed to source control.",
		});
	}
	if (broadExceptIndex >= 0) {
		enhancedCode = enhancedCode.replace(
			/^(\s*)except\s*:\s*$/gm,
			"$1except Exception:",
		);
		changesMade.push({
			change: "Replaced bare except with except Exception.",
			reason:
				"Keeps system exits and interrupts visible while still handling application exceptions.",
		});
	}
	if (rawHtmlMatch) {
		const expressionPattern =
			/dangerouslySetInnerHTML\s*=\s*\{\{\s*__html\s*:\s*([^}]+)\}\}/g;
		const escapedSource = `const logicloomEscapeHtml = (value${languageDetected === "TypeScript" ? ": unknown" : ""})${languageDetected === "TypeScript" ? ": string" : ""} => String(value).replace(/[&<>"']/g, (character) => character === '&' ? '&amp;' : character === '<' ? '&lt;' : character === '>' ? '&gt;' : character === '"' ? '&quot;' : '&#39;');`;
		const next = enhancedCode.replace(
			expressionPattern,
			(_match, expression: string) =>
				`dangerouslySetInnerHTML={{ __html: logicloomEscapeHtml(${expression.trim()}) }}`,
		);
		if (next !== enhancedCode) {
			enhancedCode = `${escapedSource}\n${next}`;
			changesMade.push({
				change: "Escaped raw HTML before rendering.",
				reason:
					"Prevents untrusted markup from being inserted into the document as executable HTML.",
			});
		}
	}
	if (originalComplexity.maximumNestingDepth >= 3) {
		const flattened = flattenAdjacentGuards(enhancedCode, languageDetected);
		if (flattened.count > 0 && flattened.code !== enhancedCode) {
			enhancedCode = flattened.code;
			changesMade.push({
				change: `Flattened ${flattened.count} adjacent nested guard${flattened.count === 1 ? "" : "s"}.`,
				reason:
					"Combines independent conditions to reduce nesting and make the main path easier to test.",
			});
		}
	}
	if (enhancedCode === source) {
		const marker =
			languageDetected === "Python"
				? "# Logicloom review completed; no safe automatic rewrite matched."
				: "// Logicloom review completed; no safe automatic rewrite matched.";
		enhancedCode = `${marker}\n${source}`;
		changesMade.push({
			change: "Added a language-native review marker.",
			reason:
				"Makes the reviewed output explicit without changing runtime behavior when no safe codemod applies.",
		});
	}
	const enhancedComplexity = measureComplexity(enhancedCode, languageDetected);
	const metricNames: Array<keyof ComplexityMetrics> = [
		"linesOfCode",
		"functions",
		"cyclomaticComplexity",
		"maximumFunctionComplexity",
		"loops",
		"conditionals",
		"maximumNestingDepth",
	];
	return {
		languageDetected,
		issuesFound,
		originalComplexity,
		enhancedCode,
		changesMade,
		enhancedComplexity,
		beforeVsAfter: metricNames.map((metric) => ({
			metric,
			before: originalComplexity[metric],
			after: enhancedComplexity[metric],
		})),
		complexityExplanation:
			"Metrics are deterministic source-level counts of non-empty code lines, function declarations, branch/loop operators, and maximum structural nesting. They are estimates, not compiler complexity data.",
		overallAnalysis: changesMade.length
			? `Detected ${languageDetected} and applied ${changesMade.length} language-safe refactoring change${changesMade.length === 1 ? "" : "s"}. Review the diff and run the language's test suite before merging.`
			: `Detected ${languageDetected}; no safe automatic rewrite was available.`,
	};
}
