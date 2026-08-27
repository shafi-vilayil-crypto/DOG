"""Bootstrap the demo tenant, membership, API key, providers, and policy.

Idempotent — safe to call on every backend boot. Once we add real auth
in the next iteration, this seeder becomes a one-off script.
"""
import hashlib
import logging
import os
import secrets
from typing import Optional

import asyncpg

logger = logging.getLogger(__name__)

DEMO_TENANT_SLUG = "acme-demo"
DEMO_TENANT_NAME = "Acme, Inc."
DEMO_USER_EMAIL = "alex@acme.demo"
DEMO_USER_NAME = "Alex Rivera"


def hash_api_key(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


async def _seed_providers(conn: asyncpg.Connection, tenant_id: str) -> None:
    catalog = [
        ("openai", "OPENAI", "gpt-5.2", 3.00, 12.00),
        ("anthropic", "ANTHROPIC", "claude-sonnet-4-6", 3.50, 15.00),
        ("gemini", "GEMINI", "gemini-3.6-flash", 0.35, 1.40),
        ("custom", "CUSTOM", "custom", 0.00, 0.00),
    ]
    for name, ptype, default_model, input_cost, output_cost in catalog:
        provider_id = await conn.fetchval(
            """
            INSERT INTO providers (tenant_id, name, provider_type, status)
            VALUES ($1, $2, $3, 'CONNECTED')
            ON CONFLICT (tenant_id, provider_type) DO UPDATE SET name = EXCLUDED.name
            RETURNING id
            """,
            tenant_id, name, ptype,
        )
        await conn.execute(
            """
            INSERT INTO models (provider_id, name, display_name, input_cost_per_million_tokens, output_cost_per_million_tokens)
            VALUES ($1, $2, $2, $3, $4)
            ON CONFLICT (provider_id, name) DO NOTHING
            """,
            provider_id, default_model, input_cost, output_cost,
        )


async def _seed_api_key(conn: asyncpg.Connection, tenant_id: str) -> Optional[str]:
    """Ensure the demo tenant has the configured demo API key on file.

    Returns the plaintext secret on the very first insert so callers can
    surface it. On subsequent boots it returns None.
    """
    demo_secret = os.environ["DOG_DEMO_API_KEY"]
    key_hash = hash_api_key(demo_secret)
    existing = await conn.fetchrow("SELECT id FROM api_keys WHERE key_hash = $1", key_hash)
    if existing:
        return None
    await conn.execute(
        """
        INSERT INTO api_keys (tenant_id, name, key_prefix, key_hash, environment)
        VALUES ($1, $2, $3, $4, 'live')
        """,
        tenant_id, "Production", demo_secret[:8], key_hash,
    )
    return demo_secret


async def _generate_rotation_key() -> str:
    return f"dog_live_{secrets.token_urlsafe(24)}"


async def ensure_demo_tenant(pool: asyncpg.Pool) -> str:
    """Return the demo tenant id, creating it (and its dependencies) if needed."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            tenant_id = await conn.fetchval(
                """
                INSERT INTO tenants (name, slug)
                VALUES ($1, $2)
                ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
                RETURNING id
                """,
                DEMO_TENANT_NAME, DEMO_TENANT_SLUG,
            )
            user_id = await conn.fetchval(
                """
                INSERT INTO profiles (email, display_name)
                VALUES ($1, $2)
                ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
                RETURNING id
                """,
                DEMO_USER_EMAIL, DEMO_USER_NAME,
            )
            await conn.execute(
                """
                INSERT INTO memberships (tenant_id, user_id, role)
                VALUES ($1, $2, 'OWNER')
                ON CONFLICT (tenant_id, user_id) DO NOTHING
                """,
                tenant_id, user_id,
            )
            await conn.execute(
                """
                INSERT INTO tenant_policies (tenant_id, latency_full_ms, latency_short_ms, latency_critical_ms)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (tenant_id) DO NOTHING
                """,
                tenant_id,
                int(float(os.environ["DOG_LATENCY_FULL_MS"])),
                int(float(os.environ["DOG_LATENCY_SHORT_MS"])),
                int(float(os.environ["DOG_LATENCY_CRITICAL_MS"])),
            )
            await _seed_providers(conn, tenant_id)
            secret = await _seed_api_key(conn, tenant_id)
            if secret:
                logger.info("DOG demo API key seeded: %s", secret[:8] + "…")
    return str(tenant_id)
