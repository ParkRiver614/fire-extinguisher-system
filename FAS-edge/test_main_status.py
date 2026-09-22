"""main._resolve_status()의 우선순위 검증.

main.py는 카메라(vision→cv2)와 리눅스 전용 MAC 조회에 의존해 PC에서 그냥은 임포트되지
않는다. 상태 결정 로직만 보려는 것이므로 그 둘만 스텁으로 막고 실제 모듈을 불러온다.
"""
import sys
import types

import pytest

import config

config.get_mac_address = lambda: "aa:bb:cc:dd:ee:ff"
_vision_stub = types.ModuleType("vision")
_vision_stub.run_cycle = lambda: ("normal", None, None)
sys.modules.setdefault("vision", _vision_stub)

import main  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_state():
    main._fire = False
    main._missing = False
    main._last_vision_status = "normal"
    yield


def test_fire_beats_everything():
    main._fire = True
    main._missing = True
    assert main._resolve_status("obstacle_detected") == "fire_detected"


def test_missing_beats_vision():
    main._missing = True
    assert main._resolve_status("obstacle_detected") == "missing"


def test_periodic_cycle_uses_the_fresh_verdict():
    """주기 사이클은 방금 찍은 판단을 쓴다 — 기억해 둔 옛 값이 아니라."""
    main._last_vision_status = "obstacle_detected"
    assert main._resolve_status("normal") == "normal"


def test_transition_callback_falls_back_to_remembered_verdict():
    """상태 전환 콜백은 새 판단이 없으므로 마지막으로 기억한 값으로 되돌아간다."""
    main._last_vision_status = "obstacle_detected"
    assert main._resolve_status() == "obstacle_detected"


def test_returning_to_place_reports_normal_when_nothing_was_seen():
    main._last_vision_status = "normal"
    main._missing = True
    assert main._resolve_status() == "missing"
    main._missing = False
    assert main._resolve_status() == "normal"
