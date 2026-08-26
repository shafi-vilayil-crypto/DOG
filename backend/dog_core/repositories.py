"""SQL-facing repositories for the DOG platform.

The gateway hot path calls these via `asyncio.create_task(...)` so a
slow database write never blocks a customer request. Read-side helpers
serve the dashboard endpoints.
"""
import json
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

import asyncpg


async def resolve_tenant_by_api_key(pool: asyncpg.Pool, key_hash: str) -> Optional[Dict[str, Any]]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT k.id AS api_key_id, k.tenant_id, k.name, k.environment,
                   k.expires_at, t.name AS tenant_name
            FROM api_keys k
            JOIN tenants t ON t.id = k.tenant_id
            WHERE k.key_hash = $1 AND k.revoked_at IS NULL
            """,
            key_hash,
        )
        if not row:
            return None
        # touch last_used asynchronously to keep the auth path fast
        await conn.execute(
            "UPDATE api_keys SET last_used_at = now() WHERE id = $1",
            row["api_key_id"],
        )
        return dict(row)


async def get_provider_row(pool: asyncpg.Pool, tenant_id: str, provider_type: str) -> Optional[Dict[str, Any]]:
    provider_type = provider_type.upper()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM providers WHERE tenant_id = $1 AND provider_type = $2",
            tenant_id, provider_type,
        )
        return dict(row) if row else None


async def get_tenant_policies(pool: asyncpg.Pool, tenant_id: str) -> Dict[str, Any]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM tenant_policies WHERE tenant_id = $1", tenant_id,
        )
        return dict(row) if row else {}


async def record_ai_request(pool: asyncpg.Pool, payload: Dict[str, Any]) -> Optional[str]:
    async with pool.acquire() as conn:
        return await conn.fetchval(
            """
            INSERT INTO ai_requests (
                tenant_id, session_id, provider_id, provider_type, model_name,
                request_fingerprint, normalized_fingerprint, status,
                started_at, completed_at,
                request_latency_ms, ttft_ms, total_latency_ms,
                input_tokens, output_tokens, estimated_cost,
                decision, cache_hit, duplicate_detected, loop_detected
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
            ) RETURNING id
            """,
            payload["tenant_id"], payload.get("session_id"),
            payload.get("provider_id"), payload["provider_type"], payload["model_name"],
            payload["request_fingerprint"], payload["normalized_fingerprint"],
            payload.get("status", "COMPLETED"),
            payload.get("started_at"), payload.get("completed_at"),
            payload.get("request_latency_ms"), payload.get("ttft_ms"),
            payload.get("total_latency_ms"),
            payload.get("input_tokens", 0), payload.get("output_tokens", 0),
            payload.get("estimated_cost", 0),
            payload.get("decision", "ALLOW"),
            payload.get("cache_hit", False),
            payload.get("duplicate_detected", False),
            payload.get("loop_detected", False),
        )


async def record_optimization_event(pool: asyncpg.Pool, tenant_id: str, request_id: Optional[str], event_type: str, savings: float, metadata: Dict[str, Any]) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO optimization_events (tenant_id, request_id, type, estimated_savings, metadata)
            VALUES ($1, $2, $3, $4, $5::jsonb)
            """,
            tenant_id, request_id, event_type, savings, json.dumps(metadata),
        )


async def record_cost(pool: asyncpg.Pool, payload: Dict[str, Any]) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO cost_records (
                tenant_id, request_id, provider_id, provider_type, model_name,
                input_tokens, output_tokens, total_tokens, estimated_cost
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            """,
            payload["tenant_id"], payload.get("request_id"),
            payload.get("provider_id"), payload["provider_type"], payload["model_name"],
            payload.get("input_tokens", 0), payload.get("output_tokens", 0),
            payload.get("total_tokens", 0), payload.get("estimated_cost", 0),
        )


async def record_loop_event(pool: asyncpg.Pool, payload: Dict[str, Any]) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO loop_events (tenant_id, session_id, request_id, fingerprint, repetition_count, risk_score, action, reason)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            """,
            payload["tenant_id"], payload.get("session_id"), payload.get("request_id"),
            payload["fingerprint"], payload["repetition_count"], payload["risk_score"],
            payload["action"], payload.get("reason"),
        )


