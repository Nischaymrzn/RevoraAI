"""
Unit tests for auth.py utility functions.

Tests: hash_password, verify_password, create_access_token.
SQLAlchemy's create_engine is lazy, so importing auth.py (which imports
database.py) does NOT make a real database connection.
"""
import pytest
from datetime import timedelta
from jose import jwt

from auth import hash_password, verify_password, create_access_token
from config import SECRET_KEY, ALGORITHM


# ─── hash_password / verify_password ─────────────────────────────────────────

class TestPasswordHashing:
    def test_hash_is_different_from_plaintext(self):
        hashed = hash_password("mypassword123")
        assert hashed != "mypassword123"

    def test_hash_starts_with_bcrypt_prefix(self):
        hashed = hash_password("secret")
        assert hashed.startswith("$2b$")

    def test_same_password_produces_different_hashes(self):
        # bcrypt uses random salt — same input → different output each time
        h1 = hash_password("password")
        h2 = hash_password("password")
        assert h1 != h2

    def test_verify_correct_password_returns_true(self):
        hashed = hash_password("correct_password")
        assert verify_password("correct_password", hashed) is True

    def test_verify_wrong_password_returns_false(self):
        hashed = hash_password("correct_password")
        assert verify_password("wrong_password", hashed) is False

    def test_verify_empty_password_against_hash_returns_false(self):
        hashed = hash_password("non_empty")
        assert verify_password("", hashed) is False

    def test_verify_is_case_sensitive(self):
        hashed = hash_password("Password")
        assert verify_password("password", hashed) is False
        assert verify_password("PASSWORD", hashed) is False
        assert verify_password("Password", hashed) is True


# ─── create_access_token ──────────────────────────────────────────────────────

class TestCreateAccessToken:
    def test_returns_a_string(self):
        token = create_access_token({"sub": "42"})
        assert isinstance(token, str)

    def test_token_contains_sub_claim(self):
        token = create_access_token({"sub": "99"})
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["sub"] == "99"

    def test_token_contains_exp_claim(self):
        token = create_access_token({"sub": "1"})
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert "exp" in payload

    def test_custom_expiry_is_respected(self):
        import time
        token = create_access_token({"sub": "5"}, expires_delta=timedelta(seconds=5))
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        now = int(time.time())
        # exp should be within a few seconds of now + 5
        assert abs(payload["exp"] - (now + 5)) < 3

    def test_different_data_produces_different_tokens(self):
        t1 = create_access_token({"sub": "1"})
        t2 = create_access_token({"sub": "2"})
        assert t1 != t2

    def test_token_with_extra_claims(self):
        token = create_access_token({"sub": "7", "role": "admin"})
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["role"] == "admin"
        assert payload["sub"] == "7"
