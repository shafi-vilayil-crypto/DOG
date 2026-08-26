"""Server-side secret vault for provider credentials.

Credentials are AES-256-GCM encrypted using `DOG_ENCRYPTION_KEY` before
storage. Only the ciphertext + nonce + auth tag ever hit the database.
The plaintext credential never leaves this module.

This is intentionally a thin wrapper — the moment we outgrow this we can
swap the storage backend for Supabase Vault or an external KMS without
touching any calling code.
"""
import base64
import hashlib
import os
from dataclasses import dataclass

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _key_bytes() -> bytes:
    raw = os.environ["DOG_ENCRYPTION_KEY"].encode()
    # AES-GCM requires a 128, 192, or 256 bit key — hash for a deterministic 256b key
    return hashlib.sha256(raw).digest()


@dataclass(frozen=True)
class EncryptedSecret:
    ciphertext_b64: str
    nonce_b64: str


def encrypt_secret(plaintext: str) -> EncryptedSecret:
    if not plaintext:
        raise ValueError("Refusing to encrypt an empty secret")
    aead = AESGCM(_key_bytes())
    nonce = os.urandom(12)
    ct = aead.encrypt(nonce, plaintext.encode(), None)
    return EncryptedSecret(
        ciphertext_b64=base64.b64encode(ct).decode(),
        nonce_b64=base64.b64encode(nonce).decode(),
    )


def decrypt_secret(ciphertext_b64: str, nonce_b64: str) -> str:
    """Server-side only. Never expose the return value to the browser."""
    aead = AESGCM(_key_bytes())
    ct = base64.b64decode(ciphertext_b64)
    nonce = base64.b64decode(nonce_b64)
    return aead.decrypt(nonce, ct, None).decode()


def redacted_preview(plaintext: str) -> str:
    """Safe metadata we can hand back to the browser after a set/rotate."""
    if not plaintext or len(plaintext) < 6:
        return "••••"
    return f"{plaintext[:3]}••••{plaintext[-3:]}"
