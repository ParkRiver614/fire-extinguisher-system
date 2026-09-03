import { test, expect } from "@playwright/test";
import { loginAsAdmin, shortTestId } from "./fixtures";

test("담당자를 등록하고, 검색으로 찾은 뒤, 삭제할 수 있다", async ({ page }) => {
  await loginAsAdmin(page);
  await page.getByText("담당자 관리").click();
  await expect(page.getByRole("heading", { name: "담당자 관리", level: 1 })).toBeVisible();

  const testEmail = `${shortTestId("e2e-")}@example.com`;

  await page.getByPlaceholder("예: 홍길동").fill("E2E 테스트 담당자");
  await page.getByPlaceholder("예: user@example.com").fill(testEmail);
  await page.getByPlaceholder("초기 비밀번호").fill("E2eTest1234!");
  await page.getByPlaceholder("예: 010-1234-5678").fill("010-0000-0000");
  await page.getByRole("button", { name: "담당자 추가" }).click();

  await expect(page.getByText("담당자가 추가되었습니다!")).toBeVisible({ timeout: 10000 });

  await page.getByPlaceholder("이름, 이메일, 연락처, 층 검색…").fill(testEmail);
  await expect(page.getByText(testEmail, { exact: true })).toBeVisible({ timeout: 10000 });

  await page.getByTitle("담당자 삭제").click();
  await page.getByRole("button", { name: "확인" }).click();

  await expect(page.getByText("등록된 담당자가 없습니다")).toBeVisible({ timeout: 10000 });
});
