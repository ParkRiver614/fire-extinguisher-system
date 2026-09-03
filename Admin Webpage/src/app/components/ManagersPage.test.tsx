import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManagersPage } from "./ManagersPage";
import { Admin } from "../types";
import { AuthUser } from "../auth";

const ADMIN_USER: AuthUser = { id: "99", email: "admin@example.com", name: "Admin", role: "admin" };

function makeAdmin(overrides: Partial<Admin> = {}): Admin {
  return {
    admin_id: 1,
    admin_name: "홍길동",
    email: "hong@example.com",
    role: "operator",
    phone_number: "010-1111-2222",
    assigned_floor_name: "1F",
    created_at: "2026-01-01T00:00:00",
    ...overrides,
  };
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: async () => body } as Response);
}

function renderManagersPage(admins: Admin[], currentUser: AuthUser = ADMIN_USER) {
  const setAdmins = vi.fn();
  const utils = render(<ManagersPage admins={admins} setAdmins={setAdmins} currentUser={currentUser} />);
  return { ...utils, setAdmins };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("/api/floors/detail")) return jsonResponse([]);
      return jsonResponse({});
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ManagersPage", () => {
  it("shows an empty state when there are no admins", () => {
    renderManagersPage([]);
    expect(screen.getByText("등록된 담당자가 없습니다")).toBeInTheDocument();
  });

  it("lists registered admins", () => {
    renderManagersPage([makeAdmin(), makeAdmin({ admin_id: 2, admin_name: "김철수", email: "kim@example.com" })]);
    expect(screen.getByText("홍길동")).toBeInTheDocument();
    expect(screen.getByText("김철수")).toBeInTheDocument();
  });

  it("filters admins by search text", async () => {
    const user = userEvent.setup();
    renderManagersPage([makeAdmin(), makeAdmin({ admin_id: 2, admin_name: "김철수", email: "kim@example.com" })]);

    await user.type(screen.getByPlaceholderText("이름, 이메일, 연락처, 층 검색…"), "김철수");

    expect(screen.getByText("김철수")).toBeInTheDocument();
    expect(screen.queryByText("홍길동")).not.toBeInTheDocument();
  });

  it("requires a confirmation click before deleting an admin", async () => {
    const user = userEvent.setup();
    const { setAdmins } = renderManagersPage([makeAdmin()]);

    await user.click(screen.getByTitle("담당자 삭제"));
    expect(setAdmins).not.toHaveBeenCalled();

    await user.click(screen.getByText("확인"));
    await waitFor(() => expect(setAdmins).toHaveBeenCalled());
  });

  it("selects an admin row and enables the bulk delete button", async () => {
    const user = userEvent.setup();
    renderManagersPage([makeAdmin()]);

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[1]);

    expect(screen.getByText("1명 삭제")).toBeInTheDocument();
  });

  it("matches admins with no assigned floor when searching the floor field for 전체", async () => {
    const user = userEvent.setup();
    renderManagersPage([
      makeAdmin({ admin_id: 1, admin_name: "Kim", assigned_floor_name: undefined }),
      makeAdmin({ admin_id: 2, admin_name: "Lee", assigned_floor_name: "1F" }),
    ]);

    await user.selectOptions(screen.getByDisplayValue("전체"), "담당 층");
    await user.type(screen.getByPlaceholderText("담당 층 검색…"), "전체");

    expect(screen.getByText("Kim")).toBeInTheDocument();
    expect(screen.queryByText("Lee")).not.toBeInTheDocument();
  });

  it("restricts search to the selected field when using the search scope dropdown", async () => {
    const user = userEvent.setup();
    renderManagersPage([
      makeAdmin({ admin_id: 1, admin_name: "Kim", email: "unique@x.com" }),
      makeAdmin({ admin_id: 2, admin_name: "unique", email: "other@x.com" }),
    ]);

    await user.selectOptions(screen.getByDisplayValue("전체"), "이메일");
    await user.type(screen.getByPlaceholderText("이메일 검색…"), "unique");

    expect(screen.getByText("Kim")).toBeInTheDocument();
    expect(screen.queryByText("unique")).not.toBeInTheDocument();
  });

  it("sorts rows by name ascending, then descending, then back to original order on repeated header clicks", async () => {
    const user = userEvent.setup();
    renderManagersPage([
      makeAdmin({ admin_id: 1, admin_name: "박영수" }),
      makeAdmin({ admin_id: 2, admin_name: "김철수" }),
    ]);

    const rowOrder = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).queryByText(/^(박영수|김철수)$/)?.textContent)
        .filter((text): text is string => Boolean(text));

    const nameHeader = screen.getByRole("columnheader", { name: "이름" });

    expect(rowOrder()).toEqual(["박영수", "김철수"]);

    await user.click(nameHeader);
    expect(rowOrder()).toEqual(["김철수", "박영수"]);

    await user.click(nameHeader);
    expect(rowOrder()).toEqual(["박영수", "김철수"]);

    await user.click(nameHeader);
    expect(rowOrder()).toEqual(["박영수", "김철수"]);
  });

  it("bulk-deletes selected admins", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes("/api/floors/detail")) return jsonResponse([]);
        if (init?.method === "DELETE") return jsonResponse({});
        return jsonResponse({});
      }),
    );
    const user = userEvent.setup();
    const { setAdmins } = renderManagersPage([
      makeAdmin({ admin_id: 1 }),
      makeAdmin({ admin_id: 2, admin_name: "김철수", email: "kim@example.com" }),
    ]);

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[1]);
    await user.click(checkboxes[2]);
    await user.click(screen.getByText("2명 삭제"));

    await waitFor(() => expect(setAdmins).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/admins/1"), expect.objectContaining({ method: "DELETE" }));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/admins/2"), expect.objectContaining({ method: "DELETE" }));
  });

  it("shows a validation error when submitting the add form without required fields", async () => {
    const user = userEvent.setup();
    renderManagersPage([]);

    await user.click(screen.getByRole("button", { name: /담당자 추가/ }));

    expect(await screen.findByText("이름, 이메일, 비밀번호, 연락처를 모두 입력하세요.")).toBeInTheDocument();
  });

  it("adds a new admin and shows a success message", async () => {
    const created = makeAdmin({ admin_id: 5, admin_name: "이영희", email: "lee@example.com" });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes("/api/floors/detail")) return jsonResponse([]);
        if (url.includes("/api/admins") && init?.method === "POST") return jsonResponse({ admin: created });
        return jsonResponse({});
      }),
    );
    const user = userEvent.setup();
    const { setAdmins } = renderManagersPage([]);

    await user.type(screen.getByPlaceholderText("예: 홍길동"), "이영희");
    await user.type(screen.getByPlaceholderText("예: user@example.com"), "lee@example.com");
    await user.type(screen.getByPlaceholderText("초기 비밀번호"), "TestPw!2026");
    await user.type(screen.getByPlaceholderText("예: 010-1234-5678"), "010-2222-3333");

    await user.click(screen.getByRole("button", { name: /담당자 추가/ }));

    expect(await screen.findByText("담당자가 추가되었습니다!")).toBeInTheDocument();
    expect(setAdmins).toHaveBeenCalled();
  });

  it("shows a server error message when adding an admin fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes("/api/floors/detail")) return jsonResponse([]);
        if (url.includes("/api/admins") && init?.method === "POST") {
          return jsonResponse({ detail: "이미 등록된 이메일입니다." }, false, 400);
        }
        return jsonResponse({});
      }),
    );
    const user = userEvent.setup();
    renderManagersPage([]);

    await user.type(screen.getByPlaceholderText("예: 홍길동"), "이영희");
    await user.type(screen.getByPlaceholderText("예: user@example.com"), "lee@example.com");
    await user.type(screen.getByPlaceholderText("초기 비밀번호"), "TestPw!2026");
    await user.type(screen.getByPlaceholderText("예: 010-1234-5678"), "010-2222-3333");

    await user.click(screen.getByRole("button", { name: /담당자 추가/ }));

    expect(await screen.findByText("이미 등록된 이메일입니다.")).toBeInTheDocument();
  });

  it("does not offer 'admin' as an assignable role for a manager-role caller", async () => {
    const MANAGER_USER: AuthUser = { id: "5", email: "mgr@example.com", name: "Mgr", role: "manager" };
    renderManagersPage([], MANAGER_USER);

    const roleSelect = screen.getByDisplayValue("역할 선택 (기본: 운영자)");
    expect(within(roleSelect).queryByText("관리자")).not.toBeInTheDocument();
    expect(within(roleSelect).getByText("매니저")).toBeInTheDocument();
    expect(within(roleSelect).getByText("운영자")).toBeInTheDocument();
    expect(within(roleSelect).getByText("열람자")).toBeInTheDocument();
  });

  it("hides the delete action for admin-role rows when the caller is only a manager", () => {
    const MANAGER_USER: AuthUser = { id: "5", email: "mgr@example.com", name: "Mgr", role: "manager" };
    renderManagersPage(
      [makeAdmin({ admin_id: 1, admin_name: "최고관리자", role: "admin" })],
      MANAGER_USER,
    );

    expect(screen.queryByTitle("담당자 삭제")).not.toBeInTheDocument();
  });
});
