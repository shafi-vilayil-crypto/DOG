"""SSRF-safe URL validation for user-supplied custom provider endpoints.

Blocks anything that would let a customer coerce DOG into probing our
own infrastructure or a cloud metadata service:

- non-HTTP(S) schemes
- private / loopback / link-local / multicast / reserved IPv4 & IPv6
- known cloud metadata addresses (AWS 169.254.169.254, GCP, etc.)
- hosts whose DNS resolves to any of the above

Call `validate_custom_base_url()` both at save-time and immediately
before making an outbound request — DNS can change.
"""
import ipaddress
import socket
from urllib.parse import urlparse

BLOCKED_HOSTS = {"localhost", "metadata.google.internal", "metadata"}
BLOCKED_METADATA_IPS = {
    "169.254.169.254",  # AWS / Azure / DigitalOcean metadata
    "100.100.100.200",  # Alibaba
    "fd00:ec2::254",    # AWS IPv6 metadata
}


class SSRFError(ValueError):
    """Raised when a URL is unsafe to fetch."""


def _ip_is_public(ip: ipaddress._BaseAddress) -> bool:
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
        or ip.compressed in BLOCKED_METADATA_IPS
    )


def validate_custom_base_url(url: str, allow_http: bool = False) -> None:
    if not url:
        raise SSRFError("URL is required")
    parsed = urlparse(url)
    scheme = (parsed.scheme or "").lower()
    if scheme not in ("http", "https"):
        raise SSRFError(f"URL scheme not allowed: {scheme or '(none)'}")
    if scheme == "http" and not allow_http:
        raise SSRFError("HTTPS required for custom provider URLs")
    host = (parsed.hostname or "").lower()
    if not host:
        raise SSRFError("URL host is required")
    if host in BLOCKED_HOSTS:
        raise SSRFError(f"Host not allowed: {host}")
    try:
        addr_infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise SSRFError(f"Host does not resolve: {host}") from exc
    for family, _t, _p, _c, sockaddr in addr_infos:
        ip_str = sockaddr[0]
        try:
            ip_obj = ipaddress.ip_address(ip_str.split("%")[0])
        except ValueError:
            continue
        if not _ip_is_public(ip_obj):
            raise SSRFError(f"Host resolves to a non-public IP: {ip_str}")
