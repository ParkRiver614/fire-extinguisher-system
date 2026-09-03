import { describe, expect, it } from "vitest";
import { nextAdminId } from "./managers";
import { Admin } from "../types";

function makeAdmin(overrides: Partial<Admin> = {}): Admin {
  return {
    admin_id: 1,
    admin_name: "관리자",
    email: "admin@example.com",
    role: "admin",
    created_at: "2026-01-01T00:00:00",
    ...overrides,
  };
}

describe("nextAdminId", () => {
  it("returns 1 for an empty admin list", () => {
    expect(nextAdminId([])).toBe(1);
  });

  it("returns one greater than the maximum existing id", () => {
    const admins = [makeAdmin({ admin_id: 3 }), makeAdmin({ admin_id: 7 }), makeAdmin({ admin_id: 2 })];
    expect(nextAdminId(admins)).toBe(8);
  });

  it("handles a single admin", () => {
    expect(nextAdminId([makeAdmin({ admin_id: 5 })])).toBe(6);
  });
});
