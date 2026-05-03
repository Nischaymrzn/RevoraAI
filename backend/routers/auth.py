from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
import httpx
from database import get_db
import models
from auth import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    name: str
    email: str
    phone: str | None = None
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: dict


@router.post("/register", response_model=TokenResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = models.User(
        email=req.email,
        name=req.name,
        phone=req.phone,
        password_hash=hash_password(req.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user.id, "name": user.name, "email": user.email, "phone": user.phone},
    }


@router.post("/login", response_model=TokenResponse)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form.username).first()
    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"sub": str(user.id)})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user.id, "name": user.name, "email": user.email, "phone": user.phone},
    }


@router.get("/me")
def get_me(current_user: models.User = Depends(__import__("auth").get_current_user)):
    return {"id": current_user.id, "name": current_user.name, "email": current_user.email}


@router.post("/google", response_model=TokenResponse)
async def google_auth(body: dict, db: Session = Depends(get_db)):
    """Sign in / sign up with Google OAuth access token."""
    access_token = body.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="Missing access_token")

    # Verify token and fetch user info from Google
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    info = resp.json()
    email = info.get("email")
    name  = info.get("name") or email

    if not email:
        raise HTTPException(status_code=400, detail="Google did not return an email")

    # Find existing user or create a new one (Google OAuth — no password)
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        user = models.User(email=email, name=name, password_hash=None)
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user.id, "name": user.name, "email": user.email, "phone": user.phone},
    }


@router.post("/debug-token")
def debug_token(body: dict, db: Session = Depends(get_db)):
    """Debug endpoint — remove before production."""
    from jose import jwt, JWTError
    from config import SECRET_KEY, ALGORITHM
    token = body.get("token", "")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub")
        user_id = int(sub) if sub is not None else None
        user = db.query(models.User).filter(models.User.id == user_id).first()
        return {
            "payload": payload,
            "sub_raw": sub,
            "sub_type": type(sub).__name__,
            "user_id": user_id,
            "user_found": user is not None,
        }
    except JWTError as e:
        return {"error": str(e)}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {str(e)}"}
