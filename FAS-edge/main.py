"""엣지 메인 루프 — 소화기 상태를 판단해 서버로 올리는 진입점.

두 갈래로 돈다.
  1) 주기 루프: 서버가 알려준 간격마다 촬영 → 비전 판단 → 스냅샷/상태 업로드
  2) 리더 스레드: ESP32 무게·가스를 실시간 감시하다 이탈/화재가 확정되면 즉시 업로드
동시에 관리자 비상 명령(LED/부저)을 받는 HTTP 서버도 스레드로 띄운다.
"""

import threading
import time
import requests

import emergency_server
import sensors_esp32
from config import API_BASE, DEVICE_API_KEY, get_mac_address, get_wifi_signal_dbm
from vision import run_cycle
from sensors_esp32 import get_esp32_readings

MAC = get_mac_address()
HEADERS = {"X-Device-Key": DEVICE_API_KEY}

# 리더 스레드가 확정한 실시간 상태 — 주기 루프와 콜백이 함께 참조한다
_missing = False
_fire = False
# 이탈·화재가 풀렸을 때 되돌릴 상태 — 마지막 비전 사이클의 판단 결과
_last_vision_status = "normal"


def _resolve_status(vision_status: str | None = None) -> str:
    """우선순위: 화재 > 이탈 > 비전 판단(장애물 등) > 정상.
    화재는 인명과 직결되고, 이탈은 소화기 자체가 없다는 뜻이라
    그 앞의 장애물 판단은 의미가 없다.

    vision_status를 주면(주기 사이클) 방금 찍은 판단을 쓰고,
    안 주면(상태 전환 콜백) 마지막으로 기억한 판단으로 되돌아간다."""
    if _fire:
        return "fire_detected"
    if _missing:
        return "missing"
    return vision_status if vision_status is not None else _last_vision_status


def get_interval_minutes() -> int:
    """관리자가 웹에서 설정한 비전 추론 주기(분)를 서버에서 받아온다. 실패 시 30분."""
    try:
        resp = requests.get(f"{API_BASE}/api/sensors/vision-interval", headers=HEADERS, timeout=5)
        resp.raise_for_status()
        return resp.json()["inference_interval_minutes"]
    except Exception as e:
        print(f"[interval 조회 실패, 기본값 30분 사용] {e}")
        return 30


def upload_snapshot(jpg_path: str) -> str | None:
    """촬영본을 서버에 올리고 저장된 URL을 돌려준다(상세 화면의 최신 사진용)."""
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
    """상태 + 센서값(+스냅샷/비전 결과)을 한 번에 서버로 전송. 이벤트 기록 여부는 서버가 판단."""
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
    global _missing
    _missing = missing
    status = _resolve_status()
    print(f"[즉시 전송] status={status}")
    send_update(status, None, None, _with_signal(readings))


def on_fire_change(fire: bool, readings: list[dict]) -> None:
    """가스 기반 화재/평상이 확정되는 즉시 서버로 보낸다.
    ESP32는 같은 기준으로 현장 LED/부저를 울리고, 이 보고를 받은 서버는 알림을 띄운 뒤
    비상 설정에 따라 장치로 제어 명령을 되돌려 보낸다."""
    global _fire
    _fire = fire
    status = _resolve_status()
    print(f"[즉시 전송] status={status}")
    send_update(status, None, None, _with_signal(readings))


def run_once():
    """주기 1회분: 촬영·비전 판단 → 센서값 수집 → 최종 상태 결정 → 서버 전송."""
    global _last_vision_status
    try:
        vision_status, jpg_path, vision_info = run_cycle()
    except Exception as e:
        print(f"[비전 처리 실패] {e}")
        vision_status, jpg_path, vision_info = "normal", None, None

    sensor_readings = _with_signal(get_esp32_readings())

    # 소화기가 제자리이고 평상일 때의 판단만 기억한다 — 이탈 중 찍힌 빈 거치대를 장애물로 본
    # 결과를 남겨두면, 소화기를 되돌려놓는 순간 그 판단이 되살아난다.
    #
    # 무게를 못 읽었으면 소화기가 있는지조차 모르는 상태다. 기동 직후엔 이 사이클이
    # 리더 스레드의 ESP32 연결(부팅 대기 6초)보다 먼저 도는데, 그때 _missing은 아직
    # 기본값 False라 위 조건만으로는 빈 거치대 판단이 그대로 기억된다.
    # tare() 때문에 재시작은 거치대를 비우고 해야 하므로 매번 이 상황이 만들어진다.
    knows_weight = any(r["sensor_type_name"] == "무게" for r in sensor_readings)
    if knows_weight and not _missing and not _fire:
        _last_vision_status = vision_status

    status = _resolve_status(vision_status)
    if status != vision_status:
        vision_info = None  # 이탈·화재 상태에선 비전 판단 결과가 의미 없음

    print(f"[판단 결과] status={status}")

    # 관리자가 설정한 비전 주기마다 항상 촬영본을 올린다 — 상세 화면이 최신 사진을 보여주도록.
    # 같은 상태가 반복될 때 이벤트 로그가 쌓이지 않게 거르는 일은 서버가 담당한다.
    snapshot_url = upload_snapshot(jpg_path) if jpg_path else None
    send_update(status, snapshot_url, vision_info, sensor_readings)


def main_loop():
    """리더 스레드와 비상 명령 서버를 띄우고, 설정된 주기로 run_once()를 반복한다."""
    # 시리얼 포트(/dev/ttyUSB0)는 배타적이라 이 프로세스가 하나만 쥔다.
    # 무게는 리더 스레드가 실시간으로 보고, 비상 명령도 같은 연결로 나간다.
    sensors_esp32.start_reader(on_missing_change, on_fire_change)
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
