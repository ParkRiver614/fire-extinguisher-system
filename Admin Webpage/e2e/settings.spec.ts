import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./fixtures";

test("설정 화면에서 토글을 바꾸면 취소 버튼이 활성화되고, 취소하면 원래대로 돌아온다", async ({ page }) => {
  await loginAsAdmin(page);
  await page.getByText("설정", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "알림 관리", level: 1 })).toBeVisible();

  const cancelButton = page.getByRole("button", { name: "취소" });
  await expect(cancelButton).toBeDisabled();

  const fireRow = page.locator("div.flex.items-start", { has: page.getByText("화재 발생 알림") });
  await fireRow.getByRole("button").click();

  await expect(cancelButton).toBeEnabled();
  await cancelButton.click();
  await expect(cancelButton).toBeDisabled();
});
