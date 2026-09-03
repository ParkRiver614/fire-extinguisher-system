import { Admin } from "../types";

export function nextAdminId(admins: Admin[]): number {
  return Math.max(0, ...admins.map((a) => a.admin_id)) + 1;
}
