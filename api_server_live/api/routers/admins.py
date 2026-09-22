from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from core.database import get_db
from core.security import get_current_user, can_assign_role, role_rank
from models.models import Admin, Floor
from schemas.schemas import AdminOut, AdminCreate, AdminUpdate

router = APIRouter()
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _to_out(a: Admin) -> AdminOut:
    floor_name = a.assigned_floor.floor_name if a.assigned_floor else None
    return AdminOut(
        admin_id=a.admin_id,
        admin_name=a.admin_name,
        email=a.email,
        role=a.role,
        phone_number=a.phone_number,
        assigned_floor_id=a.assigned_floor_id,
        assigned_floor_name=floor_name,
        created_at=a.created_at,
        last_login=a.last_login,
    )


@router.get("", response_model=list[AdminOut])
def list_admins(_: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    admins = db.query(Admin).all()
    return [_to_out(a) for a in admins]


def _require_can_manage_accounts(current: dict) -> None:
    """계정 생성/삭제 등 담당자 관리는 admin/manager만 (operator/viewer 불가)."""
    if role_rank(current.get("role")) > role_rank("manager"):
        raise HTTPException(status_code=403, detail="담당자 관리 권한이 없습니다.")


@router.post("", response_model=AdminOut, status_code=201)
def create_admin(
    body: AdminCreate,
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_can_manage_accounts(current)
    if not can_assign_role(current.get("role"), body.role):
        raise HTTPException(status_code=403, detail="자신보다 높은 권한의 계정을 생성할 수 없습니다.")

    if db.query(Admin).filter(Admin.email == body.email).first():
        raise HTTPException(status_code=409, detail="이미 사용 중인 이메일입니다.")

    admin = Admin(
        admin_name=body.admin_name,
        email=body.email,
        password_hash=pwd_ctx.hash(body.password),
        role=body.role,
        phone_number=body.phone_number,
        assigned_floor_id=body.assigned_floor_id,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    if admin.assigned_floor_id:
        admin.assigned_floor = db.query(Floor).filter(
            Floor.floor_id == admin.assigned_floor_id
        ).first()

    return _to_out(admin)


@router.put("/{admin_id}", response_model=AdminOut)
def update_admin(
    admin_id: int,
    body: AdminUpdate,
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_self = current.get("sub") == str(admin_id)
    can_manage = role_rank(current.get("role")) <= role_rank("manager")

    if not is_self and not can_manage:
        raise HTTPException(status_code=403, detail="본인 정보만 수정할 수 있습니다.")

    admin = db.query(Admin).filter(Admin.admin_id == admin_id).first()
    if not admin:
        raise HTTPException(status_code=404, detail="관리자를 찾을 수 없습니다.")

    if not is_self and role_rank(admin.role) < role_rank(current.get("role")):
        raise HTTPException(status_code=403, detail="자신보다 높은 권한의 계정은 수정할 수 없습니다.")

    if body.role is not None:
        if not can_manage:
            raise HTTPException(status_code=403, detail="역할(role)은 담당자 관리 권한이 있어야 변경할 수 있습니다.")
        if not can_assign_role(current.get("role"), body.role):
            raise HTTPException(status_code=403, detail="자신보다 높은 권한을 부여할 수 없습니다.")

    data = body.model_dump(exclude_unset=True)
    if "password" in data:
        admin.password_hash = pwd_ctx.hash(data.pop("password"))
    for field, value in data.items():
        setattr(admin, field, value)

    db.commit()
    db.refresh(admin)
    return _to_out(admin)


@router.delete("/{admin_id}")
def delete_admin(
    admin_id: int,
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_can_manage_accounts(current)

    admin = db.query(Admin).filter(Admin.admin_id == admin_id).first()
    if not admin:
        raise HTTPException(status_code=404, detail="관리자를 찾을 수 없습니다.")
    if role_rank(admin.role) < role_rank(current.get("role")):
        raise HTTPException(status_code=403, detail="자신보다 높은 권한의 계정은 삭제할 수 없습니다.")
    db.delete(admin)
    db.commit()
    return {"success": True}
