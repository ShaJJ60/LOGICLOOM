export type ApiError = Error & { status?: number; code?: string };

export async function apiRequest<T>(
	path: string,
	init?: RequestInit,
): Promise<T> {
	let response: Response;
	try {
		const token =
			window.localStorage.getItem("logicloom-auth-token") ??
			window.sessionStorage.getItem("logicloom-auth-token");
		response = await fetch(`/api${path}`, {
			...init,
			headers: {
				"Content-Type": "application/json",
				...(token ? { Authorization: `Bearer ${token}` } : {}),
				...init?.headers,
			},
		});
	} catch {
		throw new Error(
			"Could not reach the Logicloom API. Start it with `npm run dev:all`.",
		);
	}
	const body = (await response.json().catch(() => ({}))) as {
		error?: { message?: string; code?: string };
	};
	if (!response.ok) {
		const error = new Error(
			body.error?.message ?? `Request failed with status ${response.status}.`,
		) as ApiError;
		error.status = response.status;
		error.code = body.error?.code;
		throw error;
	}
	return body as T;
}

export type ConnectedRepository = {
	id: string;
	fullName: string;
	htmlUrl: string;
	defaultBranch: string;
	branches: Array<{ id?: string; name: string; sha?: string }>;
};

export type AnalysisStatus = {
	id: string;
	status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
	stage: string;
	progress: number;
	error: string | null;
	commitSha: string;
	completedAt?: string | null;
	repository: { fullName: string; htmlUrl: string };
	branch: { name: string };
};

export type AnalysisSummary = {
	metrics: Record<string, number>;
	counts: { files: number; issues: number; dependencies: number };
	analysis: AnalysisStatus;
};

export type AnalysisIssue = {
	id: string;
	severity: string;
	category: string;
	title: string;
	description: string;
	line: number;
	metric?: Record<string, number | string>;
	impact?: string;
	estimatedEffort?: number;
	recommendation: string;
	status?: string;
	file: { path: string } | null;
};

export type AnalyzedFile = {
	id: string;
	path: string;
	language: string;
	lineCount: number;
	complexity: number;
	maintainability: number;
};
export type AnalyzedDependency = {
	id: string;
	circular: boolean;
	sourceFile: {
		id?: string;
		path: string;
		complexity?: number;
		maintainability?: number;
	};
	targetFile: {
		id?: string;
		path: string;
		complexity?: number;
		maintainability?: number;
	};
};
export type FileSource = AnalyzedFile & {
	content: string;
	issues: Array<{
		id: string;
		severity: string;
		category?: string;
		title: string;
		line: number;
		description?: string;
		impact?: string;
		estimatedEffort?: number;
		recommendation: string;
	}>;
};
