import os

# 이 파일이 놓인 디렉터리(~/FAS-edge)를 기준으로 잡는다.
# expanduser("~")를 쓰면 sudo로 실행할 때 HOME이 /root로 바뀌어 경로가 통째로 어긋난다
# (emergency 서버가 포트 80을 쓰므로 main.py는 sudo로 돈다).
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
OBSTACLE_DIFF_RATIO = 0.75   # 달라진 픽셀 비율이 이 이상이면 장애물로 판단 (실측: 완전 차단 시에도 그레이스케일 밝기만으론 90%를 못 넘어 낮춤)
EXCLUDED_CLASSES = {"person"}  # 사람은 장애물 판단에서 제외(배경 차분 마스크에서 제거)


def get_mac_address() -> str:
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

# 무게(이탈) 실시간 감시 — ESP32가 200ms마다 값을 뱉으므로 시리얼을 계속 열어두고 읽는다
MISSING_DEBOUNCE_SECONDS = 3    # 바뀐 이탈/거치 상태가 이만큼 연속 유지돼야 확정 (로드셀 값 흔들림 무시)
SENSOR_STALE_SECONDS = 30       # 마지막 수신이 이보다 오래되면 센서값 없음으로 취급
ESP32_RECONNECT_SECONDS = 5     # 시리얼이 끊겼을 때 재연결 시도 간격
ESP32_BOOT_WAIT_SECONDS = 6     # 포트 open 시 ESP32가 자동 리셋됨 — 부트로더+setup() 완료까지 대기
