"""Async Postgres pool for the DOG application layer.

Kept intentionally thin — every module that needs the database goes
through `get_pool()` so the connection lifecycle is centralised. All
writes on the LLM hot path should be async / fire-and-forget so a slow
database never impacts a customer request (fail-open principle).
"""
import os
from pathlib import Path
from typing import Optional

import asyncpg

_pool: Optional[asyncpg.Pool] = None
_SCHEMA_PATH = Path(__file__).parent / "schema.sql"


async def _init_connection(conn: asyncpg.Connection) -> None:
    # pgBouncer transaction pool doesn't support prepared statements,
    # so we disable server-side statement caching on each connection.
    await conn.execute("SELECT 1")


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        dsn = os.environ["DATABASE_URL"]
        _pool = await asyncpg.create_pool(
            dsn=dsn,
            ssl="require",
            min_size=1,
            max_size=8,
            statement_cache_size=0,  # pgBouncer / Supabase pooler compatibility
            init=_init_connection,
        )
        await _run_schema()
    return _pool


async def _run_schema() -> None:
    assert _pool is not None
    ddl = _SCHEMA_PATH.read_text()
    async with _pool.acquire() as conn:
        await conn.execute(ddl)


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
