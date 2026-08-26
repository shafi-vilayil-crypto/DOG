export const overviewMetrics = [
  { label: "Average latency", value: "428 ms", delta: "↓ 12.4%", note: "from yesterday", tone: "mint", icon: "activity", to: "/performance" },
  { label: "AI spend", value: "$248.32", delta: "$86.40", note: "optimized", tone: "blue", icon: "wallet", to: "/cost" },
  { label: "Requests", value: "184.2K", delta: "↑ 8.2%", note: "this week", tone: "amber", icon: "zap", to: "/performance" },
  { label: "Reliability", value: "99.94%", delta: "Healthy", note: "all systems", tone: "violet", icon: "shield", to: "/reliability" },
];
export const performanceData = [
  { time: "00:00", avg: 380, p50: 340, p95: 620, p99: 820 }, { time: "04:00", avg: 420, p50: 380, p95: 700, p99: 940 },
  { time: "08:00", avg: 405, p50: 360, p95: 680, p99: 900 }, { time: "12:00", avg: 470, p50: 410, p95: 820, p99: 1120 },
  { time: "16:00", avg: 430, p50: 385, p95: 760, p99: 1010 }, { time: "20:00", avg: 398, p50: 355, p95: 650, p99: 860 }, { time: "Now", avg: 428, p50: 382, p95: 812, p99: 1200 },
];
export const events = [
  { title: "Loop prevented", detail: "Repeated tool execution stopped", time: "2 min ago", type: "success" },
  { title: "Latency spike detected", detail: "P95 crossed the 800 ms threshold", time: "8 min ago", type: "warning" },
  { title: "Duplicate request prevented", detail: "Request coalesced in 46 ms", time: "14 min ago", type: "info" },
  { title: "Cache optimization", detail: "Saved an estimated $4.28", time: "21 min ago", type: "success" },
];
export const providers = [
  { name: "OpenAI", model: "gpt-5.2", status: "Operational", last: "Active 2 min ago", color: "#111827", mark: "O", models: ["gpt-5.2", "gpt-5.4", "gpt-5.4-mini"] },
  { name: "Anthropic", model: "claude-sonnet-4-6", status: "Operational", last: "Active 8 min ago", color: "#d97757", mark: "A", models: ["claude-sonnet-4-6", "claude-sonnet-5", "claude-haiku-4-5"] },
  { name: "Gemini", model: "gemini-3-flash", status: "Operational", last: "Active 12 min ago", color: "#4285f4", mark: "✦", models: ["gemini-3-flash-preview", "gemini-3.1-pro-preview", "gemini-2.5-flash"] },
  { name: "Custom provider", model: "Internal RAG pipeline", status: "Not connected", last: "Connect to begin", color: "#64748b", mark: "＋", models: [] },
];

// --- Performance ---
export const providerLatency = [
  { name: "OpenAI", avg: 380, p95: 720, p99: 1100 },
  { name: "Anthropic", avg: 420, p95: 810, p99: 1300 },
  { name: "Gemini", avg: 510, p95: 940, p99: 1500 },
  { name: "Custom", avg: 680, p95: 1400, p99: 2100 },
];
export const latencyBreakdown = [
  { label: "Time to First Token", value: "284 ms", note: "median across providers" },
  { label: "Generation", value: "510 ms", note: "P50 output stream duration" },
  { label: "Total Response", value: "794 ms", note: "end-to-end" },
  { label: "RAG lookup", value: "145 ms", note: "vector retrieval + rerank" },
  { label: "Tool execution", value: "210 ms", note: "tool-call round trip" },
];
export const slowRequestSample = {
  id: "dog_req_9f4c8a12",
  provider: "OpenAI", model: "gpt-5.2", total: 830,
  steps: [
    { step: "RAG", ms: 120 },
    { step: "LLM", ms: 480 },
    { step: "Tool", ms: 190 },
    { step: "Network", ms: 40 },
  ],
};

