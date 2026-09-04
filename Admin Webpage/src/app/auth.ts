/**
 * 로그인/세션 관리 모듈.
 *
 * 서버(/api/auth/*)로 로그인해 받은 JWT를 브라우저에 보관하고,
 * 이후 모든 API 요청에 붙일 Authorization 헤더(authHeaders)를 만들어 준다.
 * 백엔드 없이 UI만 볼 때는 VITE_USE_MOCK_AUTH=true로 목 계정을 쓴다(개발 빌드 한정).
 */
export type AuthRole = "admin" | "manager" | "operator" | "viewer";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: AuthRole;
  permissions?: string[];
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

export class AuthError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "AuthError";
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const USE_MOCK_AUTH = import.meta.env.DEV && import.meta.env.VITE_USE_MOCK_AUTH === "true";
const MOCK_EMAIL = "admin@example.com";
const MOCK_PASSWORD = "password";
const MOCK_USER: AuthUser = {
  id: "dev-admin",
  email: MOCK_EMAIL,
  name: "Dev Admin",
  role: "admin",
  permissions: ["*"],
};

// 토큰 저장 위치: "로그인 유지" 체크 시 localStorage(브라우저 껐다 켜도 유지),
// 아니면 sessionStorage(탭을 닫으면 사라짐). 둘 중 한 곳에만 두고 나머지는 지운다.
const TOKEN_KEY = "firewatch.token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}

function storeToken(token: string, remember: boolean): void {
  if (remember) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY);
  }
}

function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

// 보호된 API 호출에 붙일 인증 헤더. 토큰이 없으면 빈 객체.
export function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function assertMockCredentials(email: string, password: string, rememberMe: boolean): AuthUser {
  if (email === MOCK_EMAIL && password === MOCK_PASSWORD) {
    storeToken("mock-jwt-token", rememberMe);
    return MOCK_USER;
  }

  throw new AuthError("개발용 테스트 계정 정보가 올바르지 않습니다.");
}

// 로그인 응답 검증 — 실패 메시지는 서버 것을 우선 쓰고, 필수 필드가 빠지면 형식 오류로 처리.
async function parseAuthResponse(response: Response): Promise<AuthResponse> {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof payload?.message === "string"
        ? payload.message
        : "인증에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.";
    throw new AuthError(message, response.status);
  }

  if (!payload?.token || !payload?.user?.id || !payload?.user?.email || !payload?.user?.role) {
    throw new AuthError("서버 인증 응답 형식이 올바르지 않습니다.");
  }

  return payload;
}

// 로그인 성공 시 토큰을 저장하고 사용자 정보를 반환한다.
export async function login(email: string, password: string, rememberMe: boolean): Promise<AuthUser> {
  if (USE_MOCK_AUTH) {
    return assertMockCredentials(email, password, rememberMe);
  }

  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, rememberMe }),
  });

  const { token, user } = await parseAuthResponse(response);
  storeToken(token, rememberMe);
  return user;
}

// 저장된 토큰으로 현재 로그인 사용자를 조회. 토큰이 없거나 만료(401)면 토큰을 지우고 null.
export async function getCurrentUser(): Promise<AuthUser | null> {
  if (USE_MOCK_AUTH) {
    return getStoredToken() ? MOCK_USER : null;
  }

  const token = getStoredToken();
  if (!token) return null;

  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    method: "GET",
    headers: { ...authHeaders() },
  });

  if (response.status === 401) {
    clearToken();
    return null;
  }

  const payload = await response.json().catch(() => null);
  if (!payload?.user?.id || !payload?.user?.email || !payload?.user?.role) {
    throw new AuthError("서버 인증 응답 형식이 올바르지 않습니다.");
  }

  return payload.user;
}

// 토큰부터 지우고 서버에도 알린다 — 서버 호출이 실패해도 로그아웃은 성립하도록.
export async function logout(): Promise<void> {
  if (USE_MOCK_AUTH) {
    clearToken();
    return;
  }

  clearToken();

  await fetch(`${API_BASE_URL}/api/auth/logout`, {
    method: "POST",
    headers: { ...authHeaders() },
  }).catch(() => undefined);
}

const KNOWN_ROLES: AuthRole[] = ["admin", "manager", "operator", "viewer"];

// 관리자 웹 접근 가능 여부 — 알 수 없는 역할이면 차단(세부 권한은 permissions.ts).
export function canAccessAdmin(user: AuthUser): boolean {
  return KNOWN_ROLES.includes(user.role);
}
