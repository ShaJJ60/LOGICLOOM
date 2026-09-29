import { useState, type FormEvent } from "react";
import {
  ArrowRight, Braces, Check, Code2, GitFork, LockKeyhole, Radar,
  ShieldCheck, Sparkles, Workflow,
} from "lucide-react";

type LoginScreenProps = {
  onSignIn: () => void;
};

export default function LoginScreen({ onSignIn }: LoginScreenProps) {
  const [email, setEmail] = useState("jordan@acme.io");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.includes("@") || password.length < 4) {
      setError("Enter a valid email and a password of at least 4 characters.");
      return;
    }
    setError("");
    onSignIn();
  };

  return (
    <main className="login-screen">
      <div className="login-topbar">
        <a className="login-brand" href="/" aria-label="Logicloom home">
          <span className="login-brand-mark"><Braces size={19} strokeWidth={2.4} /></span>
          <span>logicloom<span>.</span></span>
        </a>
        <span className="login-top-note"><LockKeyhole size={13} /> Private by design</span>
      </div>
      <div className="login-layout">
        <section className="login-story">
          <div className="login-eyebrow"><span />ENGINEERING INTELLIGENCE PLATFORM</div>
          <h1>Understand your codebase.<br /><span>Change it with confidence.</span></h1>
          <p className="login-subtitle">Logicloom connects code quality, technical debt, and dependency impact — so your team can see the risks before they ship.</p>
          <div className="login-proof">
            <div><span className="login-proof-icon cyan"><Code2 size={16} /></span><span><b>See the whole system</b><small>Map architecture, dependencies, and high-risk paths.</small></span></div>
            <div><span className="login-proof-icon purple"><Radar size={16} /></span><span><b>Find the root cause</b><small>Turn noisy findings into prioritized engineering work.</small></span></div>
            <div><span className="login-proof-icon lime"><GitFork size={16} /></span><span><b>Predict change impact</b><small>Explore affected modules before touching code.</small></span></div>
          </div>
          <div className="login-story-footer"><Workflow size={14} /><span>UNDERSTAND</span><i /><span>DIAGNOSE</span><i /><span>SIMULATE</span><i /><span>IMPROVE</span></div>
        </section>
        <section className="login-card">
          <div className="login-card-top"><div className="login-card-icon"><Sparkles size={17} /></div><span className="login-workspace-chip"><span />DEMO WORKSPACE</span></div>
          <h2>Welcome back</h2>
          <p className="login-card-subtitle">Sign in to continue to your engineering workspace.</p>
          <form onSubmit={submit}>
            <label htmlFor="logicloom-email">Work email</label>
            <input id="logicloom-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            <div className="login-password-label"><label htmlFor="logicloom-password">Password</label><button type="button" onClick={() => setError("Password reset isn't connected in this local demo.")}>Forgot password?</button></div>
            <input id="logicloom-password" type="password" autoComplete="current-password" required minLength={4} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter any 4+ characters for this demo" />
            {error && <p className="login-error" role="alert">{error}</p>}
            <button className="login-submit" type="submit">Sign in to Logicloom <ArrowRight size={15} /></button>
          </form>
          <div className="login-divider"><span />or<span /></div>
          <button className="login-demo-button" onClick={onSignIn}><span className="login-demo-check"><Check size={13} /></span>Continue with demo workspace</button>
          <p className="login-privacy"><ShieldCheck size={13} />Local preview only. No account service is connected; credentials aren't transmitted or saved.</p>
          <div className="login-card-bottom"><span>New to Logicloom?</span><button onClick={onSignIn}>Explore the demo <ArrowRight size={12} /></button></div>
        </section>
      </div>
      <footer className="login-footer"><span>LOGICLOOM</span><span>Engineering intelligence for modern software teams</span><span>DEMO BUILD · 2026</span></footer>
    </main>
  );
}
