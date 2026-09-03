import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./fixtures";

test("보고서 화면에서 KPI 카드가 표시되고 내보내기 메뉴를 열고 닫을 수 있다", async ({ page }) => {
  await loginAsAdmin(page);
  await page.getByText("보고서", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "보고서 및 분석", level: 1 })).toBeVisible();

  await expect(page.getByText("전체 소화기")).toBeVisible();
  await expect(page.getByText("이상 장치")).toBeVisible();
  await expect(page.getByText("배터리 부족 (≤30%)")).toBeVisible();
  await expect(page.getByText("미처리 알림")).toBeVisible();

  const exportButton = page.getByRole("button", { name: "내보내기" });
  await exportButton.click();
  await expect(page.getByText("CSV 내보내기")).toBeVisible();
  await expect(page.getByText("PDF 인쇄")).toBeVisible();

  // 메뉴 바깥을 클릭하면 닫힌다
  await page.getByText("보고서 및 분석").click();
  await expect(page.getByText("CSV 내보내기")).not.toBeVisible();
});
