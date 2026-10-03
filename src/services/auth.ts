import { apiRequest } from "./api";

export type AuthUser = { fullName: string; email: string };
type AuthResponse = { token: string; user: AuthUser };
const userKey = "logicloom-auth-user";
const tokenKey = "logicloom-auth-token";

const readUser = (storage: Storage): AuthUser | null => {
	try {
		const value = storage.getItem(userKey);
		return value ? (JSON.parse(value) as AuthUser) : null;
	} catch {
		return null;
	}
};

const storeSession = (
	{ token, user }: AuthResponse,
	remember: boolean,
): AuthUser => {
	const target = remember ? window.localStorage : window.sessionStorage;
	const other = remember ? window.sessionStorage : window.localStorage;
	other.removeItem(tokenKey);
	other.removeItem(userKey);
	target.setItem(tokenKey, token);
	target.setItem(userKey, JSON.stringify(user));
	return user;
};

export function getAuthSession(): AuthUser | null {
	const token =
		window.localStorage.getItem(tokenKey) ??
		window.sessionStorage.getItem(tokenKey);
	return token
		? (readUser(window.localStorage) ?? readUser(window.sessionStorage))
		: null;
}

export function persistAuthSession(user: AuthUser, remember: boolean): void {
	const token =
		window.localStorage.getItem(tokenKey) ??
		window.sessionStorage.getItem(tokenKey);
	if (token) storeSession({ token, user }, remember);
}

export async function signIn(
	email: string,
	password: string,
	remember: boolean,
): Promise<AuthUser> {
	return storeSession(
		await apiRequest<AuthResponse>("/auth/login", {
			method: "POST",
			body: JSON.stringify({ email, password, remember }),
		}),
		remember,
	);
}

export async function createAccount(
	fullName: string,
	email: string,
	password: string,
	remember: boolean,
): Promise<AuthUser> {
	return storeSession(
		await apiRequest<AuthResponse>("/auth/signup", {
			method: "POST",
			body: JSON.stringify({ fullName, email, password, remember }),
		}),
		remember,
	);
}

export async function signInDemo(): Promise<AuthUser> {
	try {
		return await signIn("demo@logicloom.dev", "Logicloom123!", true);
	} catch (reason) {
		if (
			reason instanceof Error &&
			(reason as Error & { status?: number }).status === 401
		)
			return createAccount(
				"Logicloom Demo",
				"demo@logicloom.dev",
				"Logicloom123!",
				true,
			);
		throw reason;
	}
}

export async function requestPasswordReset(email: string): Promise<string> {
	const response = await apiRequest<{ message: string }>(
		"/auth/password-reset",
		{ method: "POST", body: JSON.stringify({ email }) },
	);
	return response.message;
}

export async function signOut(): Promise<void> {
	await apiRequest<void>("/auth/logout", { method: "POST" }).catch(
		() => undefined,
	);
	window.localStorage.removeItem(tokenKey);
	window.localStorage.removeItem(userKey);
	window.sessionStorage.removeItem(tokenKey);
	window.sessionStorage.removeItem(userKey);
}
