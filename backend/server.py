"""DOG API surface.

Everything the frontend / customer app touches goes through this module.

Two surface areas:
- `/api/v1/ai/*`   — the customer-facing AI gateway (requires DOG API key)
- `/api/v1/*`      — the dashboard read-side (uses the demo tenant for
                     now; real auth will bind requests to a tenant via
                     Supabase JWT in the next iteration)
"""
import json
import logging
import os
import secrets
import ssl
import uuid
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
import certifi
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import BaseModel
import jwt  # type: ignore[import]
from jwt import PyJWKClient  # type: ignore[import]
from starlette.middleware.cors import CORSMiddleware

from dog_core import repositories as repo
from dog_core.bootstrap import ensure_demo_tenant, hash_api_key
from dog_core.db import close_pool, get_pool
from dog_core.gateway import DOGGateway, savings_for_decision
from dog_core.hot_state import build_hot_state_store
from dog_core.models import AIRequest
from dog_core.rate_limit import RateLimiter
from dog_core.secrets_vault import decrypt_secret, encrypt_secret, redacted_preview
from dog_core.ssrf import SSRFError, validate_custom_base_url

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logger = logging.getLogger(__name__)

app = FastAPI(title="DOG Platform")

_request_user_id: ContextVar[Optional[str]] = ContextVar("dog_request_user_id", default=None)
_request_tenant_id: ContextVar[Optional[str]] = ContextVar("dog_request_tenant_id", default=None)
_jwks_client: Optional[PyJWKClient] = None


def _claims_from_request(request) -> Dict[str, Any]:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        token = header.split(" ", 1)[1]
        token_header = jwt.get_unverified_header(token)
        algorithm = token_header.get("alg")
        if algorithm == "HS256":
            secret = os.environ.get("SUPABASE_JWT_SECRET")
            if not secret:
                raise HTTPException(status_code=503, detail="SUPABASE_JWT_SECRET is not configured for legacy HS256 tokens")
            return jwt.decode(token, secret, algorithms=["HS256"], audience="authenticated")
        global _jwks_client
        supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("REACT_APP_SUPABASE_URL")
        if not supabase_url:
            raise HTTPException(status_code=503, detail="SUPABASE_URL is not configured for current signing keys")
        if _jwks_client is None:
            _jwks_client = PyJWKClient(
                f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json",
                ssl_context=ssl.create_default_context(cafile=certifi.where()),
            )
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        return jwt.decode(token, signing_key.key, algorithms=[str(algorithm)], audience="authenticated")
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired session") from exc


async def _tenant_for_auth_user(user_id: str) -> Optional[str]:
    pool = await get_pool()
    return await pool.fetchval(
        """SELECT m.tenant_id::text FROM profiles p JOIN memberships m ON m.user_id = p.id WHERE p.auth_user_id = $1 ORDER BY m.created_at LIMIT 1""",
        user_id,
    )


@app.middleware("http")
async def load_auth_context(request, call_next):
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        claims = _claims_from_request(request)
        user_id = str(claims.get("sub"))
        user_token = _request_user_id.set(user_id)
        tenant = await _tenant_for_auth_user(user_id)
        tenant_token = _request_tenant_id.set(tenant)
        try:
            return await call_next(request)
        finally:
            _request_user_id.reset(user_token)
            _request_tenant_id.reset(tenant_token)
    return await call_next(request)

# Populated at startup. Holds the demo tenant id until real auth arrives.
_demo_tenant_id: Optional[str] = None
_hot_state = build_hot_state_store()
_rate_limiter = RateLimiter(_hot_state)
_status_records: List[Dict[str, Any]] = []


