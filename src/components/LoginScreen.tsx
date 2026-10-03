import { useState, type FormEvent } from "react";
import {
	ArrowRight,
	Braces,
	Check,
	Code2,
	Eye,
	EyeOff,
	GitFork,
	LoaderCircle,
	LockKeyhole,
	Radar,
	ShieldCheck,
	Sparkles,
	Workflow,
	X,
} from "lucide-react";
import {
	createAccount,
	persistAuthSession,
	requestPasswordReset,
	signIn as authenticate,
	signInDemo,
	type AuthUser,
} from "../services/auth";

type LoginScreenProps = {
	onSignIn: (user: AuthUser) => void;
};
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export default function LoginScreen({ onSignIn }: LoginScreenProps) {
	const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
	const [fullName, setFullName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [remember, setRemember] = useState(true);
	const [showPassword, setShowPassword] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");

	const changeMode = (nextMode: "login" | "signup" | "forgot") => {
		setMode(nextMode);
		setError("");
		setSuccess("");
		setPassword("");
		setConfirmPassword("");
	};
	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError("");
		setSuccess("");
		if (mode === "forgot") {
			if (!emailPattern.test(email.trim())) {
				setError("Enter a valid account email.");
				return;
			}
			setBusy(true);
			try {
				setSuccess(await requestPasswordReset(email));
			} catch (reason) {
				setError(
					reason instanceof Error
						? reason.message
						: "Could not start password reset.",
				);
			} finally {
				setBusy(false);
			}
			return;
		}
		if (mode === "signup" && fullName.trim().length < 2) {
			setError("Enter your full name.");
			return;
		}
		if (!emailPattern.test(email.trim())) {
			setError("Enter a valid work email.");
			return;
		}
		if (!passwordPattern.test(password)) {
			setError(
				"Use 8+ characters with at least one uppercase letter, lowercase letter, and number.",
			);
			return;
		}
		if (mode === "signup" && password !== confirmPassword) {
			setError("Passwords do not match.");
			return;
		}
		setBusy(true);
		try {
			const user =
				mode === "signup"
					? await createAccount(fullName, email, password, remember)
					: await authenticate(email, password, remember);
			setSuccess("Welcome back. Opening your workspace...");
			window.setTimeout(() => onSignIn(user), 320);
		} catch (reason) {
			setError(
				reason instanceof Error ? reason.message : "Authentication failed.",
			);
			setBusy(false);
		}
	};
	const continueDemo = async () => {
		setEmail("demo@logicloom.dev");
		setPassword("Logicloom123!");
		setRemember(true);
		setError("");
		setSuccess("Welcome to the Logicloom demo workspace...");
		setBusy(true);
		try {
			const user = await signInDemo();
			persistAuthSession(user, true);
			window.setTimeout(() => onSignIn(user), 320);
		} catch (reason) {
			setBusy(false);
			setSuccess("");
			setError(
				reason instanceof Error
					? reason.message
					: "Could not open the demo workspace.",
			);
		}
	};
	const title =
		mode === "signup"
			? "Create your workspace"
			: mode === "forgot"
				? "Reset your password"
				: "Welcome back";
	const subtitle =
		mode === "signup"
			? "Start measuring your codebase with Logicloom."
			: mode === "forgot"
				? "Enter your email and we will prepare reset instructions."
				: "Sign in to continue to your engineering workspace.";

	return (
		<main className={`login-screen ${busy ? "login-transitioning" : ""}`}>
			<div className="login-topbar">
				<a className="login-brand" href="/" aria-label="Logicloom home">
					<span className="login-brand-mark">
						<Braces size={19} strokeWidth={2.4} />
					</span>
					<span>
						logicloom<span>.</span>
					</span>
				</a>
				<span className="login-top-note">
					<LockKeyhole size={13} /> Private by design
				</span>
			</div>
			<div className="login-layout">
				<section className="login-story">
					<div className="login-eyebrow">
						<span />
						ENGINEERING INTELLIGENCE PLATFORM
					</div>
					<h1>
						Understand your codebase.
						<br />
						<span>Change it with confidence.</span>
					</h1>
					<p className="login-subtitle">
						Logicloom connects code quality, technical debt, and dependency
						impact — so your team can see the risks before they ship.
					</p>
					<div className="login-proof">
						<div>
							<span className="login-proof-icon cyan">
								<Code2 size={16} />
							</span>
							<span>
								<b>See the whole system</b>
								<small>
									Map architecture, dependencies, and high-risk paths.
								</small>
							</span>
						</div>
						<div>
							<span className="login-proof-icon purple">
								<Radar size={16} />
							</span>
							<span>
								<b>Find the root cause</b>
								<small>
									Turn noisy findings into prioritized engineering work.
								</small>
							</span>
						</div>
						<div>
							<span className="login-proof-icon lime">
								<GitFork size={16} />
							</span>
							<span>
								<b>Predict change impact</b>
								<small>Explore affected modules before touching code.</small>
							</span>
						</div>
					</div>
					<div className="login-story-footer">
						<Workflow size={14} />
						<span>UNDERSTAND</span>
						<i />
						<span>DIAGNOSE</span>
						<i />
						<span>SIMULATE</span>
						<i />
						<span>IMPROVE</span>
					</div>
				</section>
				<section className="login-card">
					<div className="login-card-top">
						<div className="login-card-icon">
							<Sparkles size={17} />
						</div>
						<span className="login-workspace-chip">
							<span />
							DEMO WORKSPACE
						</span>
					</div>
					<h2>{title}</h2>
					<p className="login-card-subtitle">{subtitle}</p>
					<form onSubmit={(event) => void submit(event)}>
						{mode === "signup" && (
							<>
								<label htmlFor="logicloom-name">Full name</label>
								<input
									id="logicloom-name"
									type="text"
									autoComplete="name"
									value={fullName}
									onChange={(event) => setFullName(event.target.value)}
									placeholder="Jordan Lee"
								/>
							</>
						)}
						<label htmlFor="logicloom-email">Work email</label>
						<input
							id="logicloom-email"
							type="email"
							autoComplete="email"
							required
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							placeholder="you@company.com"
						/>
						{mode !== "forgot" && (
							<>
								<div className="login-password-label">
									<label htmlFor="logicloom-password">Password</label>
									{mode === "login" && (
										<button type="button" onClick={() => changeMode("forgot")}>
											Forgot password?
										</button>
									)}
								</div>
								<div className="login-password-wrap">
									<input
										id="logicloom-password"
										type={showPassword ? "text" : "password"}
										autoComplete={
											mode === "signup" ? "new-password" : "current-password"
										}
										required
										minLength={8}
										value={password}
										onChange={(event) => setPassword(event.target.value)}
										placeholder="At least 8 characters"
									/>
									<button
										type="button"
										aria-label={
											showPassword ? "Hide password" : "Show password"
										}
										onClick={() => setShowPassword(!showPassword)}
									>
										{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
									</button>
								</div>
							</>
						)}
						{mode === "signup" && (
							<>
								<label htmlFor="logicloom-confirm">Confirm password</label>
								<input
									id="logicloom-confirm"
									type={showPassword ? "text" : "password"}
									autoComplete="new-password"
									required
									value={confirmPassword}
									onChange={(event) => setConfirmPassword(event.target.value)}
									placeholder="Repeat your password"
								/>
							</>
						)}
						{mode !== "forgot" && (
							<label className="login-remember">
								<input
									type="checkbox"
									checked={remember}
									onChange={(event) => setRemember(event.target.checked)}
								/>
								<span>Remember me</span>
							</label>
						)}
						{error && (
							<p className="login-error" role="alert">
								<X size={13} />
								{error}
							</p>
						)}
						{success && (
							<p className="login-success" role="status">
								<Check size={13} />
								{success}
							</p>
						)}
						<button className="login-submit" type="submit" disabled={busy}>
							{busy ? (
								<LoaderCircle className="login-spinner" size={15} />
							) : mode === "forgot" ? (
								<ArrowRight size={15} />
							) : mode === "signup" ? (
								<Sparkles size={15} />
							) : (
								<ArrowRight size={15} />
							)}
							{busy
								? "Authenticating..."
								: mode === "forgot"
									? "Send reset instructions"
									: mode === "signup"
										? "Create Logicloom account"
										: "Sign in to Logicloom"}
						</button>
					</form>
					{mode === "forgot" && (
						<button
							className="login-text-link login-back-link"
							onClick={() => changeMode("login")}
						>
							Back to login
						</button>
					)}
					<div className="login-divider">
						<span />
						or
						<span />
					</div>
					{mode === "login" && (
						<button
							className="login-demo-button"
							type="button"
							onClick={() => void continueDemo()}
							disabled={busy}
						>
							<span className="login-demo-check">
								<Check size={13} />
							</span>
							Continue with demo workspace
						</button>
					)}
					<p className="login-privacy">
						<ShieldCheck size={13} />
						Secure local preview. Your session stays in this browser.
					</p>
					<div className="login-card-bottom">
						{mode === "signup" ? (
							<>
								<span>Already have an account?</span>
								<button onClick={() => changeMode("login")}>
									Sign in <ArrowRight size={12} />
								</button>
							</>
						) : mode === "login" ? (
							<>
								<span>New to Logicloom?</span>
								<button onClick={() => changeMode("signup")}>
									Create an account <ArrowRight size={12} />
								</button>
							</>
						) : (
							<>
								<span>Remember your password?</span>
								<button onClick={() => changeMode("login")}>
									Sign in <ArrowRight size={12} />
								</button>
							</>
						)}
					</div>
				</section>
			</div>
			<footer className="login-footer">
				<span>LOGICLOOM</span>
				<span>Engineering intelligence for modern software teams</span>
				<span>DEMO BUILD · 2026</span>
			</footer>
		</main>
	);
}
