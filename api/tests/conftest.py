import pytest

from app import security


@pytest.fixture(autouse=True)
def fresh_rate_limit():
    """Every test signs in, so the per-address sign-in limit is reset between tests."""
    security._hits.clear()
    yield
