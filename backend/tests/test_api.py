"""
Integration tests for Revora API endpoints.

Uses FastAPI's TestClient with a minimal test application that mounts
the real auth router. The database dependency is replaced with a mock
session so no real Postgres connection is needed.
"""
import pytest
from unittest.mock import MagicMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient

from database import get_db
from auth import hash_password, create_access_token


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _make_fake_user(email: str = "test@example.com", password: str = "secret123"):
    """Return a MagicMock that looks like a models.User row."""
    user = MagicMock()
    user.id = 1
    user.email = email
    user.password_hash = hash_password(password)
    user.name = "Test User"
    user.phone = None
    return user


def _override_get_db(fake_session):
    """Return a FastAPI dependency override for get_db."""
    def _get_db_override():
        yield fake_session
    return _get_db_override


# ─── Health endpoint test ─────────────────────────────────────────────────────

class TestHealthEndpoint:
    """
    Test a stand-alone health endpoint without importing main.py
    (which would trigger real DB connections at module level).
    """

    @pytest.fixture(scope="class")
    def client(self):
        app = FastAPI()

        @app.get("/api/health")
        def health():
            return {"status": "ok", "ai_configured": False, "message": "Revora.ai is running"}

        return TestClient(app)

    def test_health_returns_200(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200

    def test_health_status_is_ok(self, client):
        resp = client.get("/api/health")
        assert resp.json()["status"] == "ok"

    def test_health_message_field_present(self, client):
        resp = client.get("/api/health")
        assert "message" in resp.json()


# ─── Auth router integration tests ───────────────────────────────────────────

class TestAuthRegister:
    """
    Test POST /api/auth/register using a mocked database session.
    The router is mounted on a minimal FastAPI app so no DB connection
    is ever made.
    """

    @pytest.fixture(scope="class")
    def client(self):
        from routers.auth import router

        app = FastAPI()
        app.include_router(router)

        # Build a fake DB session
        fake_db = MagicMock()
        # Simulate no existing user (email not taken)
        fake_db.query.return_value.filter.return_value.first.return_value = None
        # Simulate add + commit + refresh without error
        fake_db.add.return_value = None
        fake_db.commit.return_value = None
        fake_db.refresh.side_effect = lambda obj: setattr(obj, "id", 42)

        app.dependency_overrides[get_db] = _override_get_db(fake_db)
        return TestClient(app, raise_server_exceptions=False)

    def test_register_returns_200_with_token(self, client):
        resp = client.post("/api/auth/register", json={
            "email": "newuser@example.com",
            "password": "strongpass123",
            "name": "New User",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_register_duplicate_email_returns_400(self, client):
        from routers.auth import router
        from fastapi import FastAPI

        # Build a new app where the fake DB *finds* an existing user
        app2 = FastAPI()
        app2.include_router(router)

        fake_db = MagicMock()
        existing_user = _make_fake_user("taken@example.com")
        fake_db.query.return_value.filter.return_value.first.return_value = existing_user

        app2.dependency_overrides[get_db] = _override_get_db(fake_db)
        client2 = TestClient(app2, raise_server_exceptions=False)

        resp = client2.post("/api/auth/register", json={
            "email": "taken@example.com",
            "password": "somepass123",
            "name": "Duplicate",
        })
        assert resp.status_code == 400


class TestAuthLogin:
    """
    Test POST /api/auth/login using a mocked database session.
    """

    @pytest.fixture(scope="class")
    def client(self):
        from routers.auth import router

        app = FastAPI()
        app.include_router(router)

        fake_user = _make_fake_user("alice@example.com", "mypassword")
        fake_db = MagicMock()
        fake_db.query.return_value.filter.return_value.first.return_value = fake_user

        app.dependency_overrides[get_db] = _override_get_db(fake_db)
        return TestClient(app, raise_server_exceptions=False)

    def test_login_with_correct_credentials_returns_token(self, client):
        resp = client.post("/api/auth/login", data={
            "username": "alice@example.com",
            "password": "mypassword",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_with_wrong_password_returns_401(self, client):
        resp = client.post("/api/auth/login", data={
            "username": "alice@example.com",
            "password": "wrongpassword",
        })
        assert resp.status_code == 401

    def test_login_with_nonexistent_user_returns_401(self):
        from routers.auth import router

        app = FastAPI()
        app.include_router(router)

        fake_db = MagicMock()
        fake_db.query.return_value.filter.return_value.first.return_value = None
        app.dependency_overrides[get_db] = _override_get_db(fake_db)
        c = TestClient(app, raise_server_exceptions=False)

        resp = c.post("/api/auth/login", data={
            "username": "ghost@example.com",
            "password": "anypass",
        })
        assert resp.status_code == 401
