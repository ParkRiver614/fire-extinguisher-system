import { Page, expect } from "@playwright/test";

export async function loginAsAdmin(page: Page) {
  await page.goto("/");
  await page.getByPlaceholder("admin@example.com").fill(process.env.INTEGRATION_ADMIN_EMAIL!);
  await page.getByPlaceholder("비밀번호를 입력하세요").fill(process.env.INTEGRATION_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByText("실시간 모니터링")).toBeVisible({ timeout: 15000 });
}

export function shortTestId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}`;
}
