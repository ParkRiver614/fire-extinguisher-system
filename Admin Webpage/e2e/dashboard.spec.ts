import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./fixtures";

test("대시보드 도면에서 층을 전환하고 위치 편집 모드를 켰다 끌 수 있다", async ({ page }) => {
  await loginAsAdmin(page);
  await page.getByText("대시보드", { exact: true }).click();

  // 범례가 보이면 도면이 정상 렌더링된 것
  const legend = page.locator("div.absolute.bottom-4.left-4");
  await expect(legend.getByText("정상", { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(legend.getByText("경고", { exact: true })).toBeVisible();
  await expect(legend.getByText("이탈", { exact: true })).toBeVisible();

  // 층 드롭다운을 열고 두 번째 층으로 전환
  const floorDropdownButton = page.locator("button", { has: page.locator("svg.lucide-chevron-down") }).first();
  await floorDropdownButton.click();
  const floorOptions = page.locator("div.absolute.top-full button");
  await expect(floorOptions.first()).toBeVisible();
  const optionCount = await floorOptions.count();
  if (optionCount > 1) {
    await floorOptions.nth(1).click();
  } else {
    await floorOptions.nth(0).click();
  }

  // 위치 조정(편집) 모드 토글
  const editButton = page.getByRole("button", { name: "위치 조정" });
  await editButton.click();
  await expect(page.getByText("위치 편집 모드", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "저장 완료" }).click();
  await expect(page.getByText("위치 편집 모드", { exact: false })).not.toBeVisible();
});
