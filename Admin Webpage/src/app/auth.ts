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

export function canAccessAdmin(user: AuthUser): boolean {
  return KNOWN_ROLES.includes(user.role);
}
