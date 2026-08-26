import { useState } from "react";
import {
  ArrowRight, ArrowUpRight, Bot, BrainCircuit, Check, ChevronDown, Clock3,
  Database, Gauge, GitBranch, Layers3, LockKeyhole, Menu, Network,
  Radar, ShieldCheck, Sparkles, Target, Timer, TriangleAlert, Users, Zap,
} from "lucide-react";
import Logo from "../components/Logo";
import "./landing.css";

const problems = [
  [Clock3, "Latency", "Your model may be powerful, but slow responses still damage the user experience."],
  [TriangleAlert, "Runaway loops", "Agents can repeatedly call the same model or tool, consuming tokens without making progress."],
  [GitBranch, "Duplicate requests", "The same request can reach your provider multiple times unnecessarily."],
  [Gauge, "Invisible cost", "Small inefficiencies become large production bills when traffic scales."],
];

const features = [
  [Timer, "Latency intelligence", "Understand how quickly AI responds and detect degradation before users feel it.", "mint"],
  [ShieldCheck, "Loop protection", "Detect repeated AI and tool execution before runaway loops consume provider credits.", "dark"],
  [GitBranch, "Duplicate prevention", "Recognize repeated requests and prevent unnecessary downstream calls.", "blue"],
  [Database, "Smart caching", "Serve eligible repeated requests without hitting the model again.", "violet"],
  [Network, "Request coalescing", "Combine identical concurrent requests into a single downstream execution where safe.", "amber"],
  [Target, "Cost intelligence", "Understand what you are spending and what DOG prevented.", "mint"],
  [Radar, "Provider health", "Monitor provider performance and identify degraded AI infrastructure.", "blue"],
  [LockKeyhole, "Policy engine", "Define how DOG should behave for latency, cost, reliability, and security.", "dark"],
];

const faqs = [
  ["What is DOG?", "DOG is an intelligent infrastructure layer between your application and AI providers. It observes requests, evaluates policy, and helps control latency, repetition, reliability, and cost."],
  ["Does DOG replace my LLM provider?", "No. You keep using your existing providers. DOG sits in front of them as a control and intelligence layer."],
  ["Does DOG work with RAG and agents?", "DOG is designed for AI traffic around LLMs, retrieval pipelines, tools, and agentic systems. The exact integration depends on your application architecture."],
  ["How does DOG detect loops?", "DOG fingerprints requests and observes repetition within configurable windows. When behavior crosses a risk threshold, it can warn or block the request."],
  ["Does DOG store my prompts?", "Storage depends on your configuration and deployment. The platform exposes request intelligence while credentials remain server-side."],
  ["How are provider API keys protected?", "Credentials are kept on the server, encrypted before storage, and never placed in browser code. Production deployments should also use managed secret storage."],
  ["Does DOG add latency?", "DOG measures its own overhead and the full request lifecycle so you can see the tradeoff. Fast decisions can also prevent much slower unnecessary work."],
];

function FlowNode({ label, tone = "default" }) {
  return <div className={"flow-node " + tone}><span className="flow-node-dot" />{label}</div>;
}

function Architecture() {
  return <div className="architecture" aria-label="Application to DOG to AI providers architecture">
    <div className="architecture-column"><span className="diagram-label">YOUR SYSTEM</span><FlowNode label="Application" /><FlowNode label="RAG pipeline" /><FlowNode label="AI agent" /></div>
    <div className="architecture-connector"><i /><i /><i /></div>
    <div className="dog-control"><span className="dog-control-mark">O</span><strong>DOG</strong><small>Analyze · Decide · Optimize</small><div className="dog-signals"><span>Latency</span><span>Loop</span><span>Cost</span><span>Cache</span></div></div>
    <div className="architecture-connector"><i /><i /><i /></div>
    <div className="architecture-column"><span className="diagram-label">PROVIDERS</span><FlowNode label="OpenAI" tone="provider" /><FlowNode label="Anthropic" tone="provider" /><FlowNode label="Gemini" tone="provider" /><FlowNode label="Custom models" tone="provider" /></div>
  </div>;
}

