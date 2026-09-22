"""ESP32 시리얼 통신 — 센서값 실시간 수신 + 명령 송신.

/dev/ttyUSB0을 리더 스레드가 계속 쥐고 가스/무게/온습도를 읽어 최신값으로 갱신하고,
무게가 임계값을 오르내리면 디바운스를 거쳐 이탈/거치 변화를 콜백으로 알린다.
비상 명령(LED/부저)도 같은 연결로 나간다.
"""

import os
import threading
import time
from typing import Callable

import serial

from config import (
    ESP32_SERIAL_PORT, ESP32_BAUD_RATE, ESP32_SERIAL_TIMEOUT,
    ESP32_BOOT_WAIT_SECONDS, ESP32_RECONNECT_SECONDS,
    MISSING_WEIGHT_THRESHOLD, MISSING_DEBOUNCE_SECONDS, SENSOR_STALE_SECONDS,
    FIRE_GAS_THRESHOLD, FIRE_DEBOUNCE_SECONDS,
)

# ESP32 → Pi 프로토콜: 한 줄 텍스트, 콤마로 구분된 KEY:VALUE
# "GAS:614,WEIGHT:0.6,TEMP:27.2,HUM:59.5"
# (Fire.ino 소스의 한글 파이프 포맷과 실제 보드 출력이 달랐음 — 실측한 포맷 기준으로 작성)
_KEY_MAP = {
    "GAS":    ("가스", "raw"),
    "WEIGHT": ("무게", "g"),
    "TEMP":   ("온도", "°C"),
    "HUM":    ("습도", "%"),
}

# /dev/ttyUSB0은 배타적이라 프로세스 하나만 열 수 있다. 리더 스레드가 포트를 계속 쥐고,
# 비상 명령(emergency_actions)도 send_command()를 통해 같은 연결로 나간다.
_lock = threading.Lock()
_ser: serial.Serial | None = None
_latest: list[dict] = []
_latest_at: float = 0.0
_reader_started = False

# 시리얼 모니터 모드: 받은 줄을 그대로 로그에 흘린다 (journalctl -fu fas-edge 로 관찰)
SERIAL_MONITOR = os.environ.get("FAS_SERIAL_MONITOR") == "1"


def _parse_line(line: str) -> list[dict]:
    """ESP32 한 줄("GAS:614,WEIGHT:0.6,...")을 서버 전송용 센서 목록으로 변환. 모르는 키·깨진 값은 버린다."""
    readings = []
    for part in line.split(","):
        key, _, value = part.partition(":")
        key = key.strip().upper()
        if key in _KEY_MAP:
            name, unit = _KEY_MAP[key]
            try:
                readings.append({"sensor_type_name": name, "value": float(value.strip()), "unit": unit})
            except ValueError:
                pass
    return readings


def is_missing(readings: list[dict]) -> bool:
    """센서 읽기 목록에서 무게 값을 찾아 임계값 이하면 이탈(True)로 판단.
    무게 값이 없으면(ESP32 미연결 등) 판단 불가 상태이므로 False."""
    weight = next((r["value"] for r in readings if r["sensor_type_name"] == "무게"), None)
    if weight is None:
        return False
    return weight < MISSING_WEIGHT_THRESHOLD


def is_fire(readings: list[dict]) -> bool:
    """센서 읽기 목록에서 가스 값을 찾아 임계값을 넘으면 화재(True)로 판단.
    가스 값이 없으면(ESP32 미연결 등) 판단 불가 상태이므로 False."""
    gas = next((r["value"] for r in readings if r["sensor_type_name"] == "가스"), None)
    if gas is None:
        return False
    return gas > FIRE_GAS_THRESHOLD


class StateDebouncer:
    """센서 값은 임계값 근처에서 흔들리므로, 바뀐 상태가 debounce_seconds 동안
    계속 유지될 때만 확정한다. update()는 '지금 서버에 알려야 하면' True를 돌려준다.
    이탈(무게)과 화재(가스) 양쪽에 같은 규칙으로 쓴다."""

    def __init__(self, debounce_seconds: float = MISSING_DEBOUNCE_SECONDS):
        self.debounce = debounce_seconds
        self.confirmed: bool | None = None
        self._candidate: bool | None = None
        self._since = 0.0

    def update(self, state: bool, now: float) -> bool:
        if state == self.confirmed:
            self._candidate = None          # 흔들렸다가 원래 상태로 복귀 — 관찰 취소
            return False
        if state != self._candidate:
            self._candidate, self._since = state, now
            return False
        if now - self._since < self.debounce:
            return False

        first = self.confirmed is None
        self.confirmed, self._candidate = state, None
        # 기동 직후 첫 판단이 평상 상태면 기준선만 잡는다 — 켤 때마다 이벤트가 생기지 않도록.
        # 반대로 이상 상태(이탈/화재)면 알린다: 부팅 시점에 이미 발생한 경우를 놓치면 안 된다.
        return state or not first