async def _telemetry_sink(payload: Dict[str, Any]) -> None:
    """Persist an AI request + any optimization/cost/loop events.

    Called from `asyncio.create_task` so a slow DB never impacts a
    provider round-trip.
    """
    try:
        pool = await get_pool()
        provider_type = (payload["provider"] or "").upper()
        provider_row = await repo.get_provider_row(pool, payload["tenant_id"], provider_type)
        intelligence = payload.get("intelligence", {})
        decision = intelligence.get("decision", "ALLOW")
        duplicate = intelligence.get("duplicate")
        loop = intelligence.get("loop")
        request_id = await repo.record_ai_request(pool, {
            "tenant_id": payload["tenant_id"],
            "session_id": payload.get("session_id"),
            "provider_id": provider_row["id"] if provider_row else None,
            "provider_type": provider_type,
            "model_name": payload["model"],
            "request_fingerprint": intelligence.get("exact_fingerprint") or "n/a",
            "normalized_fingerprint": intelligence.get("normalized_fingerprint") or "n/a",
            "status": "COMPLETED",
            "started_at": datetime.fromtimestamp(payload["started_at"], tz=timezone.utc),
            "completed_at": datetime.fromtimestamp(payload["completed_at"], tz=timezone.utc),
            "total_latency_ms": payload["total_latency_ms"],
            "request_latency_ms": payload["total_latency_ms"],
            "input_tokens": payload["input_tokens"],
            "output_tokens": payload["output_tokens"],
            "estimated_cost": payload["estimated_cost"],
            "decision": decision,
            "cache_hit": decision == "CACHE",
            "duplicate_detected": bool(duplicate and getattr(duplicate, "is_duplicate", False)),
            "loop_detected": bool(loop and getattr(loop, "is_loop", False)),
        })
        await repo.record_cost(pool, {
            "tenant_id": payload["tenant_id"],
            "request_id": request_id,
            "provider_id": provider_row["id"] if provider_row else None,
            "provider_type": provider_type,
            "model_name": payload["model"],
            "input_tokens": payload["input_tokens"],
            "output_tokens": payload["output_tokens"],
            "total_tokens": payload["input_tokens"] + payload["output_tokens"],
            "estimated_cost": payload["estimated_cost"],
        })
        savings = savings_for_decision(payload["provider"], decision)
        if savings > 0:
            event_type = {
                "DEDUPLICATE": "DUPLICATE_PREVENTED",
                "BLOCK": "LOOP_PREVENTED",
                "CACHE": "CACHE_HIT",
                "REQUEST_COALESCED": "REQUEST_COALESCED",
            }.get(decision, "DUPLICATE_PREVENTED")
            await repo.record_optimization_event(pool, payload["tenant_id"], request_id, event_type, savings, {
                "provider": payload["provider"], "model": payload["model"],
                "decision": decision,
            })
        if loop and getattr(loop, "is_loop", False):
            await repo.record_loop_event(pool, {
                "tenant_id": payload["tenant_id"],
                "session_id": payload.get("session_id"),
                "request_id": request_id,
                "fingerprint": intelligence.get("normalized_fingerprint") or "n/a",
                "repetition_count": getattr(loop, "repetition_count", 0),
                "risk_score": getattr(loop, "score", 0) * 100,
                "action": "BLOCK" if decision == "BLOCK" else "WARN",
                "reason": getattr(loop, "reason", None),
            })
        if duplicate and getattr(duplicate, "is_duplicate", False):
            await repo.record_duplicate_event(pool, {
                "tenant_id": payload["tenant_id"],
                "request_id": request_id,
                "fingerprint": intelligence.get("normalized_fingerprint") or "n/a",
                "repetition_count": getattr(duplicate, "repetition_count", 0),
                "action": decision,
            })
    except Exception:
        logger.exception("Telemetry persistence failed — fail-open")


