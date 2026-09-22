# 파이어파인더 (Fire Extinguisher Management System)

IoT 기반 소화기 위치·상태 관리 시스템. 건물에 배치된 소화기를 라즈베리파이 엣지 디바이스가 상시 감시하고,
관리자 웹에서 층별 도면 위 위치·상태·알림을 실시간으로 확인한다.

> 관리자 웹 · 백엔드 API · 엣지 · 펌웨어 전 구간을 공개한다.
>
> 개발에 AI 코딩 도구를 활용했다. 아래 [설계에서 실제로 문제가 됐던 것들](#설계에서-실제로-문제가-됐던-것들)은
> 하드웨어와 실제 배포 환경을 돌려보며 진단하고 실측값을 근거로 조정한 결과다.

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
사용자 ── 관리자 웹 (React + Vite, nginx)          Admin Webpage/
              │  REST + SSE
              ▼
         백엔드 API (FastAPI + MariaDB)            api_server_live/api/
              ▲
              │  REST (X-Device-Key 인증)
      라즈베리파이 엣지 (Python, YOLO11)            FAS-edge/
              │  USB 시리얼
              ▼
         ESP32 펌웨어                              Fire/
      가스 · 온습도 · 로드셀 · 부저/경광등
```

### `Admin Webpage/` — 관리자 웹

React 18 + TypeScript + Vite, Tailwind + Radix UI 기반 컴포넌트, nginx로 정적 서빙(Docker).

- 층별 도면 위에 소화기 위치를 표시하고 상태별로 색을 구분하는 **플로어 맵**. 도면 이미지 비율에 맞춰 SVG 캔버스를 층별로 계산해 마커 좌표가 어긋나지 않게 한다
- 이탈·장애물·화재 **알림**과 이벤트 로그, 기간별 리포트
- 디바이스 / 담당자 CRUD, **역할 기반 권한**(admin · manager · operator · viewer)
- SSE로 상태 변화를 실시간 반영, 소화기 상세에서 최신 스냅샷 확인
- 테스트: Vitest 유닛 · 실서버 대상 통합 테스트 · Playwright E2E 3단 구성

### `api_server_live/api/` — 백엔드 API

FastAPI + SQLAlchemy + MariaDB. 11개 라우터로 인증·장치·층/구역·알림·이벤트·설정·경로안내를 제공한다.

- **인증** JWT(HS256). `SECRET_KEY`가 비어 있거나 알려진 기본값이면 기동을 거부한다
- **장치 인증** 엣지가 쓰는 `/api/sensors/*`는 `X-Device-Key` 헤더로 분리 인증하고, 비교는 타이밍 공격을 피해 `secrets.compare_digest`로 한다
- **실시간 전달** SSE 브로드캐스터. 상태가 *바뀔 때만* 이벤트 로그를 남겨 주기 보고로 로그가 무한히 쌓이는 것을 막고, 미해결 알림은 반대로 계속 누적시킨다
- **업로드** 파일명·Content-Type을 믿지 않고 바이트를 실제로 디코딩해 포맷을 판별한 뒤 확장자를 강제하고 UUID로 저장. 크기 상한은 `MAX_UPLOAD_BYTES`
- **경로 안내** 층 노드/엣지 그래프 기반 최단 경로(`services/pathfinding.py`)
- 배포는 Docker Compose (`docker-compose.aws.yml`). 시크릿은 전부 환경변수로 주입하며 저장소에는 예시 파일만 둔다

주요 테이블은 건물/층/구역/노드, 소화기와 모델, 센서 로그·비전 로그·정비 이력, 알림·이벤트, 기능별 설정 4종으로 나뉜다.

### `FAS-edge/` — 라즈베리파이 엣지

- `main.py` — 비전 추론 주기 루프와 무게 실시간 감시를 한 프로세스에서 운영. 상태 변화 시 즉시 서버 전송
- `vision.py` — 노출 안정화용 연속 촬영 후 마지막 프레임 사용, 기준 이미지 대비 픽셀 차분 비율로 장애물 판정 (YOLO11로 사람은 마스킹해 오탐 제거)
- `sensors_esp32.py` — ESP32 시리얼 프로토콜 파싱, 로드셀 흔들림을 흡수하는 디바운스, 값 노후화(stale) 처리
- `emergency_server.py` — 서버에서 내려오는 비상 명령(부저·경광등) 수신
- `fas-edge.service` — systemd 유닛. `/dev/ttyUSB0`이 배타적 자원이라 비전 루프와 비상 리스너를 한 프로세스로 합쳐 시리얼 소유자를 하나로 유지

### `Fire/` — ESP32 펌웨어

가스·온습도·로드셀을 읽어 `KEY:VALUE` 콤마 구분 한 줄로 시리얼 출력. 파이에서 오는 비상 명령에 부저·경광등으로 응답.
가스 임계값은 파이 쪽 설정과 같은 값을 유지해야 한다 — 어긋나면 "현장 부저는 울리는데 관리자 웹은 모르는" 상태가 된다.

## 설계에서 실제로 문제가 됐던 것들

### 하드웨어·엣지

- **시리얼 포트 경합** — 무게를 실시간으로 읽으려면 포트를 계속 쥐고 있어야 하는데, 그러면 별도 프로세스였던 비상 명령 리스너가 포트를 열지 못했다. 두 서비스를 한 프로세스로 합쳐 시리얼 소유자를 하나로 만들어 해결.
- **장애물 오탐** — 밝기 차분만으로는 사람이 앞을 지나가도 장애물로 잡혔다. YOLO11로 `person` 클래스를 검출해 차분 마스크에서 제외.
- **차분 임계값** — 실측해보니 장애물 없음이 0.001~0.029, 어두운 물체가 0.545~0.612, 밝은 물체가 0.830~0.907이었다. 어두운 물체 하한 대비 여유를 두고 0.4로 잡았다. 문턱을 낮춰 어두운 물체 감도를 올리는 안도 재봤지만, 배경 노이즈가 더 빨리 올라와 분리도가 나빠져 기각했다.
- **로드셀 노이즈** — 값이 임계값 근처에서 흔들려 이탈/거치가 반복 전송됐다. 바뀐 상태가 일정 시간 유지돼야 확정하는 디바운스를 도입.
- **sudo와 경로** — 비상 서버가 80 포트를 쓰느라 root로 돌면서 `expanduser("~")`가 `/root`로 바뀌어 경로가 어긋났다. 파일 기준 절대경로로 전환하고, 이후엔 root 대신 `CAP_NET_BIND_SERVICE`만 부여하도록 정리.

### 배포·통합

- **빌드 시점에 박히는 환경변수** — Vite의 `VITE_*`는 런타임이 아니라 **빌드 시점**에 번들로 들어간다. 서버를 옮기고 환경변수만 바꿨더니, 페이지는 정상인데 데이터만 안 나왔다. 브라우저가 받은 JS 안에 옛 API 주소가 그대로 박혀 있었다. 배포 대상이 바뀌면 재빌드가 필요하다.
- **기본값으로 박아둔 서버 주소** — 스냅샷 URL을 만드는 `PUBLIC_BASE_URL`이 특정 서버를 기본값으로 갖고 있어서, 다른 환경에 올렸을 때 *사진 URL만* 조용히 옛 서버를 가리켰다. 나머지가 전부 정상이라 원인을 찾기 어려웠다. 환경별 값은 기본값을 두지 않는 편이 낫다.
- **파생 필드의 부분 갱신** — 실시간 이벤트로 장치 상태를 갱신할 때 코드값(`status`)만 바꾸고 표시용 라벨(`status_name`)은 두었더니, DB는 "이탈"인데 화면은 "장애물 감지"로 남았다. 코드값은 여러 상태를 한 값으로 뭉개기 때문에 거기서 라벨을 되돌릴 수 없어, 서버가 둘을 함께 내려주도록 바꿨다.
- **UTC와 로컬 시각** — 서버가 UTC 시각을 포맷한 문자열을 함께 내려줬고 클라이언트가 그 문자열을 그대로 썼다. 같은 사건이 알림 목록과 이벤트 로그에 9시간 차이로 표시됐다. 타임존이 붙은 원본 타임스탬프 하나만 쓰도록 통일.
- **거짓말하는 "마지막 새로고침"** — 갱신 시각이 컴포넌트가 처음 그려진 시각으로 초기화돼 있어서, 오래된 데이터 옆에 방금 시각이 찍혔다. 이것 때문에 위의 상태 불일치를 한동안 서버 문제로 오진했다. 실제 재조회에 성공했을 때만 채우도록 수정.

## 보안

- 시크릿(JWT 키, DB 비밀번호, 장치 인증키)은 전부 환경변수로 주입한다. 저장소에는 값이 빈 예시 파일만 둔다
- `SECRET_KEY`가 비었거나 알려진 약한 값이면 서버가 기동을 거부한다
- CORS 허용 출처는 `CORS_ALLOW_ORIGINS`로 지정한다. 와일드카드와 인증정보 허용을 함께 켜면 임의의 사이트가 인증된 요청을 보낼 수 있다
- 시드 스크립트의 계정 비밀번호는 `SEED_PASSWORD`로 받는다. 값을 주지 않으면 DB에 손대기 전에 실행을 거부한다
- 관리자 권한은 `admin > manager > operator > viewer` 계층으로 검사하며, 자기보다 높은 역할을 부여할 수 없다

## 실행

### 백엔드 API

```bash
cd api_server_live/api
pip install -r requirements.txt

export SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"
export DEVICE_API_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
export DATABASE_URL="mysql+pymysql://user:password@localhost:3306/fireguard"
export CORS_ALLOW_ORIGINS="http://localhost:5173"
export PUBLIC_BASE_URL="http://localhost:8000"

uvicorn main:app --reload
```

데모 데이터가 필요하면:

```bash
SEED_PASSWORD='<직접 정한 비밀번호>' python seed.py
```

테스트는 sqlite로 돌아서 DB·하드웨어가 필요 없다:

```bash
python test_sensor_update.py      # 주기 보고 정리 / 이벤트 중복 억제
python test_sse_status_name.py    # 상태 변화 시 SSE 페이로드
```

### 관리자 웹

```bash
cd "Admin Webpage"
cp .env.example .env.local     # VITE_API_BASE_URL 설정
npm install
npm run dev
```

백엔드 없이 UI만 볼 때는 `.env.local`에 `VITE_USE_MOCK_AUTH=true` (Vite dev 모드에서만 동작).

```bash
npm test               # 유닛 (Vitest)
npm run test:integration   # 실서버 대상 — .env.integration 필요
npm run test:e2e           # Playwright
```

배포 시 `VITE_` 변수는 빌드 시점에 번들에 포함되므로 배포 대상별로 따로 빌드한다:

```bash
docker build --build-arg VITE_API_BASE_URL=https://api.example.com -t fas-front "Admin Webpage"
```

### 엣지

```bash
cd FAS-edge
cp .env.example .env           # FAS_API_BASE, FAS_DEVICE_API_KEY 입력
pip install -r requirements.txt
python main.py
pytest                         # 비전 판정 / 센서 파싱 / 상태 결정 유닛 테스트
```

라즈베리파이에는 systemd로 등록한다:

```bash
sudo cp fas-edge.service /etc/systemd/system/
sudo systemctl enable --now fas-edge
```

### 전체 스택 (Docker Compose)

`docker-compose.aws.yml`은 배포 서버의 디렉터리 배치(`api/`, `FASFront/`)를 기준으로 쓰여 있어서,
저장소를 클론한 상태 그대로는 빌드 경로가 맞지 않는다. 배포 시에는 빌드 컨텍스트를 아래처럼 맞춘 뒤 올린다.

| compose의 경로 | 이 저장소의 경로 |
|---|---|
| `./api` | `api_server_live/api` |
| `./FASFront` | `Admin Webpage`의 빌드 산출물 |

```bash
cp .env.aws.example .env.aws   # 값 채우기 (DB 비밀번호, SECRET_KEY, DEVICE_API_KEY, 주소)
docker compose -f docker-compose.aws.yml --env-file .env.aws up -d
```

`CORS_ALLOW_ORIGINS`(= `FRONT_ORIGIN`)와 `PUBLIC_BASE_URL`(= `API_BASE_URL`)을 비워두면
웹에서 API 호출이 막히거나 스냅샷 이미지가 깨진다.

## 기술 스택

**프론트엔드** React 18 · TypeScript · Vite · Tailwind CSS · Radix UI · Vitest · Playwright · Docker/nginx
**백엔드** FastAPI · SQLAlchemy · MariaDB · JWT · SSE · Pillow · Docker Compose
**엣지** Python · OpenCV · YOLO11(Ultralytics) · pyserial · systemd
**펌웨어** ESP32 (Arduino) · HX711 로드셀 · 가스/온습도 센서