def get_esp32_readings() -> list[dict]:
    """리더 스레드가 갱신해 둔 최신 센서값 스냅샷.
    ESP32 미연결이거나 값이 오래됐으면 빈 리스트 (메인 루프를 막지 않음)."""
    if not _latest or time.monotonic() - _latest_at > SENSOR_STALE_SECONDS:
        return []
    return list(_latest)


def send_command(cmd: str) -> bool:
    """리더 스레드가 쥐고 있는 연결로 ESP32에 명령을 써 보낸다."""
    with _lock:
        if _ser is None or not _ser.is_open:
            print("[ESP32 명령 전송 실패] 시리얼 연결 없음")
            return False
        try:
            _ser.write(cmd.encode("utf-8"))
            return True
        except Exception as e:
            print(f"[ESP32 명령 전송 실패] {e}")
            return False


def start_reader(
    on_missing_change: Callable[[bool, list[dict]], None] | None = None,
    on_fire_change: Callable[[bool, list[dict]], None] | None = None,
) -> None:
    """ESP32 시리얼을 열어 계속 읽는 백그라운드 스레드를 띄운다.
    무게 기반 이탈/거치, 가스 기반 화재/평상 상태가 확정적으로 바뀔 때마다
    해당 콜백을 (state, readings)로 부른다."""
    global _reader_started
    if _reader_started:
        return
    _reader_started = True
    threading.Thread(
        target=_reader_loop, args=(on_missing_change, on_fire_change), daemon=True
    ).start()


def _open_port() -> bool:
    global _ser
    try:
        ser = serial.Serial(ESP32_SERIAL_PORT, ESP32_BAUD_RATE, timeout=ESP32_SERIAL_TIMEOUT)
    except Exception as e:
        print(f"[ESP32 연결 실패] {e}")
        return False
    time.sleep(ESP32_BOOT_WAIT_SECONDS)  # 포트 open 시 자동 리셋됨 — 부팅 완료까지 대기
    ser.reset_input_buffer()             # 부팅 로그(ets Jul.../rst:.../load:... 등) 버림
    with _lock:
        _ser = ser
    print("[ESP32 연결됨] 실시간 수신 시작")
    return True


def _close_port() -> None:
    global _ser
    with _lock:
        if _ser is not None:
            try:
                _ser.close()
            except Exception:
                pass
            _ser = None


def _reader_loop(
    on_missing_change: Callable[[bool, list[dict]], None] | None,
    on_fire_change: Callable[[bool, list[dict]], None] | None,
) -> None:
    global _latest, _latest_at
    missing_debouncer = StateDebouncer(MISSING_DEBOUNCE_SECONDS)
    fire_debouncer = StateDebouncer(FIRE_DEBOUNCE_SECONDS)
    last_ok = time.monotonic()   # 마지막으로 파싱에 성공한 시각

    while True:
        if _ser is None or not _ser.is_open:
            if not _open_port():
                time.sleep(ESP32_RECONNECT_SECONDS)
                continue

        try:
            line = _ser.readline().decode("utf-8", errors="ignore").strip()
        except Exception as e:
            print(f"[ESP32 읽기 실패, 재연결 시도] {e}")
            _close_port()
            continue

        readings = _parse_line(line) if line else []
        if not readings:
            # readline()은 타임아웃돼도 예외 없이 빈 값을 돌려준다. USB가 빠지거나 절전에서
            # 깨어나 연결이 죽으면 예외가 안 나므로, 위의 except로는 영영 못 잡고 조용히 굶는다.
            # 무응답이 길어지면 포트를 직접 닫아 재연결 경로를 타게 한다.
            if time.monotonic() - last_ok > SENSOR_STALE_SECONDS:
                print("[ESP32 무응답, 재연결 시도]")
                _close_port()
                last_ok = time.monotonic()
            continue

        last_ok = time.monotonic()
        _latest, _latest_at = readings, last_ok
        if SERIAL_MONITOR:
            print(f"[센서] {line}", flush=True)

        # 화재를 먼저 본다 — 둘 다 바뀌는 순간엔 화재가 우선순위가 높다
        if fire_debouncer.update(is_fire(readings), last_ok):
            print(f"[화재 상태 변경] {'화재 감지' if fire_debouncer.confirmed else '평상'}")
            if on_fire_change:
                try:
                    on_fire_change(bool(fire_debouncer.confirmed), readings)
                except Exception as e:
                    print(f"[화재 즉시 전송 실패] {e}")

        if missing_debouncer.update(is_missing(readings), last_ok):
            print(f"[이탈 상태 변경] {'이탈' if missing_debouncer.confirmed else '거치'}")
            if on_missing_change:
                try:
                    on_missing_change(bool(missing_debouncer.confirmed), readings)
                except Exception as e:
                    print(f"[이탈 즉시 전송 실패] {e}")