async def _provider_credential_loader(tenant_id: str, provider: str) -> Optional[Dict[str, str]]:
    """Load only the selected workspace credential for a gateway request."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """SELECT c.ciphertext, c.nonce, p.base_url
           FROM provider_credentials c
           JOIN providers p ON p.id = c.provider_id
           WHERE c.tenant_id = $1 AND p.provider_type = $2 AND p.status = 'CONNECTED'""",
        tenant_id, provider.upper(),
    )
    if not row:
        return None
    try:
        return {"api_key": decrypt_secret(row["ciphertext"], row["nonce"]), "base_url": row["base_url"]}
    except Exception:
        logger.exception("Unable to decrypt provider credential for tenant %s", tenant_id)
        return None


gateway = DOGGateway(_telemetry_sink, credential_loader=_provider_credential_loader)


# ---------------------------------------------------------------------
# Auth helpers (DOG API key for the gateway; demo tenant for dashboard)
# ---------------------------------------------------------------------
async def authenticate_dog_key(api_key: Optional[str]) -> Dict[str, Any]:
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing DOG API key")
    pool = await get_pool()
    row = await repo.resolve_tenant_by_api_key(pool, hash_api_key(api_key))
    if not row:
        raise HTTPException(status_code=401, detail="Invalid DOG API key")
    if row.get("expires_at") and row["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="DOG API key expired")
    policies = await repo.get_tenant_policies(pool, row["tenant_id"])
    limit = int(policies.get("max_requests_per_minute", 600)) if policies else 600
    allowed, count = await _rate_limiter.check(str(row["tenant_id"]), limit)
    if not allowed:
        raise HTTPException(status_code=429, detail=f"Rate limit exceeded ({count}/{limit} per minute)")
    return row


async def authenticate_gateway_request(api_key: Optional[str]) -> Dict[str, Any]:
    """Allow the signed-in Playground and external DOG API clients."""
    if api_key:
        return await authenticate_dog_key(api_key)
    tenant_id = _request_tenant_id.get()
    if tenant_id and _request_user_id.get():
        return {"tenant_id": tenant_id}
    raise HTTPException(status_code=401, detail="Missing DOG API key or signed-in workspace session")


async def _current_tenant_id() -> str:
    tenant_id = _request_tenant_id.get()
    if not tenant_id:
        raise HTTPException(status_code=401, detail="Sign in and create a workspace to continue")
    return tenant_id


async def _require_admin() -> str:
    tenant_id = await _current_tenant_id()
    pool = await get_pool()
    role = await pool.fetchval(
        """SELECT m.role FROM memberships m JOIN profiles p ON p.id = m.user_id
           WHERE m.tenant_id = $1 AND p.auth_user_id = $2""",
        tenant_id, _request_user_id.get(),
    )
    if role not in {"OWNER", "ADMIN"}:
        raise HTTPException(status_code=403, detail="Workspace admin access required")
    return tenant_id


# ---------------------------------------------------------------------
# Pydantic
# ---------------------------------------------------------------------
class ChatMessage(BaseModel):
    role: str
    content: str


class AIChatInput(BaseModel):
    messages: List[ChatMessage]
    provider: str = "openai"
    model: str = "gpt-5.2"
    session_id: Optional[str] = None
    tools: Optional[List[Dict[str, Any]]] = None
    metadata: Dict[str, Any] = {}


class CreateApiKeyInput(BaseModel):
    name: str
    environment: str = "test"
    expires_in_days: Optional[int] = None


class SetProviderCredentialInput(BaseModel):
    api_key: str
    base_url: Optional[str] = None


class UpdateProviderInput(BaseModel):
    base_url: Optional[str] = None
    status: Optional[str] = None


class UpdatePoliciesInput(BaseModel):
    latency_full_ms: Optional[int] = None
    latency_short_ms: Optional[int] = None
    latency_critical_ms: Optional[int] = None
    loop_window_ms: Optional[int] = None
    loop_max_repetitions: Optional[int] = None
    loop_block_threshold: Optional[int] = None
    duplicate_window_ms: Optional[int] = None
    cache_enabled: Optional[bool] = None
    cache_ttl_seconds: Optional[int] = None
    max_session_cost: Optional[float] = None
    max_request_tokens: Optional[int] = None


class UpdateMemberInput(BaseModel):
    role: str


class CreateStatusInput(BaseModel):
    client_name: str


# ---------------------------------------------------------------------
# Startup / shutdown
# ---------------------------------------------------------------------
@app.on_event("startup")
async def on_startup() -> None:
    global _demo_tenant_id
    pool = await get_pool()
    _demo_tenant_id = await ensure_demo_tenant(pool)
    logger.info("DOG demo tenant ready: %s", _demo_tenant_id)


@app.on_event("shutdown")
async def on_shutdown() -> None:
    await close_pool()


@app.post("/api/v1/auth/bootstrap")
@app.post("/v1/auth/bootstrap")
async def auth_bootstrap(request: Request):
    claims = _claims_from_request(request)
    auth_user_id = str(claims.get("sub"))
    email = claims.get("email") or f"user-{auth_user_id[:8]}@dog.local"
    metadata = claims.get("user_metadata") or {}
    display_name = metadata.get("display_name") or email.split("@")[0]
    pool = await get_pool()
    from dog_core.bootstrap import _seed_providers
    async with pool.acquire() as conn:
        async with conn.transaction():
            profile_id = await conn.fetchval(
                """INSERT INTO profiles (auth_user_id, email, display_name) VALUES ($1, $2, $3)
                   ON CONFLICT (auth_user_id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name
                   RETURNING id""",
                auth_user_id, email, display_name,
            )
            tenant_id = await conn.fetchval(
                """SELECT tenant_id FROM memberships WHERE user_id = $1 ORDER BY created_at LIMIT 1""",
                profile_id,
            )
            if not tenant_id:
                tenant_id = await conn.fetchval(
                    "INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id",
                    f"{display_name}'s workspace", f"workspace-{uuid.uuid4().hex[:12]}",
                )
                await conn.execute(
                    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'OWNER')",
                    tenant_id, profile_id,
                )
                await conn.execute(
                    "INSERT INTO tenant_policies (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING",
                    tenant_id,
                )
                await _seed_providers(conn, str(tenant_id))
            tenant_name = await conn.fetchval("SELECT name FROM tenants WHERE id = $1", tenant_id)
    _request_tenant_id.set(str(tenant_id))
    return {"tenant_id": str(tenant_id), "tenant_name": tenant_name, "display_name": display_name}


# ---------------------------------------------------------------------
# Redirect for direct-refresh on SPA route
# ---------------------------------------------------------------------
@app.get("/api-keys", include_in_schema=False)
async def api_keys_spa_bridge():
    return RedirectResponse(url="/?redirect=api-keys", status_code=307)


# ---------------------------------------------------------------------
# AI Gateway (customer surface)
# ---------------------------------------------------------------------
def _to_ai_request(payload: AIChatInput, tenant_id: str, stream: bool = False) -> AIRequest:
    return AIRequest(
        messages=[m.model_dump() for m in payload.messages],
        provider=payload.provider,
        model=payload.model,
        tenant_id=tenant_id,
        session_id=payload.session_id,
        tools=payload.tools,
        metadata=payload.metadata,
        stream=stream,
    )


@app.post("/api/v1/ai/chat")
@app.post("/v1/ai/chat")
async def ai_chat(payload: AIChatInput, x_dog_api_key: Optional[str] = Header(default=None)):
    auth = await authenticate_gateway_request(x_dog_api_key)
    try:
        return await gateway.chat(_to_ai_request(payload, str(auth["tenant_id"])))
    except Exception as exc:
        logger.exception("Provider request failed")
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/v1/ai/stream")
@app.post("/v1/ai/stream")
async def ai_stream(payload: AIChatInput, x_dog_api_key: Optional[str] = Header(default=None)):
    auth = await authenticate_gateway_request(x_dog_api_key)

    async def event_stream():
        async for item in gateway.stream(_to_ai_request(payload, str(auth["tenant_id"]), stream=True)):
            yield f"data: {json.dumps(item)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"})


# ---------------------------------------------------------------------
# Dashboard read surface
# ---------------------------------------------------------------------
@app.get("/api/v1/providers")
@app.get("/v1/providers")
async def get_providers(x_dog_api_key: Optional[str] = Header(default=None)):
    from providers.factory import provider_mode
    pool = await get_pool()
    auth = await authenticate_gateway_request(x_dog_api_key)
    tenant_id = str(auth["tenant_id"])
    rows = await repo.list_providers(pool, tenant_id)
    for row in rows:
        row["mode"] = provider_mode(row["provider_type"].lower(), row.get("credential_configured", False))
        row["capabilities"] = {"streaming": True}
        row["name_short"] = row["provider_type"].capitalize()
    return {"providers": rows}


@app.get("/api/v1/overview")
@app.get("/v1/overview")
async def overview():
    pool = await get_pool()
    tenant_id = await _current_tenant_id()
    return await repo.overview_snapshot(pool, tenant_id)


@app.get("/api/v1/performance")
@app.get("/v1/performance")
async def performance(hours: int = Query(default=24, ge=1, le=720)):
    pool = await get_pool()
    tenant_id = await _current_tenant_id()
    return await repo.performance_snapshot(pool, tenant_id, hours)


@app.get("/api/v1/cost")
@app.get("/v1/cost")
async def cost(days: int = Query(default=30, ge=1, le=90)):
    pool = await get_pool()
    tenant_id = await _current_tenant_id()
    return await repo.cost_snapshot(pool, tenant_id, days)


@app.get("/api/v1/reliability")
@app.get("/v1/reliability")
async def reliability():
    pool = await get_pool()
    tenant_id = await _current_tenant_id()
    return await repo.reliability_snapshot(pool, tenant_id)


@app.get("/api/v1/optimizations")
@app.get("/v1/optimizations")
async def optimizations(days: int = Query(default=30, ge=1, le=90)):
    pool = await get_pool()
    tenant_id = await _current_tenant_id()
    return await repo.optimizations_snapshot(pool, tenant_id, days)


@app.get("/api/v1/savings/today")
@app.get("/v1/savings/today")
async def savings_today():
    pool = await get_pool()
    tenant_id = await _current_tenant_id()
    return await repo.savings_today(pool, tenant_id)


@app.get("/api/v1/api-keys")
@app.get("/v1/api-keys")
async def get_api_keys():
    pool = await get_pool()
    tenant_id = await _current_tenant_id()
    return {"api_keys": await repo.list_api_keys(pool, tenant_id)}


@app.get("/api/v1/admin/members")
@app.get("/v1/admin/members")
async def admin_members():
    tenant_id = await _require_admin()
    pool = await get_pool()
    rows = await pool.fetch(
        """SELECT m.id, m.role, m.created_at, p.email, p.display_name
           FROM memberships m JOIN profiles p ON p.id = m.user_id
           WHERE m.tenant_id = $1 ORDER BY m.created_at""", tenant_id,
    )
    return {"members": [{"id": str(r["id"]), "role": r["role"], "email": r["email"], "display_name": r["display_name"], "created_at": r["created_at"].isoformat()} for r in rows]}


@app.patch("/api/v1/admin/members/{member_id}")
@app.patch("/v1/admin/members/{member_id}")
async def admin_update_member(member_id: str, payload: UpdateMemberInput):
    tenant_id = await _require_admin()
    if payload.role not in {"ADMIN", "MEMBER", "VIEWER"}:
        raise HTTPException(status_code=400, detail="Invalid workspace role")
    pool = await get_pool()
    result = await pool.execute("UPDATE memberships SET role = $1 WHERE id = $2 AND tenant_id = $3", payload.role, member_id, tenant_id)
    if result.endswith(" 0"):
        raise HTTPException(status_code=404, detail="Member not found")
    return {"updated": True, "role": payload.role}


@app.delete("/api/v1/admin/members/{member_id}")
@app.delete("/v1/admin/members/{member_id}")
async def admin_remove_member(member_id: str):
    tenant_id = await _require_admin()
    pool = await get_pool()
    result = await pool.execute("DELETE FROM memberships WHERE id = $1 AND tenant_id = $2 AND role <> 'OWNER'", member_id, tenant_id)
    if result.endswith(" 0"):
        raise HTTPException(status_code=404, detail="Member not found or cannot remove owner")
    return {"removed": True}


@app.get("/api/v1/policies")
@app.get("/v1/policies")
async def get_policies():
    pool = await get_pool()
    tenant_id = await _current_tenant_id()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM tenant_policies WHERE tenant_id = $1", tenant_id)
    return dict(row) if row else {}


@app.patch("/api/v1/policies")
@app.patch("/v1/policies")
async def update_policies(payload: UpdatePoliciesInput):
    pool = await get_pool()
    tenant_id = await _current_tenant_id()
    values = payload.model_dump(exclude_none=True)
    allowed = set(UpdatePoliciesInput.model_fields)
    values = {key: value for key, value in values.items() if key in allowed}
    if values:
        assignments = ", ".join(f"{key} = ${index + 2}" for index, key in enumerate(values))
        await pool.execute(
            f"UPDATE tenant_policies SET {assignments}, updated_at = now() WHERE tenant_id = $1",
            tenant_id, *values.values(),
        )
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM tenant_policies WHERE tenant_id = $1", tenant_id)
    return dict(row) if row else {}


@app.post("/api/v1/api-keys")
@app.post("/v1/api-keys")
async def create_api_key(payload: CreateApiKeyInput):
    pool = await get_pool()
    tenant_id = await _current_tenant_id()
    env = payload.environment if payload.environment in {"test", "live"} else "test"
    secret = f"dog_{env}_{secrets.token_urlsafe(24)}"
    expires_at = None
    if payload.expires_in_days:
        expires_at = datetime.now(timezone.utc) + timedelta(days=int(payload.expires_in_days))
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO api_keys (tenant_id, name, key_prefix, key_hash, environment, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            tenant_id, payload.name, secret[:8], hash_api_key(secret), env, expires_at,
        )
    return {"secret": secret, "name": payload.name, "environment": env,
            "expires_at": expires_at.isoformat() if expires_at else None}


@app.post("/api/v1/api-keys/{key_id}/rotate")
@app.post("/v1/api-keys/{key_id}/rotate")
async def rotate_api_key(key_id: str):
    pool = await get_pool()
    tenant_id = await _current_tenant_id()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT environment, name FROM api_keys WHERE id = $1 AND tenant_id = $2",
            key_id, tenant_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="API key not found")
        new_secret = f"dog_{row['environment']}_{secrets.token_urlsafe(24)}"
        await conn.execute(
            """
            UPDATE api_keys
            SET key_prefix = $1, key_hash = $2, revoked_at = NULL, last_used_at = NULL
            WHERE id = $3
            """,
            new_secret[:8], hash_api_key(new_secret), key_id,
        )
    return {"secret": new_secret, "name": row["name"], "environment": row["environment"]}


@app.post("/api/v1/api-keys/{key_id}/revoke")
@app.post("/v1/api-keys/{key_id}/revoke")
async def revoke_api_key(key_id: str):
    pool = await get_pool()
    tenant_id = await _current_tenant_id()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL",
            key_id, tenant_id,
        )
    if result.endswith(" 0"):
        raise HTTPException(status_code=404, detail="API key not found or already revoked")
    return {"revoked": True}


# ---------------------------------------------------------------------
# Provider credential vault — safe metadata only crosses to browser.
# ---------------------------------------------------------------------
@app.post("/api/v1/providers/{provider_id}/credential")
@app.post("/v1/providers/{provider_id}/credential")
async def set_provider_credential(provider_id: str, payload: SetProviderCredentialInput):
    pool = await get_pool()
    tenant_id = await _current_tenant_id()
    async with pool.acquire() as conn:
        provider = await conn.fetchrow(
            "SELECT id, provider_type, base_url FROM providers WHERE id = $1 AND tenant_id = $2",
            provider_id, tenant_id,
        )
        if not provider:
            raise HTTPException(status_code=404, detail="Provider not found")
        # SSRF check for custom providers before we accept anything
        base_url = payload.base_url or provider["base_url"]
        if provider["provider_type"] == "CUSTOM":
            try:
                validate_custom_base_url(base_url or "")
            except SSRFError as exc:
                raise HTTPException(status_code=400, detail=f"Base URL rejected: {exc}") from exc
        encrypted = encrypt_secret(payload.api_key)
        preview = redacted_preview(payload.api_key)
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                INSERT INTO provider_credentials (tenant_id, provider_id, ciphertext, nonce, preview, rotated_at)
                VALUES ($1, $2, $3, $4, $5, now())
                ON CONFLICT (provider_id) DO UPDATE SET
                    ciphertext = EXCLUDED.ciphertext,
                    nonce = EXCLUDED.nonce,
                    preview = EXCLUDED.preview,
                    rotated_at = now()
                RETURNING id
                """,
                tenant_id, provider_id, encrypted.ciphertext_b64, encrypted.nonce_b64, preview,
            )
            await conn.execute(
                "UPDATE providers SET secret_reference = $1, base_url = COALESCE($2, base_url), updated_at = now() WHERE id = $3",
                row["id"], base_url, provider_id,
            )
    # Never return the plaintext credential.
    return {"provider_id": provider_id, "credential_configured": True, "credential_preview": preview}


