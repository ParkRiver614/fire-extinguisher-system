from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader, HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from datetime import datetime, timedelta
import os
import secrets

KNOWN_WEAK_SECRETS = {"change-me-in-production", "your-jwt-secret-key", "secret", ""}

SECRET_KEY = os.getenv("SECRET_KEY", "")
if SECRET_KEY in KNOWN_WEAK_SECRETS:
    raise RuntimeError(
        "SECRET_KEY 환경변수가 설정되지 않았거나 알려진 기본값입니다. "
        "JWT 서명 키로 쓰기에 안전하지 않으니 강한 랜덤 값으로 교체하세요 "
        "(예: python -c \"import secrets; print(secrets.token_urlsafe(48))\")."
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES_REMEMBER = 60 * 24
ACCESS_TOKEN_EXPIRE_MINUTES_DEFAULT = 60

DEVICE_API_KEY = os.getenv("DEVICE_API_KEY")

bearer_scheme = HTTPBearer()
device_key_header = APIKeyHeader(name="X-Device-Key", auto_error=False)


def create_access_token(data: dict, remember_me: bool = False) -> str:
    expire_minutes = ACCESS_TOKEN_EXPIRE_MINUTES_REMEMBER if remember_me else ACCESS_TOKEN_EXPIRE_MINUTES_DEFAULT
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=expire_minutes)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않거나 만료된 토큰입니다.",
        )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    return decode_token(credentials.credentials)


# 숫자가 작을수록 높은 권한. 알 수 없는 role은 가장 낮은 권한(viewer 밖)으로 취급.
ROLE_RANK = {"admin": 0, "manager": 1, "operator": 2, "viewer": 3}


def role_rank(role: str | None) -> int:
    return ROLE_RANK.get(role or "", len(ROLE_RANK))


def can_assign_role(caller_role: str | None, target_role: str) -> bool:
    """자신보다 높은(랭크 숫자가 작은) 권한은 남에게 부여할 수 없다."""
    return role_rank(target_role) >= role_rank(caller_role)


def require_role(min_role: str):
    """caller의 권한이 min_role 이상(랭크 숫자가 min_role 이하)일 때만 통과."""
    threshold = ROLE_RANK[min_role]

    def _dependency(current: dict = Depends(get_current_user)) -> dict:
        if role_rank(current.get("role")) > threshold:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="이 작업을 수행할 권한이 없습니다.",
            )
        return current

    return _dependency


def verify_device_key(key: str | None = Depends(device_key_header)) -> None:
    if not DEVICE_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="DEVICE_API_KEY가 서버에 설정되어 있지 않습니다.",
        )
    if not key or not secrets.compare_digest(key, DEVICE_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않은 장치 인증 키입니다.",
        )
