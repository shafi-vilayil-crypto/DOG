import { useState } from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import { Activity, BookOpen, Boxes, CircleDollarSign, FlaskConical, Gauge, KeyRound, LifeBuoy, Settings2, ShieldCheck, Sparkles, X, Zap } from "lucide-react";
import Logo from "./Logo";
import { useAuth } from "../auth/AuthContext";
const primary = [["Overview", "/app", Gauge], ["Performance", "/performance", Activity], ["Cost", "/cost", CircleDollarSign], ["Reliability", "/reliability", ShieldCheck], ["Optimizations", "/optimizations", Sparkles]];
const secondary = [["Playground", "/playground", FlaskConical], ["Integrations", "/integrations", Boxes], ["API Keys", "/api-keys", KeyRound], ["Documentation", "/docs", BookOpen], ["Settings", "/settings", Settings2], ["Admin", "/admin", ShieldCheck]];
export default function Sidebar({ open, onClose }) {
  const [menu, setMenu] = useState(false);
  const navigate = useNavigate();
  const { user, workspace } = useAuth();
  const displayName = workspace?.display_name || user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Workspace member";
  const initials = displayName.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  const group = (items, label) => <div className="nav-group"><p className="nav-label">{label}</p>{items.map(([name, path, Icon]) => <NavLink key={path} to={path} end={path === "/"} onClick={onClose} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} data-testid={`nav-${name.toLowerCase().replace(" ", "-")}`}><Icon size={17} strokeWidth={1.8} /><span>{name}</span>{name === "Optimizations" && <span className="nav-badge">3</span>}</NavLink>)}</div>;
  return <aside className={`sidebar ${open ? "open" : ""}`} data-testid="sidebar"><div className="sidebar-top"><Logo compact />{open && <button className="icon-button mobile-close" onClick={onClose} data-testid="close-sidebar-button"><X size={18} /></button>}</div>{group(primary, "Monitor")}{group(secondary, "Workspace")}<div className="sidebar-bottom"><Link to="/docs" className="help-row"><div className="help-icon"><LifeBuoy size={16} /></div><div><strong>Need a hand?</strong><span>Read the quickstart</span></div><Zap size={15} /></Link><div className="profile" data-testid="user-profile" onClick={() => navigate("/settings")} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && navigate("/settings")}><div className="avatar">{initials}</div><div className="profile-info"><strong>{displayName}</strong><span>{workspace?.tenant_name || "Your workspace"}</span></div><button className="dots-button" onClick={e => { e.stopPropagation(); setMenu(v => !v); }} data-testid="profile-menu-button" aria-label="Open profile menu">•••</button>{menu && <div className="profile-menu" onClick={e => e.stopPropagation()}><Link to="/settings">Settings</Link><Link to="/api-keys">API Keys</Link></div>}</div></div></aside>;
}