export default function Landing({ onLogin, onRegister }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const navigate = callback => { setMenuOpen(false); callback(); };

  return <div className="landing-page">
    <header className="landing-nav">
      <a className="landing-logo" href="#top" aria-label="DOG home"><Logo compact /></a>
      <button className="landing-menu-button" onClick={() => setMenuOpen(v => !v)} aria-label="Toggle navigation"><Menu size={20} /></button>
      <nav className={menuOpen ? "landing-links open" : "landing-links"}>
        <a href="#product" onClick={() => setMenuOpen(false)}>Product</a><a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a><a href="#solutions" onClick={() => setMenuOpen(false)}>Solutions</a><a href="#developers" onClick={() => setMenuOpen(false)}>Developers</a><a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
        <div className="mobile-nav-actions"><button onClick={() => navigate(onLogin)}>Log in</button><button onClick={() => navigate(onRegister)}>Start building <ArrowRight size={14} /></button></div>
      </nav>
      <div className="landing-actions"><button className="landing-login" onClick={onLogin}>Log in</button><button className="landing-cta small" onClick={onRegister}>Start building <ArrowRight size={14} /></button></div>
    </header>

    <main id="top">
      <section className="landing-hero landing-section">
        <div className="hero-copy"><div className="landing-kicker"><span className="kicker-dot" /> AI INFRASTRUCTURE CONTROL</div><h1>Your AI stack.<br /><em>Now intelligently optimized.</em></h1><p className="hero-lede">DOG sits between your application and AI providers to reduce unnecessary latency, prevent runaway loops, control costs, and keep every request moving efficiently.</p><div className="hero-actions"><button className="landing-cta" onClick={onRegister}>Start building <ArrowRight size={17} /></button><a className="landing-secondary" href="#how-it-works"><span className="play-icon">▶</span> See how DOG works</a></div><p className="hero-note"><Check size={14} /> No model lock-in. No rewrite. Just one intelligent layer between your app and AI.</p></div>
        <div className="hero-visual"><div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" /><div className="visual-caption">EVERY REQUEST, EVALUATED</div><Architecture /></div>
      </section>

      <section className="logo-strip"><span>BUILT FOR TEAMS SHIPPING WITH</span><b>LLM APPS</b><b>RAG PIPELINES</b><b>AI AGENTS</b><b>VOICE AI</b><b>CUSTOM MODELS</b></section>

      <section className="landing-section problem-section" id="product"><div className="section-intro"><div className="landing-kicker">THE PRODUCTION REALITY</div><h2>AI gets expensive when nobody is watching the traffic.</h2><p>Applications are becoming intelligent. Their traffic is becoming harder to reason about. DOG gives every request a control point before waste becomes a production problem.</p></div><div className="problem-grid">{problems.map(([Icon, title, copy], index) => <article className="problem-card" key={title}><span className="card-index">0{index + 1}</span><Icon size={21} /><h3>{title}</h3><p>{copy}</p><span className="card-line" /></article>)}</div></section>

      <section className="idea-section"><div className="landing-section idea-grid"><div><div className="landing-kicker light">THE BIG IDEA</div><h2>What if every AI request had an intelligent control layer?</h2><p>DOG observes every request and decides whether it should be allowed, optimized, cached, coalesced, throttled, degraded, or blocked.</p></div><div className="compare-flow"><div className="compare-side muted-flow"><span>WITHOUT DOG</span><FlowNode label="Application" /><b>↓</b><FlowNode label="LLM" /><b>↓</b><FlowNode label="LLM" /><strong>Cost + latency + repetition</strong></div><div className="compare-divider">vs</div><div className="compare-side"><span>WITH DOG</span><FlowNode label="Application" /><b>↓</b><FlowNode label="DOG" tone="dog" /><b>↓</b><div className="decision-stack"><small>ANALYZE</small><small>DECIDE</small><small>OPTIMIZE</small></div><FlowNode label="LLM" /></div></div></div></section>

      <section className="landing-section how-section" id="how-it-works"><div className="section-intro centered"><div className="landing-kicker">HOW DOG WORKS</div><h2>One request. Five intelligent decisions.</h2><p>DOG turns the invisible behavior between your application and AI into a measurable, controllable flow.</p></div><div className="steps-grid">{[["01", "INTERCEPT", "DOG receives the AI request."], ["02", "UNDERSTAND", "Identify tenant, provider, model, fingerprint, and policy."], ["03", "ANALYZE", "Evaluate latency, loop risk, cache, cost, and provider health."], ["04", "DECIDE", "Allow, cache, coalesce, warn, throttle, fallback, or block."], ["05", "LEARN", "Record the result and turn activity into intelligence."]].map(([number, title, copy], index) => <article className="step-card" key={title}><span>{number}</span><div className="step-icon"><Sparkles size={17} /></div><h3>{title}</h3><p>{copy}</p>{index < 4 && <ArrowRight className="step-arrow" size={18} />}</article>)}</div></section>

      <section className="landing-section feature-section"><div className="section-intro"><div className="landing-kicker">THE CONTROL LAYER</div><h2>Make every request faster, safer, and more efficient.</h2><p>Focused intelligence for the failure modes that matter when AI moves from demo to production.</p></div><div className="feature-grid">{features.map(([Icon, title, copy, tone]) => <article className={"feature-card " + tone} key={title}><div className="feature-icon"><Icon size={19} /></div><h3>{title}</h3><p>{copy}</p><ArrowUpRight className="feature-arrow" size={17} /></article>)}</div></section>

      <section className="story-section loop-story"><div className="landing-section story-grid"><div className="story-copy"><div className="landing-kicker">LOOP PROTECTION</div><h2>One repeated request can become hundreds.</h2><p>DOG fingerprints requests and observes repetition within configurable time windows. When behavior crosses the risk threshold, DOG can intervene before the loop continues consuming model resources.</p><div className="story-points"><span><Check size={14} /> Pattern detected</span><span><Check size={14} /> Execution stopped</span><span><Check size={14} /> Downstream work prevented</span></div></div><div className="loop-visual"><div className="loop-counter"><span>REQUEST COUNT</span><strong>06</strong><em>pattern detected</em></div><div className="loop-track">{["User", "Agent", "Tool", "AI", "Tool", "DOG"].map((item, index) => <div key={item + index} className={item === "DOG" ? "loop-node active" : "loop-node"}><b>{index + 1}</b>{item}</div>)}</div><div className="intervention"><ShieldCheck size={17} /><span>DOG intervention</span><strong>BLOCK</strong></div></div></div></section>

      <section className="landing-section metrics-section"><div className="metrics-story"><div className="landing-kicker">SEE THE DIFFERENCE</div><h2>Less unnecessary model work.</h2><p>Illustrative example: DOG evaluates traffic before it becomes provider work. Your actual savings depend on your traffic and policy.</p><div className="metric-compare"><div><span>WITHOUT DOG</span><strong>10</strong><small>incoming requests → 10 LLM calls</small></div><ArrowRight size={21} /><div className="metric-highlight"><span>WITH DOG</span><strong>7</strong><small>valid executions · 2 cache hits · 1 prevented</small></div></div></div><div className="latency-card"><div className="landing-kicker">LATENCY INTELLIGENCE</div><h3>Performance starts before the model responds.</h3><div className="latency-line"><span>Request</span><i /><span>DOG</span><i /><span>Provider</span><i /><span>First token</span><i /><span>Response</span></div><div className="latency-legend"><span>Network</span><span>RAG / tools</span><span>Model generation</span></div></div></section>

      <section className="landing-section dashboard-showcase"><div className="showcase-copy"><div className="landing-kicker">OBSERVABILITY</div><h2>See what your AI infrastructure is actually doing.</h2><p>DOG turns AI behavior into live performance, reliability, cost, and optimization intelligence.</p><a className="landing-secondary" href="#developers">Explore the platform <ArrowUpRight size={15} /></a></div><div className="dashboard-mock"><div className="mock-sidebar"><Logo compact /><span className="mock-active">Overview</span><span>Performance</span><span>Cost</span><span>Reliability</span><span>Optimizations</span></div><div className="mock-main"><div className="mock-top"><span>LIVE · UPDATED EVERY 8S</span><b>AI Health <strong>87</strong></b></div><h3>Your AI infrastructure <em>needs attention.</em></h3><div className="mock-metrics"><div><small>Average latency</small><strong>420ms</strong><i>↓ 18%</i></div><div><small>AI spend</small><strong>$0.06</strong><i>optimized</i></div><div><small>Requests</small><strong>1,248</strong><i>24h</i></div><div><small>Reliability</small><strong>99.8%</strong><i>healthy</i></div></div><div className="mock-chart"><span>AI activity</span><div className="chart-lines"><i /><i /><i /></div></div></div></div></section>

      <section className="landing-section developer-section" id="developers"><div className="code-panel"><div className="code-tabs"><span>curl</span><span>Python</span><span>JavaScript</span></div><pre><code>{String.raw`curl https://api.dog.dev/v1/chat \\
  -H "Authorization: Bearer dog_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "your-model",
    "messages": [...]
  }'`}</code></pre><div className="code-flow"><span>Your app</span><ArrowRight size={16} /><b>DOG</b><ArrowRight size={16} /><span>Existing provider</span></div></div><div className="developer-copy"><div className="landing-kicker">FOR DEVELOPERS</div><h2>One endpoint between your app and AI.</h2><p>Keep your application architecture. Point your AI traffic through DOG and start receiving intelligence immediately.</p><a className="landing-cta" href="#how-it-works">Read the documentation <ArrowRight size={16} /></a><small>Provider formats and supported capabilities depend on your configured integration.</small></div></section>

      <section className="landing-section solutions-section" id="solutions"><div className="section-intro centered"><div className="landing-kicker">WORKS WITH THE ARCHITECTURE YOU HAVE</div><h2>Not just for chat. Built for AI systems.</h2><p>DOG provides a consistent control layer around the AI traffic your product already creates.</p></div><div className="solutions-grid"><article><Database size={22} /><h3>RAG</h3><p>Optimize applications using retrieval pipelines and external knowledge.</p></article><article><Bot size={22} /><h3>AGENTS</h3><p>Protect agentic systems from repeated tool execution and runaway loops.</p></article><article><Zap size={22} /><h3>VOICE AI</h3><p>Monitor latency-sensitive interactions where every millisecond matters.</p></article><article><BrainCircuit size={22} /><h3>CUSTOM PIPELINES</h3><p>Connect custom models and AI infrastructure without losing visibility.</p></article></div></section>

      <section className="provider-section"><div className="landing-section provider-grid-large"><div><div className="landing-kicker light">PROVIDER AGNOSTIC</div><h2>Your models can change. Your intelligence layer doesn't have to.</h2><p>Use the models you want. DOG provides a consistent optimization and observability layer above them.</p></div><div className="provider-ring"><div className="provider-ring-center">DOG</div>{["OpenAI", "Anthropic", "Gemini", "Custom"].map((name, i) => <span key={name} className={"provider-orbit p" + i}>{name}</span>)}</div></div></section>

      <section className="landing-section security-section"><div className="security-visual"><div><span>Browser</span><ArrowDownIcon /></div><div className="security-dog"><LockKeyhole size={17} /> DOG API</div><div><span>Encrypted credentials</span><ArrowDownIcon /></div><div><span>AI provider</span></div></div><div className="security-copy"><div className="landing-kicker">SECURITY BY DESIGN</div><h2>Your AI credentials stay yours.</h2><p>DOG is designed so provider credentials remain server-side and are never exposed to the browser.</p><div className="security-list"><span><Check size={14} /> Encrypted credential storage</span><span><Check size={14} /> Tenant isolation</span><span><Check size={14} /> API key hashing and audit trails</span><span><Check size={14} /> Rate limits and policy controls</span></div><a className="landing-secondary" href="#faq">Explore security <ArrowUpRight size={15} /></a></div></section>

      <section className="landing-section teams-section"><div className="section-intro"><div className="landing-kicker">BUILT FOR TEAMS</div><h2>From AI traffic to AI intelligence.</h2><p>Each workspace can bring together applications, providers, policies, and analytics in one clear operating layer.</p></div><div className="team-flow"><span>Workspace</span><ArrowRight size={16} /><span>Teams</span><ArrowRight size={16} /><span>Applications</span><ArrowRight size={16} /><span>Providers</span><ArrowRight size={16} /><span>Policies</span><ArrowRight size={16} /><span>Analytics</span></div><div className="use-case-row">{[[Users, "Developers", "Ship AI features without rebuilding infrastructure."], [Layers3, "AI platform teams", "Standardize AI traffic across providers and applications."], [Gauge, "Startups", "Control AI spend before scale turns inefficiency into a bill."], [ShieldCheck, "Enterprise", "Create consistent AI performance and governance across teams."]].map(([Icon, title, copy]) => <article key={title}><Icon size={19} /><strong>{title}</strong><p>{copy}</p></article>)}</div></section>

      <section className="landing-section integration-section"><div className="integration-copy"><div className="landing-kicker">THREE STEPS TO START</div><h2>Put intelligence between your application and AI.</h2><p>Create a workspace, connect a provider, and point your traffic to DOG.</p><button className="landing-cta" onClick={onRegister}>Start building with DOG <ArrowRight size={16} /></button></div><div className="integration-steps">{[["01", "Create your DOG workspace."], ["02", "Connect your AI provider."], ["03", "Point your application to DOG."]].map(([n, text]) => <div key={n}><b>{n}</b><span>{text}</span><Check size={16} /></div>)}</div></section>

      <section className="landing-section faq-section" id="faq"><div className="section-intro centered"><div className="landing-kicker">QUESTIONS, ANSWERED</div><h2>Understand the layer before you add it.</h2></div><div className="faq-list">{faqs.map(([question, answer], index) => <div className={"faq-item " + (openFaq === index ? "active" : "")} key={question}><button onClick={() => setOpenFaq(openFaq === index ? -1 : index)} aria-expanded={openFaq === index}><span>{question}</span><ChevronDown size={17} /></button>{openFaq === index && <p>{answer}</p>}</div>)}</div></section>

      <section className="final-cta"><div className="landing-section final-cta-inner"><Logo compact /><div><div className="landing-kicker light">THE INTELLIGENT LAYER</div><h2>Your application already talks to AI.<br /><em>DOG makes that conversation smarter.</em></h2><p>Monitor performance. Prevent waste. Control cost. Build better AI systems.</p></div><div className="hero-actions"><button className="landing-cta inverse" onClick={onRegister}>Start building with DOG <ArrowRight size={17} /></button><a className="landing-secondary inverse-link" href="#developers">Read the documentation <ArrowUpRight size={15} /></a></div></div></section>
    </main>
    <footer className="landing-footer"><div className="footer-brand"><Logo compact /><p>Intelligence between your application and AI.</p></div><div><b>PRODUCT</b><a href="#product">Overview</a><a href="#how-it-works">How it works</a><a href="#developers">Developers</a></div><div><b>CAPABILITIES</b><a href="#solutions">RAG and agents</a><a href="#product">Cost intelligence</a><a href="#faq">Security</a></div><div><b>GET STARTED</b><button onClick={onLogin}>Log in</button><button onClick={onRegister}>Start building</button></div><div className="footer-bottom"><span>© 2026 DOG. Built for teams shipping AI.</span><span>Complex infrastructure. Simple experience.</span></div></footer>
  </div>;
}

function ArrowDownIcon() { return <span className="arrow-down">↓</span>; }
