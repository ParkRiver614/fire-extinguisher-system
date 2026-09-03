import { describe, expect, it } from "vitest";
import { apiJson, login } from "./client";

interface UserOut {
  id: number;
  name: string;
  email: string;
  role: string;
}

describe("인증 (실제 서버)", () => {
  it("올바른 관리자 계정으로 로그인하면 admin 또는 manager 권한을 가진 사용자 정보를 반환한다", async () => {
    const user = await login();
    expect(user.email).toBe(process.env.INTEGRATION_ADMIN_EMAIL);
    expect(["admin", "manager"]).toContain(user.role);
  });

  it("로그인 후 /api/auth/me로 같은 사용자 정보를 다시 조회할 수 있다", async () => {
    const loggedIn = await login();
    const body = await apiJson<{ user: UserOut }>("/api/auth/me");
    expect(body.user.email).toBe(loggedIn.email);
    expect(body.user.role).toBe(loggedIn.role);
  });

  it("/api/auth/logout 호출이 성공한다", async () => {
    await login();
    const body = await apiJson<{ success: boolean }>("/api/auth/logout", { method: "POST" });
    expect(body.success).toBe(true);
  });
});
