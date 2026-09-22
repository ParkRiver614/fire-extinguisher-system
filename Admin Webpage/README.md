# Admin Webpage

파이어파인더 관리자 웹. 층별 평면도 위 소화기 상태, 실시간 알림·이벤트, 소화기·담당자 관리, 보고서, 설정 화면을 제공한다.
React 18 + TypeScript + Vite, Tailwind CSS + Radix UI. 초기 UI 시안은 [Figma](https://www.figma.com/design/HpJ55xNH01bZqh1z1MqJ1i/Admin-Webpage)에서 시작했다.

## 실행

```bash
cp .env.example .env.local     # VITE_API_BASE_URL 설정
pnpm install
pnpm dev
```

| 변수 | 설명 |
|---|---|
| `VITE_API_BASE_URL` | 백엔드 주소. 비우면 프론트와 같은 origin으로 요청 |
| `VITE_REALTIME_URL` | (선택) 실시간 스트림 주소. `ws://`·`wss://`면 WebSocket, 없으면 `GET /api/events/stream` SSE |
| `VITE_USE_MOCK_AUTH` | `true`면 백엔드 없이 목 계정으로 로그인 (Vite dev 모드에서만 동작, 계정은 `src/app/auth.ts`) |

`VITE_` 변수는 빌드 시점에 번들에 포함되므로 비밀값을 넣지 않는다.

## 테스트

```bash
pnpm test              # 유닛 (Vitest + Testing Library)
pnpm test:integration  # 실서버 대상 통합 테스트 — .env.integration 필요 (.env.integration.example 참고)
pnpm test:e2e          # Playwright
```

## 인증

JWT Bearer 방식.

- `POST /api/auth/login` `{ email, password, rememberMe }` → `{ token, user: { id, email, role, ... } }`
- `GET /api/auth/me` — 저장된 토큰으로 현재 사용자 조회 (401이면 토큰 삭제)
- `POST /api/auth/logout`

토큰은 "로그인 유지"를 체크하면 `localStorage`, 아니면 `sessionStorage`에 둔다(한쪽에만 저장).
역할은 `admin > manager > operator > viewer` 4단계이며, 화면 기능은 역할 서열로 제어하고 자신보다 높은 역할은 부여할 수 없다.
백엔드도 모든 보호 API에서 권한을 따로 검사해야 한다.

## 실시간 알림·이벤트

- 로그인 후 `GET /api/alerts`, `GET /api/events`로 초기 목록을 받고(한쪽이 실패해도 나머지는 표시)
- `GET /api/events/stream?token=...` SSE에 연결한다 (EventSource는 커스텀 헤더를 못 붙여 토큰을 쿼리로 전달)
- 끊기면 1초부터 최대 30초까지 지수 백오프로 재연결하고, 연결 상태를 화면에 표시한다
- 알림 해결: `POST /api/alerts/:id/resolve`

스트림 메시지 예:

```json
{ "type": "alert.created", "alert": { "id": "AL-1048", "deviceId": "FE-101", "zone": "Lobby", "type": "Obstacle", "detail": "Access blocked", "status": "active", "timestamp": "2026-05-11T10:15:00Z" } }
{ "type": "alert.updated", "alert": { "id": "AL-1048", "deviceId": "FE-101", "zone": "Lobby", "type": "Obstacle", "detail": "Access blocked", "status": "resolved", "timestamp": "2026-05-11T10:20:00Z" } }
{ "type": "event.created", "event": { "id": "EV-901", "type": "warning", "text": "FE-101 temperature warning", "sub": "Threshold exceeded", "timestamp": "2026-05-11T10:15:00Z" } }
```

필드 이름이 snake_case·camelCase로 섞여 와도 한 형태로 정규화하고, 필수값이 빠진 레코드는 화면에 올리지 않는다.

## 배포

```bash
docker build --build-arg VITE_API_BASE_URL=https://api.example.com -t fas-front .
```

멀티스테이지 빌드(node → nginx) — SPA fallback과 정적 파일 캐싱 설정 포함.
