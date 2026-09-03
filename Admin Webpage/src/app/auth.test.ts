import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN_KEY = "firewatch.token";

describe("canAccessAdmin", () => {
  it("allows all four known roles to log in (permissions are enforced per-action, not at login)", async () => {
    const { canAccessAdmin } = await import("./auth");
    expect(canAccessAdmin({ id: "1", email: "a@a.com", name: "A", role: "admin" })).toBe(true);
    expect(canAccessAdmin({ id: "2", email: "b@b.com", name: "B", role: "manager" })).toBe(true);
    expect(canAccessAdmin({ id: "3", email: "c@c.com", name: "C", role: "operator" })).toBe(true);
    expect(canAccessAdmin({ id: "4", email: "d@d.com", name: "D", role: "viewer" })).toBe(true);
  });
});

describe("auth against the real API (mock auth disabled)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("login without rememberMe stores the token in sessionStorage only", async () => {
    const { login } = await import("./auth");
    const user = { id: "1", email: "a@a.com", name: "A", role: "admin" as const };
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ token: "abc123", user }),
    });

    const result = await login("a@a.com", "pw", false);

    expect(result).toEqual(user);
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe("abc123");
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/login"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("login with rememberMe stores the token in localStorage", async () => {
    const { login } = await import("./auth");
    const user = { id: "1", email: "a@a.com", name: "A", role: "admin" as const };
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ token: "abc123", user }),
    });

    const result = await login("a@a.com", "pw", true);

    expect(result).toEqual(user);
    expect(localStorage.getItem(TOKEN_KEY)).toBe("abc123");
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("login throws AuthError with the server message on failure", async () => {
    const { login, AuthError } = await import("./auth");
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "잘못된 비밀번호입니다." }),
    });

    await expect(login("a@a.com", "wrong", false)).rejects.toThrow(AuthError);
    await expect(login("a@a.com", "wrong", false)).rejects.toThrow("잘못된 비밀번호입니다.");
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("login throws AuthError when the response payload is malformed", async () => {
    const { login, AuthError } = await import("./auth");
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await expect(login("a@a.com", "pw", false)).rejects.toThrow(AuthError);
  });

  it("getCurrentUser returns null when there is no stored token", async () => {
    const { getCurrentUser } = await import("./auth");
    const user = await getCurrentUser();
    expect(user).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("getCurrentUser clears the token and returns null on a 401", async () => {
    localStorage.setItem(TOKEN_KEY, "stale-token");
    const { getCurrentUser } = await import("./auth");
    (fetch as any).mockResolvedValue({ status: 401, ok: false, json: async () => ({}) });

    const user = await getCurrentUser();

    expect(user).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("getCurrentUser returns the user when the token is valid", async () => {
    localStorage.setItem(TOKEN_KEY, "good-token");
    const { getCurrentUser } = await import("./auth");
    const user = { id: "1", email: "a@a.com", name: "A", role: "admin" as const };
    (fetch as any).mockResolvedValue({ status: 200, ok: true, json: async () => ({ user }) });

    const result = await getCurrentUser();

    expect(result).toEqual(user);
  });

  it("logout clears the token even if the network call fails", async () => {
    localStorage.setItem(TOKEN_KEY, "abc123");
    const { logout } = await import("./auth");
    (fetch as any).mockRejectedValue(new Error("network down"));

    await logout();

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
