import { useState } from "react";
import { Copy, LockKeyhole, Mail, ShieldCheck, UserRound, RotateCcw } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { sendPasswordReset } from "../auth/auth";

export default function Profile() {
  const { user, workspace, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const displayName = workspace?.display_name || user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Workspace member";
  const email = user?.email || "Not signed in";
  const initials = displayName.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();

  const copyEmail = async () => {
    await navigator.clipboard.writeText(email);
    setMessage("Email copied to clipboard.");
  };

  const resetPassword = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await sendPasswordReset(email);
      setMessage(`A reset link was sent to ${email}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Profile</div>
          <h1 data-testid="page-title">Your account details</h1>
          <p data-testid="page-description">Review your name, email, and password options for this workspace.</p>
        </div>
      </div>

      <section className="panel profile-hero">
        <div className="profile-hero-avatar">{initials}</div>
        <div className="profile-hero-copy">
          <span className="eyebrow">Signed-in user</span>
          <h2>{displayName}</h2>
          <p>{workspace?.tenant_name || "Your workspace"} · {email}</p>
        </div>
        <button className="soft-button" onClick={logout} data-testid="profile-signout-button">Sign out</button>
      </section>

      <section className="profile-grid">
        <div className="panel profile-card">
          <div className="profile-card-head">
            <UserRound size={18} />
            <span>Name</span>
          </div>
          <strong>{displayName}</strong>
          <p>Your display name comes from the signed-in Supabase account or workspace profile.</p>
        </div>

        <div className="panel profile-card">
          <div className="profile-card-head">
            <Mail size={18} />
            <span>Email</span>
          </div>
          <strong>{email}</strong>
          <button className="text-link" onClick={copyEmail}>Copy email</button>
        </div>

        <div className="panel profile-card">
          <div className="profile-card-head">
            <LockKeyhole size={18} />
            <span>Password</span>
          </div>
          <strong>Hidden</strong>
          <p>Passwords are never shown. Use reset link flow to change it securely.</p>
        </div>

        <div className="panel profile-card">
          <div className="profile-card-head">
            <ShieldCheck size={18} />
            <span>Security</span>
          </div>
          <strong>Reset password</strong>
          <p>Send a fresh reset email to the address on this account.</p>
        </div>
      </section>

      <section className="panel profile-reset">
        <div>
          <span className="eyebrow">Reset password</span>
          <h2>Send a new password reset email</h2>
          <p>A secure reset link will be sent to <strong>{email}</strong>.</p>
        </div>
        <div className="profile-reset-actions">
          {error && <div className="playground-error">{error}</div>}
          {message && <div className="auth-message">{message}</div>}
          <button className="primary-button" onClick={resetPassword} disabled={busy} data-testid="profile-reset-button">
            <RotateCcw size={16} /> {busy ? "Sending…" : "Send reset link"}
          </button>
        </div>
      </section>
    </>
  );
}
