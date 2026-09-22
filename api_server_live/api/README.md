# FireGuard API

FastAPI 기반 소화기 관제 시스템 백엔드

## 프로젝트 구조

```
fire_guard/
├── main.py                    # FastAPI 앱 진입점
├── seed.py                    # 초기 데이터 삽입 (개발용)
├── requirements.txt
├── core/
│   ├── database.py            # SQLAlchemy 엔진 & 세션
│   ├── security.py            # JWT 발급/검증 & 인증 의존성
│   └── broadcaster.py         # SSE 이벤트 브로드캐스터
├── models/
│   └── models.py              # ORM 모델 (모든 테이블)
├── schemas/
│   └── schemas.py             # Pydantic 요청/응답 스키마
├── routers/
│   ├── auth.py                # POST /api/auth/login, GET /me, POST /logout
│   ├── extinguishers.py       # CRUD + 유지보수 이력
│   ├── sensors.py             # POST /api/sensors/update (Edge → Server)
│   ├── alerts.py              # 알림 목록 & 해결 처리
│   ├── events.py              # 이벤트 로그 & SSE 스트림
│   ├── admins.py              # 관리자 CRUD
│   ├── floors.py              # 층/구역 CRUD + 층별 맵 조회
│   ├── navigation.py          # 맵 조회 & Dijkstra 경로 탐색
│   ├── map_admin.py           # 노드/엣지 편집 (Admin 전용)
│   ├── settings.py            # 알림·점검·비상 설정 조회/수정
│   └── emergency.py           # 화재 비상 알림 트리거
└── services/
    ├── extinguisher_view.py   # ORM → ExtinguisherView 변환 헬퍼
    └── pathfinding.py         # Dijkstra 알고리즘
```

## 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `DATABASE_URL` | `mysql+pymysql://user:password@localhost:3306/fireguard` | MariaDB 연결 문자열 |
| `SECRET_KEY` | `change-me-in-production` | JWT 서명 키 (운영 시 반드시 변경) |

## 실행

```bash
# 의존성 설치
pip install -r requirements.txt

# 개발 서버 실행
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Swagger UI

서버 기동 후 `http://localhost:8000/docs` 접속

## SSE 연결 예시 (클라이언트)

```javascript
const token = localStorage.getItem('token');
const es = new EventSource(`/api/events/stream?token=${token}`);

es.onmessage = (e) => {
  const data = JSON.parse(e.data);
  if (data.type === 'snapshot') { /* 초기 상태 로드 */ }
  if (data.type === 'alert.created') { /* 새 알림 처리 */ }
  if (data.type === 'event.created') { /* 새 이벤트 처리 */ }
};
```

## 인증 불필요 엔드포인트

- `POST /api/sensors/update` — 내부망 전용 (Edge → Server)
- `GET /api/floors/{floor}/map` — App 실시간 맵 동기화용
- `POST /api/navigation/route` — 서버사이드 경로 계산 보조용

## 참고 사항

- 경로 탐색 알고리즘: **Dijkstra** (최단 경로)
- 화재 구역 노드는 `FloorNode.is_blocked = True` 로 설정하면 경유 차단
- `is_bidirectional = False` 인 엣지는 `from → to` 방향만 통행 가능 (일방통행)
- 센서 데이터 구조: `sensor_logs` (이벤트 묶음) → `sensor_data` (측정값) → `sensor_types` (센서 종류)
