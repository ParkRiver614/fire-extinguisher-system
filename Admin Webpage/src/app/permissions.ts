import type { AdminRole } from "./types";

// 숫자가 작을수록 높은 권한.
export const ROLE_RANK: Record<AdminRole, number> = {
  admin: 0,
  manager: 1,
  operator: 2,
  viewer: 3,
};

export function roleRank(role: AdminRole): number {
  return ROLE_RANK[role] ?? ROLE_RANK.viewer;
}

// role이 minRole과 같거나 더 높은 권한인지 (예: hasMinRole(role, "manager") → admin/manager만 true)
export function hasMinRole(role: AdminRole, minRole: AdminRole): boolean {
  return roleRank(role) <= roleRank(minRole);
}

// callerRole이 targetRole을 자신에게/남에게 부여할 수 있는지 (자신보다 높은 권한은 줄 수 없음)
export function canAssignRole(callerRole: AdminRole, targetRole: AdminRole): boolean {
  return roleRank(targetRole) >= roleRank(callerRole);
}
