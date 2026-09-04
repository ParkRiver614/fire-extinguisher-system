import { Admin } from "../types";

// 새 관리자에 부여할 임시 ID(기존 최대값+1).
export function nextAdminId(admins: Admin[]): number {
  return Math.max(0, ...admins.map((a) => a.admin_id)) + 1;
}