// --- Cost ---
export const costByProvider = [
  { name: "OpenAI", amount: 542, pct: 43, color: "#111827" },
  { name: "Anthropic", amount: 381, pct: 31, color: "#d97757" },
  { name: "Gemini", amount: 214, pct: 17, color: "#4285f4" },
  { name: "Custom", amount: 111, pct: 9, color: "#64748b" },
];
export const costByModel = [
  { provider: "OpenAI", model: "gpt-5.2", requests: "48.2K", tokens: "12.4M", cost: "$412.08" },
  { provider: "Anthropic", model: "claude-sonnet-4-6", requests: "31.8K", tokens: "9.2M", cost: "$298.44" },
  { provider: "OpenAI", model: "gpt-5.4-mini", requests: "22.1K", tokens: "4.1M", cost: "$130.20" },
  { provider: "Gemini", model: "gemini-3-flash", requests: "18.4K", tokens: "6.8M", cost: "$142.72" },
  { provider: "Anthropic", model: "claude-haiku-4-5", requests: "12.6K", tokens: "2.1M", cost: "$83.16" },
];
export const costBudget = { limit: 2000, used: 1248, remaining: 752 };

// --- Reliability ---
export const systemStatus = [
  { name: "Gateway", status: "Operational" },
  { name: "OpenAI", status: "Operational", mark: "O", color: "#111827" },
  { name: "Anthropic", status: "Operational", mark: "A", color: "#d97757" },
  { name: "Gemini", status: "Operational", mark: "✦", color: "#4285f4" },
  { name: "Redis", status: "Operational" },
];
export const incidents = [
  { title: "Loop detected", detail: "search_customer × 6 in 4.2s", severity: "high", time: "2 min ago", provider: "OpenAI", action: "BLOCKED" },
  { title: "Provider timeout", detail: "Anthropic response > 8s", severity: "medium", time: "22 min ago", provider: "Anthropic", action: "FALLBACK" },
  { title: "Rate limit approached", detail: "82% of Gemini quota used", severity: "low", time: "1 hr ago", provider: "Gemini", action: "WARN" },
  { title: "Duplicate burst", detail: "17 identical requests coalesced", severity: "low", time: "2 hr ago", provider: "OpenAI", action: "DEDUPLICATE" },
];
export const loopTrace = {
  action: "search_customer", repetitions: 6, windowSeconds: 4.2, risk: 92, decision: "BLOCKED",
  steps: [
    { step: "User Request", meta: "session sess_1a" },
    { step: "LLM (gpt-5.2)", meta: "412 ms" },
    { step: "Tool: search_customer", meta: "180 ms" },
    { step: "LLM (gpt-5.2)", meta: "398 ms" },
    { step: "Tool: search_customer", meta: "175 ms" },
    { step: "LLM (gpt-5.2)", meta: "402 ms" },
    { step: "⚠ Loop detected", meta: "6 repeats · 4.2s", warn: true },
    { step: "DOG blocked execution", meta: "5 upstream calls prevented", ok: true },
  ],
};

// --- Optimizations ---
export const optimizationCategories = [
  { name: "Duplicate prevention", count: 1284, savings: 42, icon: "copy", desc: "Identical requests coalesced inside the dedup window" },
  { name: "Loop prevention", count: 184, savings: 87, icon: "shield", desc: "Runaway tool/LLM loops halted before compounding cost" },
  { name: "Cache", count: 8421, savings: 61, icon: "database", desc: "Requests served instantly from the response cache" },
  { name: "Request coalescing", count: 2184, savings: 28, icon: "merge", desc: "Concurrent duplicates merged into a single upstream call" },
];
export const optimizationTimeline = [
  { time: "2 min ago", title: "Loop prevented", detail: "6 repeats of search_customer", savings: "$0.42", kind: "loop" },
  { time: "8 min ago", title: "Duplicate request prevented", detail: "Coalesced in 46 ms", savings: "$0.08", kind: "duplicate" },
  { time: "14 min ago", title: "Cache hit", detail: "Response served from L1", savings: "$0.02", kind: "cache" },
  { time: "22 min ago", title: "Request coalesced", detail: "3 concurrent duplicates", savings: "$0.06", kind: "coalesce" },
  { time: "36 min ago", title: "Loop prevented", detail: "4 repeats of fetch_orders", savings: "$0.28", kind: "loop" },
];

// --- API Keys ---
export const apiKeys = [
  { name: "Production", env: "Live", lastUsed: "2 min ago", created: "Aug 22, 2024", masked: "dog_live_••••••4c9a" },
  { name: "Development", env: "Test", lastUsed: "1 hour ago", created: "Aug 21, 2024", masked: "dog_test_••••••b1e2" },
  { name: "Staging", env: "Test", lastUsed: "3 days ago", created: "Aug 12, 2024", masked: "dog_test_••••••83f7" },
];
