# 파이어파인더 (Fire Extinguisher Management System)

IoT 기반 소화기 위치·상태 관리 시스템. 건물에 배치된 소화기를 라즈베리파이 엣지 디바이스가 상시 감시하고,
관리자 웹에서 층별 도면 위 위치·상태·알림을 실시간으로 확인한다.

> 이 저장소는 **관리자 웹 프론트엔드**와 **엣지/펌웨어** 부분을 공개한 것이다.
> 백엔드(FastAPI + MariaDB)는 비공개 저장소에서 관리한다.
>
> 개발에 AI 코딩 도구를 활용했다. 아래 [설계에서 실제로 문제가 됐던 것들](#설계에서-실제로-문제가-됐던-것들)은
> 하드웨어를 실제로 돌려보며 진단하고 실측값을 근거로 조정한 결과다.

## 해결하려는 문제

소화기는 "있는 것"보다 **필요할 때 쓸 수 있는 상태인지**가 중요하다. 실제로는 자리를 벗어나거나,
앞이 물건으로 막히거나, 압력이 빠져도 다음 점검(보통 월 1회 육안 점검) 전까지 아무도 모른다.
이 시스템은 그 공백을 자동 감시로 메운다.

## 감지하는 것

| 항목 | 방식 |
|---|---|
| 소화기 이탈 | 로드셀 무게 측정 (임계값 미만이 디바운스 구간 동안 유지되면 이탈 확정) |
| 전방 장애물 | 카메라 촬영 → 기준 이미지와 배경 차분 + YOLO11로 사람 영역 제외 |
| 화재 정황 | 가스 센서 / 온습도 센서 |
| 디바이스 상태 | MAC 주소 기반 식별, Wi-Fi 신호 세기(dBm) 리포트 |

## 구성

```
사용자 ── 관리자 웹 (React + Vite, nginx)
              │  REST + SSE
              ▼
         백엔드 API (FastAPI + MariaDB)   ← 비공개
              ▲
              │  REST (X-Device-Key 인증)
      라즈베리파이 엣지 (FAS-edge/)
              │  USB 시리얼
              ▼
         ESP32 펌웨어 (Fire/)
      가스 · 온습도 · 로드셀 · 부저/경광등
```

### `Admin Webpage/` — 관리자 웹

React 18 + TypeScript + Vite, Tailwind + Radix UI 기반 컴포넌트, nginx로 정적 서빙(Docker).

- 층별 도면 위에 소화기 위치를 표시하고 상태별로 색을 구분하는 **플로어 맵**
- 이탈·장애물·화재 **알림**과 이벤트 로그, 기간별 리포트
- 디바이스 / 담당자 CRUD, **역할 기반 권한**(admin · manager · operator · viewer)
- SSE로 상태 변화를 실시간 반영, 소화기 상세에서 최신 스냅샷 확인
- 테스트: Vitest 유닛 · 실서버 대상 통합 테스트 · Playwright E2E 3단 구성

### `FAS-edge/` — 라즈베리파이 엣지

- `main.py` — 비전 추론 주기 루프와 무게 실시간 감시를 한 프로세스에서 운영. 상태 변화 시 즉시 서버 전송
- `vision.py` — 노출 안정화용 연속 촬영 후 마지막 프레임 사용, 기준 이미지 대비 픽셀 차분 비율로 장애물 판정 (YOLO11로 사람은 마스킹해 오탐 제거)
- `sensors_esp32.py` — ESP32 시리얼 프로토콜 파싱, 로드셀 흔들림을 흡수하는 디바운스, 값 노후화(stale) 처리
- `emergency_server.py` — 서버에서 내려오는 비상 명령(부저·경광등) 수신
- `fas-edge.service` — systemd 유닛. `/dev/ttyUSB0`이 배타적 자원이라 비전 루프와 비상 리스너를 한 프로세스로 합쳐 시리얼 소유자를 하나로 유지

### `Fire/` — ESP32 펌웨어

가스·온습도·로드셀을 읽어 `KEY:VALUE` 콤마 구분 한 줄로 시리얼 출력. 파이에서 오는 비상 명령에 부저·경광등으로 응답.

## 설계에서 실제로 문제가 됐던 것들

- **시리얼 포트 경합** — 무게를 실시간으로 읽으려면 포트를 계속 쥐고 있어야 하는데, 그러면 별도 프로세스였던 비상 명령 리스너가 포트를 열지 못했다. 두 서비스를 한 프로세스로 합쳐 시리얼 소유자를 하나로 만들어 해결.
- **장애물 오탐** — 밝기 차분만으로는 사람이 앞을 지나가도 장애물로 잡혔다. YOLO11로 `person` 클래스를 검출해 차분 마스크에서 제외.
- **차분 임계값** — 완전 차단 상황에서도 그레이스케일 밝기 차이만으로는 변화 픽셀 비율이 90%를 넘지 않아, 실측값을 근거로 임계값을 0.75로 조정.
- **로드셀 노이즈** — 값이 임계값 근처에서 흔들려 이탈/거치가 반복 전송됐다. 바뀐 상태가 일정 시간 유지돼야 확정하는 디바운스를 도입.
- **sudo와 경로** — 비상 서버가 80 포트를 쓰느라 root로 돌면서 `expanduser("~")`가 `/root`로 바뀌어 경로가 어긋났다. 파일 기준 절대경로로 전환하고, 이후엔 root 대신 `CAP_NET_BIND_SERVICE`만 부여하도록 정리.

## 실행

### 관리자 웹

```bash
cd "Admin Webpage"
cp .env.example .env.local     # VITE_API_BASE_URL 설정
pnpm install
pnpm dev
```

백엔드 없이 UI만 볼 때는 `.env.local`에 `VITE_USE_MOCK_AUTH=true` (Vite dev 모드에서만 동작).

테스트:

```bash
pnpm test              # 유닛 (Vitest)
pnpm test:integration  # 실서버 대상 — .env.integration 필요
pnpm test:e2e          # Playwright
```

배포 (Docker). `VITE_` 변수는 빌드 시점에 번들에 포함되므로 배포 대상별로 따로 빌드한다:

```bash
docker build --build-arg VITE_API_BASE_URL=https://api.example.com -t fas-front "Admin Webpage"
```

### 엣지

```bash
cd FAS-edge
cp .env.example .env           # FAS_API_BASE, FAS_DEVICE_API_KEY 입력
pip install -r requirements.txt
python main.py
pytest                         # 비전 판정 / 센서 파싱 유닛 테스트
```

라즈베리파이에는 systemd로 등록한다:

```bash
sudo cp fas-edge.service /etc/systemd/system/
sudo systemctl enable --now fas-edge
```

## 기술 스택

**프론트엔드** React 18 · TypeScript · Vite · Tailwind CSS · Radix UI · Vitest · Playwright · Docker/nginx
**엣지** Python · OpenCV · YOLO11(Ultralytics) · pyserial · systemd
**펌웨어** ESP32 (Arduino) · HX711 로드셀 · 가스/온습도 센서
**백엔드**(비공개) FastAPI · MariaDB · SQLAlchemy · SSE · Docker Compose
