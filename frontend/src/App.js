import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useLocation, Link, useNavigate } from "react-router-dom";
import { Bell, ChevronDown, Menu, Search, Settings2, UserCircle2, LogOut } from "lucide-react";
import Auth from "./pages/Auth";
import { useAuth } from "./auth/AuthContext";
import Sidebar from "./components/Sidebar";
import Playground from "./components/Playground";
import Overview from "./pages/Overview";
import Performance from "./pages/Performance";
import Cost from "./pages/Cost";
import Reliability from "./pages/Reliability";
import Optimizations from "./pages/Optimizations";
import Integrations from "./pages/Integrations";
import ApiKeys from "./pages/ApiKeys";
import Docs from "./pages/Docs";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import Profile from "./pages/Profile";
import Landing from "./pages/Landing";
import "./App.css";
import "./mobile.css";

const meta = {
  "/": ["DOG"],
  "/app": ["Overview"],
  "/performance": ["Performance"],
  "/cost": ["Cost"],
  "/reliability": ["Reliability"],
  "/optimizations": ["Optimizations"],
  "/playground": ["Playground"],
  "/integrations": ["Integrations"],
  "/api-keys": ["API Keys"],
  "/docs": ["Documentation"],
  "/settings": ["Settings"],
  "/admin": ["Administration"],
  "/profile": ["Profile"],
};

function Shell({ children, onMenu }) {
  const { workspace, user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const page = meta[location.pathname] || ["Overview"];
  const displayName = workspace?.display_name || user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Workspace member";
  const initials = displayName.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="app-shell">
      <Sidebar open={false} onClose={() => {}} />
      <div className="mobile-sidebar"><Sidebar open onClose={onMenu} /></div>
      <main className="main">
        <header className="topbar">
          <button className="mobile-menu icon-button" onClick={onMenu} data-testid="open-sidebar-button"><Menu size={20} /></button>
          <div className="crumb">
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>{page[0]}</strong>
          </div>
          <div className="top-actions">
            <button className="search-pill" onClick={() => setSearchOpen(v => !v)} data-testid="search-button"><Search size={16} /><span>Search</span><kbd>⌘ K</kbd></button>
            <button className="icon-button notification" onClick={() => setNoticeOpen(v => !v)} data-testid="notifications-button"><Bell size={18} /><i /></button>
            <button className="workspace-switcher" onClick={() => setWorkspaceOpen(v => !v)} data-testid="workspace-switcher"><span className="workspace-dot" />{workspace?.tenant_name || "Your workspace"}<ChevronDown size={14} /></button>
            <button className="topbar-profile-button" onClick={() => setUserMenuOpen(v => !v)} data-testid="topbar-profile-button" aria-label="Open account menu">
              <span className="topbar-avatar">{initials}</span>
              <ChevronDown size={14} />
            </button>
          </div>
        </header>
        {searchOpen && <div className="panel topbar-popover"><input autoFocus placeholder="Search pages…" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { const hit = Object.entries(meta).find(([, label]) => label[0].toLowerCase().includes(query.toLowerCase())); if (hit) { navigate(hit[0]); setSearchOpen(false); } } }} /></div>}
        {noticeOpen && <div className="panel topbar-popover">No new notifications.</div>}
        {workspaceOpen && <div className="panel topbar-popover">{workspace?.tenant_name || "Your workspace"} <span className="muted">Signed-in workspace</span></div>}
        {userMenuOpen && (
          <div className="panel topbar-popover topbar-profile-menu" onClick={() => setUserMenuOpen(false)}>
            <div className="profile-card-mini">
              <div className="topbar-avatar">{initials}</div>
              <div>
                <strong>{displayName}</strong>
                <span>{user?.email || "No email"}</span>
              </div>
            </div>
            <button type="button" onClick={() => navigate("/profile")}><UserCircle2 size={14} /> Profile details</button>
            <button type="button" onClick={() => navigate("/settings")}><Settings2 size={14} /> Workspace settings</button>
            <button type="button" onClick={() => { logout(); navigate("/"); }}><LogOut size={14} /> Sign out</button>
          </div>
        )}
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}

function RedirectBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    const redirect = new URLSearchParams(window.location.search).get("redirect");
    if (redirect) navigate(`/${redirect}`, { replace: true });
  }, [navigate]);
  return null;
}

function App() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authMode, setAuthMode] = useState(() => window.location.hash.includes("type=recovery") ? "update" : window.location.pathname === "/register" ? "register" : "login");
  const [authVisible, setAuthVisible] = useState(() => ["/login", "/register"].includes(window.location.pathname) || window.location.hash.includes("type=recovery"));
  const { ready, user } = useAuth();
  useEffect(() => {
    if (user && ["/login", "/register"].includes(window.location.pathname)) window.location.replace("/app");
  }, [user]);
  useEffect(() => {
    if (!user && window.location.pathname === "/") setAuthVisible(false);
  }, [user]);
  if (!ready) return <div className="auth-loading">Loading your workspace…</div>;
  if (!user) {
    if (!authVisible) return <Landing onLogin={() => { setAuthMode("login"); setAuthVisible(true); window.history.pushState({}, document.title, "/login"); }} onRegister={() => { setAuthMode("register"); setAuthVisible(true); window.history.pushState({}, document.title, "/register"); }} />;
    return <Auth mode={authMode} onModeChange={setAuthMode} />;
  }
  if (window.location.pathname === "/") {
    const openDashboard = () => { window.history.pushState({}, document.title, "/app"); window.location.reload(); };
    return <Landing onLogin={openDashboard} onRegister={openDashboard} />;
  }
  return (
    <BrowserRouter>
      <div className={mobileOpen ? "mobile-open" : ""}>
        <RedirectBridge />
        <Shell onMenu={() => setMobileOpen(!mobileOpen)}>
          <Routes>
            <Route path="/app" element={<Overview />} />
            <Route path="/performance" element={<Performance />} />
            <Route path="/cost" element={<Cost />} />
            <Route path="/reliability" element={<Reliability />} />
            <Route path="/optimizations" element={<Optimizations />} />
            <Route path="/playground" element={<Playground />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/api-keys" element={<ApiKeys />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </Shell>
      </div>
    </BrowserRouter>
  );
}

export default App;
