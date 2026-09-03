import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./fixtures";

test.describe("로그인", () => {
  test("잘못된 비밀번호로 로그인하면 에러 메시지가 뜬다", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("admin@example.com").fill(process.env.INTEGRATION_ADMIN_EMAIL!);
    await page.getByPlaceholder("비밀번호를 입력하세요").fill("잘못된비밀번호12345");
    await page.getByRole("button", { name: "로그인" }).click();

    await expect(page.locator("p", { hasText: /실패|올바르지|오류/ })).toBeVisible({ timeout: 10000 });
  });

  test("올바른 계정으로 로그인하면 대시보드로 이동하고, 로그아웃하면 로그인 화면으로 돌아온다", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByText("장치 관리")).toBeVisible();

    await page.locator("aside button:has(svg.lucide-log-out)").click();
    await expect(page.getByPlaceholder("비밀번호를 입력하세요")).toBeVisible({ timeout: 10000 });
  });
});
