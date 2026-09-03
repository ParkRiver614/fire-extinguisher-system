import threading
import time
import requests

import emergency_server
import sensors_esp32
from config import API_BASE, DEVICE_API_KEY, get_mac_address, get_wifi_signal_dbm
from vision import run_cycle
from sensors_esp32 import get_esp32_readings, is_missing

MAC = get_mac_address()
HEADERS = {"X-Device-Key": DEVICE_API_KEY}

# 이탈이 풀렸을 때 되돌릴 상태 — 마지막 비전 사이클의 판단 결과
_last_vision_status = "normal"


def get_interval_minutes() -> int:
    try:
        resp = requests.get(f"{API_BASE}/api/sensors/vision-interval", headers=HEADERS, timeout=5)
        resp.raise_for_status()
        return resp.json()["inference_interval_minutes"]
    except Exception as e:
        print(f"[interval 조회 실패, 기본값 30분 사용] {e}")
        return 30


def upload_snapshot(jpg_path: str) -> str | None:
    try:
        with open(jpg_path, "rb") as f:
            resp = requests.post(
                f"{API_BASE}/api/sensors/snapshot",
                files={"file": f},
                data={"mac_address": MAC},
                headers=HEADERS,
                timeout=15,
            )
        resp.raise_for_status()
        return resp.json()["snapshot_url"]
    except Exception as e:
        print(f"[스냅샷 업로드 실패] {e}")
        return None


def send_update(status: str, snapshot_url: str | None, vision_info: dict | None, sensor_readings: list[dict]):
    payload = {
        "mac_address": MAC,
        "status": status,
        "sensor_readings": sensor_readings,
    }
    if snapshot_url:
        payload["snapshot_url"] = snapshot_url
    if vision_info:
        payload["vision"] = vision_info

    try:
        resp = requests.post(f"{API_BASE}/api/sensors/update", json=payload, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        print(f"[전송 완료] status={status}")
    except Exception as e:
        print(f"[상태 전송 실패] {e}")


def _with_signal(readings: list[dict]) -> list[dict]:
    """센서 목록에 Wi-Fi 신호 세기를 덧붙인다 (유선 연결이면 그대로)."""
    signal_dbm = get_wifi_signal_dbm()
    if signal_dbm is None:
        return readings
    return readings + [{"sensor_type_name": "신호강도", "value": signal_dbm, "unit": "dBm"}]


def on_missing_change(missing: bool, readings: list[dict]) -> None:
    """무게 기반 이탈/거치가 확정되는 즉시 서버로 보낸다 — 비전 주기(수십 분)를 기다리지 않는다.
    시리얼 리더 스레드에서 호출된다."""
    status = "missing" if missing else _last_vision_status
    print(f"[즉시 전송] status={status}")
    send_update(status, None, None, _with_signal(readings))


def run_once():
    global _last_vision_status
    try:
        vision_status, jpg_path, vision_info = run_cycle()
    except Exception as e:
        print(f"[비전 처리 실패] {e}")
        vision_status, jpg_path, vision_info = "normal", None, None

    sensor_readings = _with_signal(get_esp32_readings())

    # 우선순위: 이탈(missing) > 비전 판단(obstacle_detected 등) > 정상
    if is_missing(sensor_readings):
        status = "missing"
        vision_info = None  # 이탈 상태에선 비전 판단 결과 의미 없음
    else:
        status = vision_status
        # 소화기가 제자리일 때의 판단만 기억한다 — 이탈 중 찍힌 빈 거치대를 장애물로 본
        # 결과를 남겨두면, 소화기를 되돌려놓는 순간 그 판단이 되살아난다.
        _last_vision_status = vision_status

    print(f"[판단 결과] status={status}")

    # 관리자가 설정한 비전 주기마다 항상 촬영본을 올린다 — 상세 화면이 최신 사진을 보여주도록.
    # 같은 상태가 반복될 때 이벤트 로그가 쌓이지 않게 거르는 일은 서버가 담당한다.
    snapshot_url = upload_snapshot(jpg_path) if jpg_path else None
    send_update(status, snapshot_url, vision_info, sensor_readings)


def main_loop():
    # 시리얼 포트(/dev/ttyUSB0)는 배타적이라 이 프로세스가 하나만 쥔다.
    # 무게는 리더 스레드가 실시간으로 보고, 비상 명령도 같은 연결로 나간다.
    sensors_esp32.start_reader(on_missing_change)
    threading.Thread(target=emergency_server.run, daemon=True).start()

    while True:
        interval_min = get_interval_minutes()
        try:
            run_once()
        except Exception as e:
            print(f"[사이클 실행 중 오류] {e}")
        print(f"[대기] {interval_min}분 후 다시 실행")
        time.sleep(interval_min * 60)


if __name__ == "__main__":
    main_loop()
