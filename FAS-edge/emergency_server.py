"""관리자 비상 명령 수신 서버 (POST /emergency).

백엔드가 화재 경보 시 이 Pi로 직접 호출하면 ESP32의 LED/부저를 켠다.
main.py가 데몬 스레드로 띄운다 — 단독 실행 금지(시리얼 포트 충돌).
"""

import json
from http.server import BaseHTTPRequestHandler, HTTPServer

from emergency_actions import trigger_emergency


class EmergencyHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        """POST /emergency — {fire_level, led, buzzer}를 받아 ESP32로 전달한다."""
        if self.path != "/emergency":
            self.send_response(404)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self.send_response(400)
            self.end_headers()
            return

        fire_level = data.get("fire_level")
        led = bool(data.get("led", False))
        buzzer = bool(data.get("buzzer", False))

        print(f"[비상 명령 수신] fire_level={fire_level}, led={led}, buzzer={buzzer}")
        trigger_emergency(fire_level, led, buzzer)

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"success": True}).encode())

    def log_message(self, format, *args):
        pass  # 기본 접속 로그 끔


def run(port: int = 80):
    # 데몬 스레드로 도는 자리라, 바인드 실패가 조용히 묻히면 비상 명령이 영영 안 들어온다.
    # (포트 80은 root 권한 필요 / 예전 emergency_server.py가 아직 떠 있으면 사용 중)
    try:
        server = HTTPServer(("0.0.0.0", port), EmergencyHandler)
    except OSError as e:
        print(f"[emergency 서버 시작 실패] 포트 {port} 바인드 불가: {e}")
        print("  → sudo로 실행했는지, 예전 emergency_server.py가 아직 떠 있지 않은지 확인하세요.")
        return
    print(f"[emergency 서버 시작] 0.0.0.0:{port}")
    server.serve_forever()

# 단독 실행 진입점 없음 — 시리얼 포트를 쥔 main.py가 이 서버를 스레드로 띄운다.
# 따로 띄우면 ESP32 포트를 못 잡아서 LED/부저 명령이 나가지 않는다.
