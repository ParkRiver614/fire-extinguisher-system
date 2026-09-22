import os
import uuid
from io import BytesIO

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError

ALLOWED_IMAGE_FORMATS = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp", "GIF": ".gif"}

# 업로드 상한. 층 도면과 Pi 스냅샷 모두 수백 KB 수준이라 10MB면 충분히 넉넉하다.
# 상한이 없으면 큰 파일 하나로 디스크와 메모리를 밀어버릴 수 있다(업로드 경로는
# 장치 키/로그인만 있으면 닿는다). 환경변수로 조정 가능.
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", 10 * 1024 * 1024))


def save_validated_image(data: bytes, dest_dir: str, prefix: str) -> str:
    """업로드된 바이트가 실제로 유효한 이미지인지 검증하고, 감지된 포맷 기준으로
    확장자를 강제해서 저장한다. 클라이언트가 보낸 파일명/Content-Type은 신뢰하지 않는다."""
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"업로드 크기가 너무 큽니다 (최대 {MAX_UPLOAD_BYTES // (1024 * 1024)}MB).",
        )

    try:
        with Image.open(BytesIO(data)) as probe:
            probe.verify()
        with Image.open(BytesIO(data)) as img:
            fmt = img.format
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="유효한 이미지 파일이 아닙니다.")

    ext = ALLOWED_IMAGE_FORMATS.get(fmt or "")
    if not ext:
        raise HTTPException(status_code=400, detail="지원하지 않는 이미지 형식입니다 (jpg/png/webp/gif만 허용).")

    filename = f"{prefix}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(dest_dir, filename)
    with open(filepath, "wb") as f:
        f.write(data)
    return filename
