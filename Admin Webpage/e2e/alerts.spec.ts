import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./fixtures";

test("알림 화면에서 상태 필터와 검색으로 목록을 좁힐 수 있다", async ({ page }) => {
  await loginAsAdmin(page);
  await page.getByText("알림", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "알림 및 이벤트", level: 1 })).toBeVisible();

  // 실시간 스트림 연결 상태 표시가 뜬다 (LIVE / 연결 중 / 오프라인 / 오류 중 하나)
  await expect(page.locator("text=/LIVE|연결 중|오프라인|오류/").first()).toBeVisible({ timeout: 10000 });

  // 상태 필터: 전체 → 해결 완료 → 진행 중 전환이 동작한다
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await page.getByRole("button", { name: "해결 완료" }).click();
  await page.getByRole("button", { name: "진행 중" }).click();

  // 존재할 리 없는 검색어로 필터링하면 빈 상태 문구가 뜬다
  await page.getByPlaceholder("ID, 구역, 장치, 상세 내용 검색").fill("존재하지않는검색어zzz999");
  await expect(page.getByText("서버에서 수신된 알림이 없습니다")).toBeVisible({ timeout: 10000 });

  await page.getByPlaceholder("ID, 구역, 장치, 상세 내용 검색").fill("");
});
