import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiFetch, apiJson, login } from "./client";

interface AdminOut {
  admin_id: number;
  admin_name: string;
  email: string;
  role: string;
}

describe("담당자 API (실제 서버)", () => {
  const testEmail = `itest-${Date.now()}@example.com`;
  // 정리(afterAll)가 실패해 계정이 남더라도 비밀번호를 모르게 매 실행마다 새로 생성한다
  const testPassword = `It-${crypto.randomUUID()}!`;
  let createdAdminId: number | null = null;

  beforeAll(async () => {
    await login();
  });

  afterAll(async () => {
    if (createdAdminId != null) {
      await apiFetch(`/api/admins/${createdAdminId}`, { method: "DELETE" });
    }
  });

  it("담당자 목록을 조회하면 배열을 반환한다", async () => {
    const admins = await apiJson<AdminOut[]>("/api/admins");
    expect(Array.isArray(admins)).toBe(true);
  });

  it("담당자를 등록하면 목록에 나타나고, 수정과 삭제가 정상 동작한다", async () => {
    const created = await apiJson<AdminOut>("/api/admins", {
      method: "POST",
      body: JSON.stringify({
        admin_name: "통합테스트 담당자",
        email: testEmail,
        password: testPassword,
        role: "operator",
        phone_number: "010-0000-0000",
      }),
    });
    createdAdminId = created.admin_id;
    expect(created.email).toBe(testEmail);

    const afterCreate = await apiJson<AdminOut[]>("/api/admins");
    expect(afterCreate.some((a) => a.email === testEmail)).toBe(true);

    const updated = await apiJson<AdminOut>(`/api/admins/${created.admin_id}`, {
      method: "PUT",
      body: JSON.stringify({ admin_name: "통합테스트 담당자(수정됨)" }),
    });
    expect(updated.admin_name).toBe("통합테스트 담당자(수정됨)");

    const deleteRes = await apiFetch(`/api/admins/${created.admin_id}`, { method: "DELETE" });
    expect(deleteRes.ok).toBe(true);
    createdAdminId = null;

    const afterDelete = await apiJson<AdminOut[]>("/api/admins");
    expect(afterDelete.some((a) => a.email === testEmail)).toBe(false);
  });
});
