
  # Admin Webpage

  This is a code bundle for Admin Webpage. The original project is available at https://www.figma.com/design/HpJ55xNH01bZqh1z1MqJ1i/Admin-Webpage.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Authentication

  The app no longer accepts any non-empty password locally. Login now calls a backend session API and expects the server to set an HttpOnly cookie.

  Configure the backend origin with `VITE_API_BASE_URL`. If it is omitted, requests are sent to the same origin as the frontend.

  Required endpoints:

  - `POST /api/auth/login` with `{ "email": string, "password": string, "rememberMe": boolean }`
  - `GET /api/auth/session`
  - `POST /api/auth/logout`

  Successful `login` and `session` responses must return:

  ```json
  {
    "user": {
      "id": "user-id",
      "email": "admin@example.com",
      "name": "Admin User",
      "role": "admin"
    }
  }
  ```

  Only `admin` and `manager` roles can enter the admin UI. The backend must still enforce permissions on every protected API route.

  For local UI development without an auth server, create `.env.local` and set `VITE_USE_MOCK_AUTH=true`. This only works in Vite dev mode. Test credentials:

  - Email / Password: see `MOCK_EMAIL` and `MOCK_PASSWORD` in `src/app/auth.ts` (dev-only mock path)

  ## Realtime alerts and events

  Alerts and event logs are now driven by backend data only. The UI no longer seeds static demo alerts or creates random timer-based log entries.

  Configure the backend origin with `VITE_API_BASE_URL`. Optionally set `VITE_REALTIME_URL` to an absolute `ws://`, `wss://`, or SSE URL. If `VITE_REALTIME_URL` is omitted, the app connects to `GET /api/events/stream` as an SSE stream.

  Required endpoints:

  - `GET /api/alerts`
  - `GET /api/events`
  - `GET /api/events/stream` for SSE, unless `VITE_REALTIME_URL` points to a WebSocket
  - `POST /api/alerts/:id/resolve`

  Stream messages should be JSON and may use these event shapes:

  ```json
  { "type": "alert.created", "alert": { "id": "AL-1048", "deviceId": "FE-101", "zone": "Lobby", "type": "Obstacle", "detail": "Access blocked", "status": "active", "timestamp": "2026-05-11T10:15:00Z" } }
  { "type": "alert.updated", "alert": { "id": "AL-1048", "deviceId": "FE-101", "zone": "Lobby", "type": "Obstacle", "detail": "Access blocked", "status": "resolved", "timestamp": "2026-05-11T10:20:00Z" } }
  { "type": "event.created", "event": { "id": "EV-901", "type": "warning", "text": "FE-101 temperature warning", "sub": "Threshold exceeded", "timestamp": "2026-05-11T10:15:00Z" } }
  ```
  