@app.delete("/api/v1/providers/{provider_id}/credential")
@app.delete("/v1/providers/{provider_id}/credential")
async def delete_provider_credential(provider_id: str):
    pool = await get_pool()
    tenant_id = await _current_tenant_id()
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            DELETE FROM provider_credentials
            WHERE provider_id = $1 AND tenant_id = $2
            """,
            provider_id, tenant_id,
        )
        await conn.execute(
            "UPDATE providers SET secret_reference = NULL, updated_at = now() WHERE id = $1 AND tenant_id = $2",
            provider_id, tenant_id,
        )
    return {"provider_id": provider_id, "credential_configured": False, "removed": not result.endswith(" 0")}


@app.patch("/api/v1/providers/{provider_id}")
@app.patch("/v1/providers/{provider_id}")
async def update_provider(provider_id: str, payload: UpdateProviderInput):
    pool = await get_pool()
    tenant_id = await _current_tenant_id()
    async with pool.acquire() as conn:
        provider = await conn.fetchrow(
            "SELECT provider_type FROM providers WHERE id = $1 AND tenant_id = $2",
            provider_id, tenant_id,
        )
        if not provider:
            raise HTTPException(status_code=404, detail="Provider not found")
        if payload.base_url and provider["provider_type"] == "CUSTOM":
            try:
                validate_custom_base_url(payload.base_url)
            except SSRFError as exc:
                raise HTTPException(status_code=400, detail=f"Base URL rejected: {exc}") from exc
        await conn.execute(
            """
            UPDATE providers
            SET base_url = COALESCE($1, base_url),
                status = COALESCE($2, status),
                updated_at = now()
            WHERE id = $3
            """,
            payload.base_url, payload.status, provider_id,
        )
    return {"provider_id": provider_id, "updated": True}


@app.get("/api/v1/telemetry")
@app.get("/v1/telemetry")
async def get_telemetry(x_dog_api_key: Optional[str] = Header(default=None)):
    auth = await authenticate_dog_key(x_dog_api_key)
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT provider_type, model_name, decision, total_latency_ms, estimated_cost, created_at
            FROM ai_requests
            WHERE tenant_id = $1
            ORDER BY created_at DESC LIMIT 100
            """,
            auth["tenant_id"],
        )
    events = [{"event": "AI_RESPONSE_COMPLETED", **dict(r)} for r in rows]
    return {"events": events, "count": len(events)}


# ---------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------
@app.post("/api/status")
async def create_status(payload: CreateStatusInput):
    record = {
        "id": str(uuid.uuid4()),
        "client_name": payload.client_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _status_records.append(record)
    return record


@app.get("/api/status")
async def list_status():
    return _status_records


@app.get("/api/")
async def root():
    return {"message": "Hello World"}


# ---------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
