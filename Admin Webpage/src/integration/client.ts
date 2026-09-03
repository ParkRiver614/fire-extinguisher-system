export const API_BASE = process.env.INTEGRATION_API_BASE_URL!.replace(/\/$/, "");

let token: string | null = null;

export function authHeaders(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function deviceHeaders(): Record<string, string> {
  const key = process.env.INTEGRATION_DEVICE_API_KEY;
  return key ? { "X-Device-Key": key } : {};
}

export function getToken(): string {
  if (!token) throw new Error("로그인이 안 된 상태입니다. login()을 먼저 호출하세요.");
  return token;
}

export async function login(): Promise<{ id: number; email: string; role: string }> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.INTEGRATION_ADMIN_EMAIL,
      password: process.env.INTEGRATION_ADMIN_PASSWORD,
      rememberMe: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`로그인 실패 (${res.status}). .env.integration의 계정 정보를 확인하세요.`);
  }
  const body = await res.json();
  token = body.token;
  return body.user;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  // FormData(파일 업로드)일 땐 Content-Type을 강제하지 않음 — fetch가 알아서
  // multipart 경계(boundary)를 포함한 헤더를 설정해야 서버가 파싱할 수 있음
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...authHeaders(),
      ...init.headers,
    },
  });
}

// extinguishers.id 컬럼이 VARCHAR(20)이라 짧게 유지 (base36 타임스탬프 사용)
export function shortTestId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}`;
}

export async function apiJson<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`요청 실패: ${init.method ?? "GET"} ${path} → ${res.status} ${text}`);
  }
  return res.json();
}