async def record_duplicate_event(pool: asyncpg.Pool, payload: Dict[str, Any]) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO duplicate_events (tenant_id, request_id, previous_request_id, fingerprint, repetition_count, action)
            VALUES ($1,$2,$3,$4,$5,$6)
            """,
            payload["tenant_id"], payload.get("request_id"), payload.get("previous_request_id"),
            payload["fingerprint"], payload["repetition_count"], payload["action"],
        )


# ---------------------------------------------------------------------
# Dashboard read-side
# ---------------------------------------------------------------------
async def overview_snapshot(pool: asyncpg.Pool, tenant_id: str) -> Dict[str, Any]:
    async with pool.acquire() as conn:
        totals = await conn.fetchrow(
            """
            SELECT
                COUNT(*)::int AS requests_24h,
                COALESCE(AVG(total_latency_ms),0)::float AS avg_latency_ms,
                COALESCE(SUM(estimated_cost),0)::float AS spend_24h,
                COALESCE(SUM(input_tokens)+SUM(output_tokens),0)::int AS tokens_24h,
                COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS success_24h
            FROM ai_requests
            WHERE tenant_id = $1 AND created_at > now() - interval '24 hours'
            """,
            tenant_id,
        )
        prevented = await conn.fetchrow(
            """
            SELECT COUNT(*)::int AS count, COALESCE(SUM(estimated_savings),0)::float AS savings
            FROM optimization_events
            WHERE tenant_id = $1 AND created_at > now() - interval '24 hours'
            """,
            tenant_id,
        )
        loops = await conn.fetchval(
            "SELECT COUNT(*)::int FROM loop_events WHERE tenant_id = $1 AND created_at::date = CURRENT_DATE",
            tenant_id,
        )
        events = await conn.fetch(
            """
            SELECT type, estimated_savings, metadata::text AS metadata_json, created_at
            FROM optimization_events
            WHERE tenant_id = $1
            ORDER BY created_at DESC LIMIT 5
            """,
            tenant_id,
        )
        reliability = 1.0
        if totals["requests_24h"]:
            reliability = totals["success_24h"] / totals["requests_24h"]
    return {
        "requests_24h": totals["requests_24h"],
        "avg_latency_ms": round(totals["avg_latency_ms"], 2),
        "spend_24h": round(totals["spend_24h"], 4),
        "tokens_24h": totals["tokens_24h"],
        "reliability_24h": round(reliability, 4),
        "prevented_calls_24h": prevented["count"],
        "prevented_savings_24h": round(prevented["savings"], 4),
        "loops_today": loops or 0,
        "recent_events": [
            {
                "type": ev["type"],
                "savings": float(ev["estimated_savings"]),
                "metadata": json.loads(ev["metadata_json"]) if ev["metadata_json"] else {},
                "created_at": ev["created_at"].isoformat(),
            } for ev in events
        ],
    }


async def savings_today(pool: asyncpg.Pool, tenant_id: str) -> Dict[str, Any]:
    async with pool.acquire() as conn:
        totals = await conn.fetchrow(
            """
            SELECT COUNT(*)::int AS prevented_calls, COALESCE(SUM(estimated_savings),0)::float AS saved_usd
            FROM optimization_events
            WHERE tenant_id = $1 AND created_at::date = CURRENT_DATE
            """,
            tenant_id,
        )
        by_type = await conn.fetch(
            """
            SELECT type, COUNT(*)::int AS calls, COALESCE(SUM(estimated_savings),0)::float AS saved
            FROM optimization_events
            WHERE tenant_id = $1 AND created_at::date = CURRENT_DATE
            GROUP BY type
            """,
            tenant_id,
        )
    reasons = {
        "DUPLICATE_PREVENTED": "Duplicate prevention",
        "LOOP_PREVENTED": "Loop prevention",
        "CACHE_HIT": "Cache hit",
        "REQUEST_COALESCED": "Request coalescing",
    }
    by_reason: Dict[str, Dict[str, float]] = {}
    for row in by_type:
        label = reasons.get(row["type"], row["type"])
        by_reason[label] = {"calls": row["calls"], "saved_usd": round(row["saved"], 2)}
    return {
        "saved_usd": round(totals["saved_usd"], 2),
        "prevented_calls": totals["prevented_calls"],
        "by_reason": by_reason,
        "since": datetime.combine(date.today(), datetime.min.time(), tzinfo=timezone.utc).isoformat(),
        "as_of": datetime.now(timezone.utc).isoformat(),
    }


async def performance_snapshot(pool: asyncpg.Pool, tenant_id: str, hours: int = 24) -> Dict[str, Any]:
    hours = max(1, min(int(hours), 24 * 30))
    async with pool.acquire() as conn:
        by_provider = await conn.fetch(
            """
            SELECT provider_type AS name,
                   COALESCE(AVG(total_latency_ms),0)::float AS avg,
                   COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY total_latency_ms),0)::float AS p95,
                   COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY total_latency_ms),0)::float AS p99
            FROM ai_requests
            WHERE tenant_id = $1 AND created_at > now() - ($2 * interval '1 hour')
            GROUP BY provider_type
            """,
            tenant_id, hours,
        )
        series = await conn.fetch(
            """
            SELECT date_trunc('hour', created_at) AS bucket,
                   AVG(total_latency_ms)::float AS avg,
                   percentile_cont(0.95) WITHIN GROUP (ORDER BY total_latency_ms)::float AS p95,
                   percentile_cont(0.99) WITHIN GROUP (ORDER BY total_latency_ms)::float AS p99
            FROM ai_requests
            WHERE tenant_id = $1 AND created_at > now() - ($2 * interval '1 hour')
            GROUP BY bucket
            ORDER BY bucket
            """,
            tenant_id, hours,
        )
    return {
        "by_provider": [dict(row) for row in by_provider],
        "series": [
            {
                "time": row["bucket"].strftime("%H:%M"),
                "avg": round(row["avg"] or 0, 1),
                "p95": round(row["p95"] or 0, 1),
                "p99": round(row["p99"] or 0, 1),
            } for row in series
        ],
    }


async def cost_snapshot(pool: asyncpg.Pool, tenant_id: str, days: int = 30) -> Dict[str, Any]:
    days = max(1, min(int(days), 90))
    async with pool.acquire() as conn:
        totals = await conn.fetchrow(
            """
            SELECT COALESCE(SUM(estimated_cost),0)::float AS actual
            FROM cost_records
            WHERE tenant_id = $1 AND created_at > now() - ($2 * interval '1 day')
            """,
            tenant_id, days,
        )
        prevented = await conn.fetchval(
            """
            SELECT COALESCE(SUM(estimated_savings),0)::float
            FROM optimization_events
            WHERE tenant_id = $1 AND created_at > now() - ($2 * interval '1 day')
            """,
            tenant_id, days,
        )
        by_provider = await conn.fetch(
            """
            SELECT provider_type AS name, COALESCE(SUM(estimated_cost),0)::float AS amount
            FROM cost_records
            WHERE tenant_id = $1 AND created_at > now() - ($2 * interval '1 day')
            GROUP BY provider_type
            ORDER BY amount DESC
            """,
            tenant_id, days,
        )
        by_model = await conn.fetch(
            """
            SELECT provider_type AS provider, model_name AS model,
                   COUNT(*)::int AS requests,
                   COALESCE(SUM(total_tokens),0)::int AS tokens,
                   COALESCE(SUM(estimated_cost),0)::float AS cost
            FROM cost_records
            WHERE tenant_id = $1 AND created_at > now() - ($2 * interval '1 day')
            GROUP BY provider_type, model_name
            ORDER BY cost DESC
            """,
            tenant_id, days,
        )
        series = await conn.fetch(
            """
            SELECT to_char(date_trunc('day', created_at), 'Mon DD') AS day,
                   COALESCE(SUM(estimated_cost),0)::float AS spend
            FROM cost_records
            WHERE tenant_id = $1 AND created_at > now() - ($2 * interval '1 day')
            GROUP BY date_trunc('day', created_at)
            ORDER BY date_trunc('day', created_at)
            """,
            tenant_id, days,
        )
    return {
        "actual": round(totals["actual"], 4),
        "prevented": round(prevented or 0, 4),
        "potential": round(totals["actual"] + (prevented or 0), 4),
        "by_provider": [
            {"name": row["name"], "amount": round(row["amount"], 4)} for row in by_provider
        ],
        "by_model": [
            {
                "provider": row["provider"], "model": row["model"],
                "requests": row["requests"], "tokens": row["tokens"],
                "cost": round(row["cost"], 4),
            } for row in by_model
        ],
        "series": [{"day": row["day"], "spend": round(row["spend"], 4)} for row in series],
    }


async def reliability_snapshot(pool: asyncpg.Pool, tenant_id: str) -> Dict[str, Any]:
    async with pool.acquire() as conn:
        loop_stats = await conn.fetchrow(
            """
            SELECT COUNT(*)::int AS total,
                   COUNT(*) FILTER (WHERE action = 'BLOCK')::int AS blocked
            FROM loop_events
            WHERE tenant_id = $1 AND created_at::date = CURRENT_DATE
            """,
            tenant_id,
        )
        savings = await conn.fetchval(
            """
            SELECT COALESCE(SUM(estimated_savings),0)::float
            FROM optimization_events
            WHERE tenant_id = $1 AND type = 'LOOP_PREVENTED' AND created_at::date = CURRENT_DATE
            """,
            tenant_id,
        )
        incidents = await conn.fetch(
            """
            SELECT 'Loop detected' AS title, fingerprint AS detail, 'high' AS severity,
                   created_at, 'DOG' AS provider, action
            FROM loop_events
            WHERE tenant_id = $1
            ORDER BY created_at DESC LIMIT 8
            """,
            tenant_id,
        )
    return {
        "loops_today": loop_stats["total"] or 0,
        "loops_prevented": loop_stats["blocked"] or 0,
        "cost_avoided": round(savings or 0, 2),
        "incidents": [
            {
                "title": row["title"],
                "detail": row["detail"][:32] + ("…" if len(row["detail"]) > 32 else ""),
                "severity": row["severity"],
                "provider": row["provider"],
                "action": row["action"],
                "time": row["created_at"].isoformat(),
            } for row in incidents
        ],
    }


async def optimizations_snapshot(pool: asyncpg.Pool, tenant_id: str, days: int = 30) -> Dict[str, Any]:
    days = max(1, min(int(days), 90))
    async with pool.acquire() as conn:
        by_type = await conn.fetch(
            """
            SELECT type, COUNT(*)::int AS count, COALESCE(SUM(estimated_savings),0)::float AS savings
            FROM optimization_events
            WHERE tenant_id = $1 AND created_at > now() - ($2 * interval '1 day')
            GROUP BY type
            """,
            tenant_id, days,
        )
        recent = await conn.fetch(
            """
            SELECT type, estimated_savings, metadata::text AS metadata_json, created_at
            FROM optimization_events
            WHERE tenant_id = $1 AND created_at > now() - ($2 * interval '1 day')
            ORDER BY created_at DESC LIMIT 20
            """,
            tenant_id, days,
        )
    return {
        "by_type": [
            {"type": row["type"], "count": row["count"], "savings": round(row["savings"], 4)}
            for row in by_type
        ],
        "recent": [
            {
                "type": row["type"],
                "savings": round(float(row["estimated_savings"]), 4),
                "metadata": json.loads(row["metadata_json"]) if row["metadata_json"] else {},
                "created_at": row["created_at"].isoformat(),
            } for row in recent
        ],
    }


async def list_api_keys(pool: asyncpg.Pool, tenant_id: str) -> List[Dict[str, Any]]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, name, key_prefix, environment, last_used_at, created_at, revoked_at
            FROM api_keys WHERE tenant_id = $1
            ORDER BY created_at DESC
            """,
            tenant_id,
        )
    return [
        {
            "id": str(row["id"]),
            "name": row["name"],
            "environment": row["environment"],
            "masked": f"dog_{row['environment']}_{row['key_prefix']}••••••",
            "last_used_at": row["last_used_at"].isoformat() if row["last_used_at"] else None,
            "created_at": row["created_at"].isoformat(),
            "revoked": row["revoked_at"] is not None,
        } for row in rows
    ]


async def list_providers(pool: asyncpg.Pool, tenant_id: str) -> List[Dict[str, Any]]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT p.id, p.name, p.provider_type, p.status, p.base_url,
                   (SELECT name FROM models m WHERE m.provider_id = p.id ORDER BY created_at ASC LIMIT 1) AS default_model,
                   (SELECT preview FROM provider_credentials c WHERE c.provider_id = p.id) AS credential_preview
            FROM providers p WHERE p.tenant_id = $1
            ORDER BY p.created_at ASC
            """,
            tenant_id,
        )
    return [
        {
            "id": str(row["id"]),
            "name": row["name"],
            "provider_type": row["provider_type"],
            "status": row["status"],
            "base_url": row["base_url"],
            "default_model": row["default_model"],
            # Frontend receives ONLY safe metadata — never the credential itself.
            "credential_configured": bool(row["credential_preview"]),
            "credential_preview": row["credential_preview"],
        } for row in rows
    ]
