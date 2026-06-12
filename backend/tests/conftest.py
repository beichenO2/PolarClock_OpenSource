import os
import sys
import tempfile
import warnings
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ["DATA_DIR"] = tempfile.mkdtemp()

warnings.filterwarnings("ignore", message="The 'app' shortcut is now deprecated", category=DeprecationWarning)


@pytest.fixture(scope="session")
def client():
    from main import app
    return TestClient(app)


@pytest.fixture(scope="session")
def auth_token(client):
    """Create a test user and return the auth token."""
    client.post("/api/users", json={"username": "testuser"})
    resp = client.post("/api/users/login", json={"username": "testuser"})
    return resp.json()["token"]


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    return {"X-Token": auth_token}
