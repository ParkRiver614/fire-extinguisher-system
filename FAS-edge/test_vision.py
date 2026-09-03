import numpy as np
import cv2

import vision


def _write_gray_jpg(path: str, value: int, size=(100, 100)) -> None:
    img = np.full(size, value, dtype=np.uint8)
    cv2.imwrite(path, img)


def test_identical_images_zero_ratio(tmp_path):
    ref = str(tmp_path / "ref.jpg")
    cur = str(tmp_path / "cur.jpg")
    _write_gray_jpg(ref, 100)
    _write_gray_jpg(cur, 100)

    ratio = vision.compute_diff_ratio(ref, cur)

    assert ratio == 0.0


def test_fully_different_images_full_ratio(tmp_path):
    ref = str(tmp_path / "ref.jpg")
    cur = str(tmp_path / "cur.jpg")
    _write_gray_jpg(ref, 0)
    _write_gray_jpg(cur, 255)

    ratio = vision.compute_diff_ratio(ref, cur)

    assert ratio == 1.0


def test_exclude_boxes_zero_out_masked_region(tmp_path):
    ref = str(tmp_path / "ref.jpg")
    cur = str(tmp_path / "cur.jpg")
    _write_gray_jpg(ref, 0, size=(100, 100))
    _write_gray_jpg(cur, 255, size=(100, 100))

    ratio = vision.compute_diff_ratio(ref, cur, exclude_boxes=[(0, 0, 100, 100)])

    assert ratio == 0.0


def test_person_boxes_filters_only_person_class():
    detections = [
        {"class_name": "person", "confidence": 0.9, "area_ratio": 0.5, "box": (1, 2, 3, 4)},
        {"class_name": "chair", "confidence": 0.8, "area_ratio": 0.2, "box": (5, 6, 7, 8)},
    ]

    boxes = vision.person_boxes(detections)

    assert boxes == [(1, 2, 3, 4)]


def test_decide_status_no_reference_returns_normal(tmp_path, monkeypatch):
    monkeypatch.setattr(vision, "REFERENCE_PATH", str(tmp_path / "missing.jpg"))

    status, vision_info = vision.decide_status("irrelevant.jpg", [])

    assert status == "normal"
    assert vision_info is None


def test_decide_status_high_diff_returns_obstacle_detected(tmp_path, monkeypatch):
    ref_path = tmp_path / "reference.jpg"
    ref_path.write_bytes(b"placeholder")
    monkeypatch.setattr(vision, "REFERENCE_PATH", str(ref_path))
    monkeypatch.setattr(vision, "compute_diff_ratio", lambda *a, **k: 0.95)

    status, vision_info = vision.decide_status("current.jpg", [])

    assert status == "obstacle_detected"
    assert vision_info == {
        "detected_class": "unknown_object",
        "confidence_score": 0.95,
        "model_version": "bg_diff_v1",
    }


def test_decide_status_low_diff_returns_normal(tmp_path, monkeypatch):
    ref_path = tmp_path / "reference.jpg"
    ref_path.write_bytes(b"placeholder")
    monkeypatch.setattr(vision, "REFERENCE_PATH", str(ref_path))
    monkeypatch.setattr(vision, "compute_diff_ratio", lambda *a, **k: 0.5)

    status, vision_info = vision.decide_status("current.jpg", [])

    assert status == "normal"
    assert vision_info is None
