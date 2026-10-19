"""A small in-process cache for values computed from content (counts, parsed step texts). Content only changes when
`app.cli seed` runs, so a few minutes of staleness is harmless, and progress is never cached."""
import threading
import time
from typing import Callable, TypeVar

T = TypeVar("T")
_store: dict[str, tuple[float, object]] = {}
_lock = threading.Lock()
TTL = 300.0


def cached(key: str, make: Callable[[], T], ttl: float = TTL) -> T:
    now = time.monotonic()
    hit = _store.get(key)
    if hit and now - hit[0] < ttl:
        return hit[1]  # type: ignore[return-value]
    value = make()
    with _lock:
        _store[key] = (now, value)
    return value


def clear() -> None:
    _store.clear()
