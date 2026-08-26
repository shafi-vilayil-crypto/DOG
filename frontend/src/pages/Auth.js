import { useState } from "react";
import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { sendPasswordReset, updatePassword } from "../auth/auth";
import "../auth/auth.css";

export default function Auth({ mode = "login", onModeChange }) {
  const { login, register } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const isRegister = mode === "register";
  const isReset = mode === "reset";
  const isUpdate = mode === "update";
  const submit = async e => {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      if (isReset) { await sendPasswordReset(form.email); setMessage("If an account exists, a reset link is on its way."); }
      else if (isUpdate) {
        const accessToken = new URLSearchParams(window.location.hash.slice(1)).get("access_token");
        if (!accessToken) throw new Error("This reset link is missing or expired. Request a new one.");
        await updatePassword(accessToken, form.password);
        window.history.replaceState({}, document.title, window.location.pathname);
        setMessage("Password updated. You can now sign in.");
        onModeChange("login");
      }
      else if (isRegister) { const result = await register(form); setMessage(result.access_token ? "Account created." : "Check your email to verify your account."); }
      else await login(form);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <main className="auth-page"><div className="auth-orbit auth-orbit-one" /><div className="auth-orbit auth-orbit-two" />
    <section className="auth-brand"><div className="auth-logo"><span className="auth-logo-mark">D</span>OG</div><p>Intelligence for every AI request.</p><div className="auth-proof"><CheckCircle2 size={16} /> Protect spend. Prevent loops. Move faster.</div></section>
    <section className="auth-card"><div className="auth-card-kicker"><Sparkles size={14} /> DOG WORKSPACE</div><h1>{isUpdate ? "Choose a new password" : isReset ? "Reset your password" : isRegister ? "Build your AI workspace" : "Welcome back"}</h1><p className="auth-subtitle">{isUpdate ? "Create a new secure password for your workspace." : isReset ? "We’ll send a secure reset link to your email." : isRegister ? "Start monitoring and optimizing your AI traffic." : "Sign in to your live AI infrastructure workspace."}</p>
      <form onSubmit={submit}>{isRegister && <label>Full name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Alex Rivera" required /></label>}{!isUpdate && <label><Mail size={14} /> Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" required={!isUpdate} /></label>}{(!isReset || isUpdate) && <label><LockKeyhole size={14} /> Password<div className="auth-password"><input type={showPassword ? "text" : "password"} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" minLength={8} required /><button type="button" onClick={() => setShowPassword(v => !v)}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></label>}{error && <div className="auth-error">{error}</div>}{message && <div className="auth-message">{message}</div>}<button className="primary-button auth-submit" disabled={busy}>{busy ? "Working…" : isUpdate ? "Update password" : isReset ? "Send reset link" : isRegister ? "Create workspace" : "Sign in"}<ArrowRight size={16} /></button></form>
      <div className="auth-links">{isReset || isUpdate ? <button onClick={() => onModeChange("login")}>Back to sign in</button> : <>{!isRegister && <button onClick={() => onModeChange("reset")}>Forgot password?</button>}<span>{isRegister ? "Already have an account?" : "New to DOG?"} <button onClick={() => onModeChange(isRegister ? "login" : "register")}>{isRegister ? "Sign in" : "Create an account"}</button></span></>}</div>
    </section><p className="auth-legal">By continuing, you agree to the DOG workspace terms and privacy policy.</p>
  </main>;
}
