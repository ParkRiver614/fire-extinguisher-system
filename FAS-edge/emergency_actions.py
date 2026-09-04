"""비상 명령을 ESP32 시리얼 명령 문자열로 바꿔 내보내는 어댑터."""

from sensors_esp32 import send_command


def trigger_emergency(fire_level: str | None, led: bool, buzzer: bool) -> None:
    """LED/부저는 Pi가 아니라 ESP32(Fire.ino)에 물려있으므로, 시리얼로 명령을 전달한다.
    포트는 sensors_esp32의 리더 스레드가 계속 쥐고 있으므로 여기서 따로 열지 않고
    그 연결을 빌려 쓴다(/dev/ttyUSB0은 배타적이라 두 번 열 수 없음).
    덕분에 예전처럼 포트 open 후 부팅을 기다리는 6초 지연도 없어졌다."""
    print(f"[비상 동작] fire_level={fire_level}, LED={'ON' if led else 'OFF'}, 부저={'ON' if buzzer else 'OFF'}")

    cmd = f"LED:{'ON' if led else 'OFF'},BUZZER:{'ON' if buzzer else 'OFF'}\n"
    if send_command(cmd):
        print(f"[ESP32 명령 전송] {cmd.strip()}")
