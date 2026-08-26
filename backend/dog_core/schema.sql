-- DOG platform schema — Supabase / PostgreSQL
-- This file is idempotent so it can safely re-run on every backend boot.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------------------------
-- Tenants & membership
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;

CREATE TABLE IF NOT EXISTS memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('OWNER','ADMIN','MEMBER','VIEWER')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, user_id)
);

-- --------------------------------------------------------------------
-- Providers, models, policies
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    provider_type TEXT NOT NULL CHECK (provider_type IN ('OPENAI','ANTHROPIC','GEMINI','CUSTOM')),
    base_url TEXT,
    status TEXT NOT NULL DEFAULT 'CONNECTED',
    secret_reference UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, provider_type)
);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS secret_reference UUID;

-- ------------------------------------------------------------
-- Provider credential vault — AES-GCM encrypted, never exposed.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS provider_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    ciphertext TEXT NOT NULL,
    nonce TEXT NOT NULL,
    preview TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    rotated_at TIMESTAMPTZ,
    UNIQUE (provider_id)
);

CREATE TABLE IF NOT EXISTS models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_name TEXT,
    input_cost_per_million_tokens NUMERIC(10,4) NOT NULL DEFAULT 0,
    output_cost_per_million_tokens NUMERIC(10,4) NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider_id, name)
);

CREATE TABLE IF NOT EXISTS tenant_policies (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    latency_full_ms INT NOT NULL DEFAULT 400,
    latency_short_ms INT NOT NULL DEFAULT 800,
    latency_critical_ms INT NOT NULL DEFAULT 1500,
    loop_window_ms INT NOT NULL DEFAULT 5000,
    loop_max_repetitions INT NOT NULL DEFAULT 4,
    loop_block_threshold INT NOT NULL DEFAULT 80,
    duplicate_window_ms INT NOT NULL DEFAULT 60000,
    cache_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    cache_ttl_seconds INT NOT NULL DEFAULT 900,
    max_requests_per_minute INT NOT NULL DEFAULT 600,
    max_session_cost NUMERIC(10,4) NOT NULL DEFAULT 5,
    max_request_tokens INT NOT NULL DEFAULT 8000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------
-- API keys (customer app → DOG)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    environment TEXT NOT NULL CHECK (environment IN ('test','live')),
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_keys_tenant_idx ON api_keys(tenant_id);

-- --------------------------------------------------------------------
-- Telemetry: requests / loops / duplicates / optimizations / costs
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    session_id TEXT,
    provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
    provider_type TEXT NOT NULL,
    model_name TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    normalized_fingerprint TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    first_token_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    request_latency_ms NUMERIC(10,2),
    ttft_ms NUMERIC(10,2),
    total_latency_ms NUMERIC(10,2),
    input_tokens INT,
    output_tokens INT,
    estimated_cost NUMERIC(10,6),
    decision TEXT,
    cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
    duplicate_detected BOOLEAN NOT NULL DEFAULT FALSE,
    loop_detected BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_requests_tenant_created_idx ON ai_requests(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_requests_fingerprint_idx ON ai_requests(tenant_id, normalized_fingerprint);

CREATE TABLE IF NOT EXISTS loop_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    session_id TEXT,
    request_id UUID REFERENCES ai_requests(id) ON DELETE SET NULL,
    fingerprint TEXT NOT NULL,
    repetition_count INT NOT NULL,
    risk_score NUMERIC(5,2) NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('WARN','BLOCK','ALLOW')),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loop_events_tenant_created_idx ON loop_events(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS duplicate_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    request_id UUID REFERENCES ai_requests(id) ON DELETE SET NULL,
    previous_request_id UUID REFERENCES ai_requests(id) ON DELETE SET NULL,
    fingerprint TEXT NOT NULL,
    repetition_count INT NOT NULL,
    action TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS duplicate_events_tenant_created_idx ON duplicate_events(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS optimization_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    request_id UUID REFERENCES ai_requests(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('CACHE_HIT','DUPLICATE_PREVENTED','LOOP_PREVENTED','REQUEST_COALESCED','LATENCY_STRATEGY_CHANGED','FALLBACK_TRIGGERED','REQUEST_THROTTLED')),
    estimated_savings NUMERIC(10,4) NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS optimization_events_tenant_created_idx ON optimization_events(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cost_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    request_id UUID REFERENCES ai_requests(id) ON DELETE SET NULL,
    provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
    provider_type TEXT NOT NULL,
    model_name TEXT NOT NULL,
    input_tokens INT NOT NULL DEFAULT 0,
    output_tokens INT NOT NULL DEFAULT 0,
    total_tokens INT NOT NULL DEFAULT 0,
    estimated_cost NUMERIC(10,6) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cost_records_tenant_created_idx ON cost_records(tenant_id, created_at DESC);

-- --------------------------------------------------------------------
-- Aggregations
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_usage (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    request_count INT NOT NULL DEFAULT 0,
    total_tokens INT NOT NULL DEFAULT 0,
    total_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
    prevented_requests INT NOT NULL DEFAULT 0,
    prevented_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
    cache_hits INT NOT NULL DEFAULT 0,
    loop_events INT NOT NULL DEFAULT 0,
    duplicate_events INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, day)
);
