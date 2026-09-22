from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
import bcrypt

from core.database import get_db
from core.security import create_access_token, get_current_user
from models.models import Admin
from schemas.schemas import LoginRequest, LoginResponse, MeResponse, UserOut

router = APIRouter()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def _admin_to_user_out(admin: Admin) -> UserOut:
    return UserOut(
        id=admin.admin_id,
        name=admin.admin_name,
        email=admin.email,
        role=admin.role,
    )


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    admin = db.query(Admin).filter(Admin.email == body.email).first()
    if not admin or not verify_password(body.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")

    admin.last_login = datetime.utcnow()
    db.commit()

    token = create_access_token({"sub": str(admin.admin_id), "role": admin.role}, remember_me=body.rememberMe)
    return LoginResponse(token=token, user=_admin_to_user_out(admin))


@router.get("/me", response_model=MeResponse)
def me(current: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    admin = db.query(Admin).filter(Admin.admin_id == int(current["sub"])).first()
    if not admin:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    return MeResponse(user=_admin_to_user_out(admin))


@router.post("/logout")
def logout(_: dict = Depends(get_current_user)):
    # 클라이언트 측 토큰 삭제 안내 (서버는 무상태)
    return {"success": True}
