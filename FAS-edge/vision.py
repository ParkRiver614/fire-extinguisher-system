import os
import glob
import subprocess

import cv2
import numpy as np
from ultralytics import YOLO

from config import (
    WORK_DIR, CAPTURE_FRAMES, USE_FRAME_INDEX,
    CAPTURE_WIDTH, CAPTURE_HEIGHT, CROP_WIDTH, CROP_HEIGHT,
    REFERENCE_PATH, DIFF_PIXEL_THRESHOLD, OBSTACLE_DIFF_RATIO,
    EXCLUDED_CLASSES, YOLO_MODEL,
)

_model = None


def _get_model():
    global _model
    if _model is None:
        _model = YOLO(YOLO_MODEL)
    return _model


def capture() -> str:
    """cam으로 CAPTURE_FRAMES장 촬영 → USE_FRAME_INDEX번째만 사용 →
    ffmpeg로 raw를 jpg로 변환+크롭 → 나머지 raw는 삭제 → jpg 경로 반환"""
    raw_pattern = os.path.join(WORK_DIR, "frame#.raw")
    subprocess.run(
        ["cam", "-c", "1", f"--capture={CAPTURE_FRAMES}", f"--file={raw_pattern}"],
        check=True, capture_output=True,
    )

    raw_file = os.path.join(WORK_DIR, f"framecam0-stream0-{USE_FRAME_INDEX:06d}.raw")
    jpg_file = os.path.join(WORK_DIR, "snapshot.jpg")

    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "rawvideo", "-pixel_format", "bgra",
            "-s", f"{CAPTURE_WIDTH}x{CAPTURE_HEIGHT}",
            "-i", raw_file,
            "-vf", f"scale={CROP_WIDTH}:{CROP_HEIGHT}:force_original_aspect_ratio=increase,crop={CROP_WIDTH}:{CROP_HEIGHT},transpose=1",
            jpg_file,
        ],
        check=True, capture_output=True,
    )

    for raw in glob.glob(os.path.join(WORK_DIR, "*.raw")):
        os.remove(raw)

    return jpg_file


def save_reference() -> str:
    """현재 프레임을 촬영해 기준 사진으로 저장(덮어쓰기). 최초 설치 시,
    또는 유지보수 후 기준을 재설정할 때 수동으로 호출한다.
    반환값: 저장된 기준 사진 경로."""
    jpg_path = capture()
    with open(jpg_path, "rb") as src, open(REFERENCE_PATH, "wb") as dst:
        dst.write(src.read())
    return REFERENCE_PATH


def infer(jpg_path: str) -> list[dict]:
    """YOLO11n 추론 → [{class_name, confidence, area_ratio}, ...] 반환"""
    model = _get_model()
    results = model.predict(source=jpg_path, conf=0.4, verbose=False)
    r = results[0]

    img_h, img_w = r.orig_shape
    frame_area = img_w * img_h

    detections = []
    for box in r.boxes:
        cls_id = int(box.cls[0])
        cls_name = model.names[cls_id]
        conf = float(box.conf[0])
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        box_area = max(0.0, x2 - x1) * max(0.0, y2 - y1)
        detections.append({
            "class_name": cls_name,
            "confidence": conf,
            "area_ratio": box_area / frame_area,
            "box": (x1, y1, x2, y2),
        })

    return detections


def person_boxes(detections: list[dict]) -> list[tuple[float, float, float, float]]:
    """detections에서 사람(EXCLUDED_CLASSES) 박스 좌표만 추출"""
    return [d["box"] for d in detections if d["class_name"] in EXCLUDED_CLASSES]


def compute_diff_ratio(
    reference_path: str,
    current_path: str,
    exclude_boxes: list[tuple[float, float, float, float]] | None = None,
) -> float:
    """기준 사진과 현재 사진의 그레이스케일 절대 차분 → exclude_boxes 영역 제외 →
    임계값 이상 달라진 픽셀의 비율(0.0~1.0) 반환"""
    ref = cv2.imread(reference_path, cv2.IMREAD_GRAYSCALE)
    cur = cv2.imread(current_path, cv2.IMREAD_GRAYSCALE)
    if ref is None or cur is None:
        raise ValueError("기준 사진 또는 현재 사진을 읽을 수 없습니다.")
    if ref.shape != cur.shape:
        cur = cv2.resize(cur, (ref.shape[1], ref.shape[0]))

    diff = cv2.absdiff(ref, cur)
    mask = (diff >= DIFF_PIXEL_THRESHOLD).astype(np.uint8)

    for x1, y1, x2, y2 in (exclude_boxes or []):
        mask[int(y1):int(y2), int(x1):int(x2)] = 0

    return float(mask.sum()) / mask.size


def decide_status(current_jpg_path: str, detections: list[dict]) -> tuple[str, dict | None]:
    """기준 사진 대비 배경 차분으로 장애물 여부 판단.
    기준 사진이 없으면 판단 불가 상태이므로 normal 반환."""
    if not os.path.exists(REFERENCE_PATH):
        return "normal", None

    ratio = compute_diff_ratio(REFERENCE_PATH, current_jpg_path, person_boxes(detections))

    if ratio >= OBSTACLE_DIFF_RATIO:
        return "obstacle_detected", {
            "detected_class": "unknown_object",
            "confidence_score": ratio,
            "model_version": "bg_diff_v1",
        }

    return "normal", None


def run_cycle() -> tuple[str, str, dict | None]:
    """촬영 → 추론(person 탐지용) → 배경 차분 판단. (status, jpg_path, vision_info) 반환"""
    jpg_path = capture()
    detections = infer(jpg_path)
    status, vision_info = decide_status(jpg_path, detections)
    return status, jpg_path, vision_info
