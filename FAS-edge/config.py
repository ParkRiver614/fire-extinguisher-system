"""엣지(라즈베리파이) 공통 설정값 모음.

경로·API 주소·디바이스 키, 카메라 촬영 파라미터, 배경 차분 임계값,
ESP32 시리얼/로드셀 판정 기준을 한곳에 모아 둔다.
시크릿(FAS_API_BASE, FAS_DEVICE_API_KEY)은 .env → systemd EnvironmentFile로 주입.
"""

import os

# 이 파일이 놓인 디렉터리(~/FAS-edge)를 기준으로 잡는다.
# expanduser("~")를 쓰면 실행 사용자나 sudo 여부에 따라 HOME이 달라져 경로가 통째로 어긋난다.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WORK_DIR = os.path.join(BASE_DIR, "capture_tmp")
os.makedirs(WORK_DIR, exist_ok=True)

API_BASE = os.environ.get("FAS_API_BASE", "http://localhost:8000")
YOLO_MODEL = "yolo11n.pt"

CAPTURE_FRAMES = 30       # 노출 안정화를 위해 30프레임 촬영
USE_FRAME_INDEX = 29      # 마지막 프레임만 사용, 나머지는 삭제
CAPTURE_WIDTH = 800
CAPTURE_HEIGHT = 600
CROP_WIDTH = 1050
CROP_HEIGHT = 600

REFERENCE_PATH = os.path.join(BASE_DIR, "reference.jpg")
DIFF_PIXEL_THRESHOLD = 30    # 그레이스케일 밝기 차이 임계값 (0~255)
OBSTACLE_DIFF_RATIO = 0.4    # 달라진 픽셀 비율이 이 이상이면 장애물로 판단.
                             # 실측(2026-09-08):
                             #   장애물 없음  0.001~0.004 (기준 사진 직후) / 0.029 (조금 지난 뒤)
                             #   어두운 물체  0.545~0.612 (박스 어두운 면, 검은 물통)
                             #   밝은 물체    0.830~0.907
                             # 어두운 물체 하한(0.545) 대비 0.145 여유, 바닥값(0.029) 대비 14배.
                             # (0.35도 검토했으나, 발표 중 소화기를 만지며 생기는 드리프트가
                             #  더 현실적인 위험이라 오탐 쪽에 여유를 조금 더 뒀다.)
                             #
                             # DIFF_PIXEL_THRESHOLD를 낮춰 어두운 물체를 키우는 안도 실측했는데
                             # 역효과였다(30→5에서 검은면 1.7배 오르는 동안 바닥값은 10.4배).
                             # 검은 물체도 이미 면적 절반이 문턱 30을 넘고 있어 더 얻을 게 없는 반면,
                             # 배경 노이즈는 문턱을 낮추는 만큼 화면 전체에서 딸려 들어온다.
                             # 배율 기준 분리도는 문턱 30이 가장 좋다(18.8배). → 30 유지.
                             #
                             # 바닥값은 기준 사진이 최신일 때만 0에 가깝다. 소화기를 꺼냈다 꽂으면
                             # 위치가 미세하게 달라져 오르고, 1시간 방치 + 여러 번 이동 후엔 0.494까지
                             # 올라간 적이 있다. → 소화기를 손댄 뒤엔 vision.save_reference()로 재촬영할 것.
EXCLUDED_CLASSES = {"person"}  # 사람은 장애물 판단에서 제외(배경 차분 마스크에서 제거)


def get_mac_address() -> str:
    """이 기기의 MAC 주소 — 서버가 디바이스를 식별하는 키로 쓴다(무선 우선, 없으면 유선)."""
    for iface in ("wlan0", "eth0"):
        path = f"/sys/class/net/{iface}/address"
        if os.path.exists(path):
            with open(path) as f:
                return f.read().strip()
    raise RuntimeError("네트워크 인터페이스에서 MAC 주소를 찾을 수 없습니다.")


def get_wifi_signal_dbm() -> float | None:
    """/proc/net/wireless에서 wlan0의 신호 세기(dBm)를 읽음. 유선 연결이거나 읽기 실패 시 None."""
    try:
        with open("/proc/net/wireless") as f:
            lines = f.readlines()
        for line in lines[2:]:
            if line.strip().startswith("wlan0:"):
                return float(line.split()[3].rstrip("."))
    except Exception:
        pass
    return None


# 실제 값은 /home/min/FAS-edge/.env (git 제외)에 두고 systemd EnvironmentFile로 주입한다.
DEVICE_API_KEY = os.environ.get("FAS_DEVICE_API_KEY", "")

# ESP32 시리얼 통신 설정
ESP32_SERIAL_PORT = "/dev/ttyUSB0"  # 실제 연결 후 `ls /dev/tty*`로 확인 필요 (USB-CH340/CP210x면 보통 이 이름)
ESP32_BAUD_RATE = 115200
ESP32_SERIAL_TIMEOUT = 3  # 초

MISSING_WEIGHT_THRESHOLD = 250  # g, 이 값 이하면 소화기 이탈로 판단 (실측: 빈 상태 ~0g, 거치 시 ~510g — 중간값으로 설정)

# 가스(화재) 판정 — Fire.ino의 GAS_THRESHOLD와 같은 값으로 유지할 것.
# ESP32는 이 값을 넘으면 현장에서 LED/부저를 울리고, Pi는 같은 기준으로 서버에 화재를 보고한다.
# 둘이 어긋나면 "현장은 울리는데 관리자 웹은 모른다"(또는 그 반대)가 된다.
FIRE_GAS_THRESHOLD = 1000       # raw
                                # 실측(2026-09-08): 평상 411~773(하루 변동), 라이터 최고 2398.
                                # 평상 최고 대비 1.29배 여유 — 넉넉하진 않다.
                                # Pi 전원을 완전히 껐다 켜면 MQ 센서가 식었다가 예열되는 동안
                                # 값이 높게 나오므로, 콜드 스타트 직후 오탐이 날 수 있다.
                                # (실측 전이라 실제로 1000을 넘는지는 미확인 —
                                #  넘으면 예열 대기 시간을 두는 방식으로 막아야 한다.)

# 무게(이탈)·가스(화재) 실시간 감시 — ESP32가 200ms마다 값을 뱉으므로 시리얼을 계속 열어두고 읽는다
MISSING_DEBOUNCE_SECONDS = 3    # 바뀐 이탈/거치 상태가 이만큼 연속 유지돼야 확정 (로드셀 값 흔들림 무시)
FIRE_DEBOUNCE_SECONDS = 3       # 가스도 동일 — MQ 계열은 값이 흔들리므로 순간 스파이크로 경보하지 않는다
SENSOR_STALE_SECONDS = 30       # 마지막 수신이 이보다 오래되면 센서값 없음으로 취급
ESP32_RECONNECT_SECONDS = 5     # 시리얼이 끊겼을 때 재연결 시도 간격
ESP32_BOOT_WAIT_SECONDS = 6     # 포트 open 시 ESP32가 자동 리셋됨 — 부트로더+setup() 완료까지 대기
