import { test, expect } from "@playwright/test";
import { loginAsAdmin, shortTestId } from "./fixtures";

test("장치를 등록하고, 검색으로 찾은 뒤, 삭제할 수 있다", async ({ page }) => {
  await loginAsAdmin(page);
  await page.getByText("장치 관리").click();
  await expect(page.getByRole("heading", { name: "장치 관리", level: 1 })).toBeVisible();

  const testId = shortTestId("E2E-");

  // 폼에 필수값 채우기 (층 → 구역 → 모델, 각각 첫 번째 실제 옵션 선택)
  const selects = page.locator("form select");
  await selects.nth(0).selectOption({ index: 1 }); // 층
  await selects.nth(1).selectOption({ index: 1 }); // 구역
  await selects.nth(2).selectOption({ index: 1 }); // 소화기 모델

  await page.getByPlaceholder("예: FE-999").fill(testId);
  await page.getByRole("button", { name: "장치 추가" }).click();

  await expect(page.getByText("장치가 성공적으로 등록되었습니다!")).toBeVisible({ timeout: 10000 });

  // 검색으로 방금 등록한 장치만 필터링해서 확인
  await page.getByPlaceholder("ID, 구역, 담당자, 모델명, 날짜 검색…").fill(testId);
  await expect(page.getByText(testId, { exact: true })).toBeVisible({ timeout: 10000 });

  // 삭제: 두 번 클릭(확인) 방식
  await page.getByTitle("장치 삭제").click();
  await page.getByRole("button", { name: "확인" }).click();

  await expect(page.getByText("등록된 장치가 없습니다")).toBeVisible({ timeout: 10000 });
});
