import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";

const TOKEN_KEY = "firewatch.token";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: async () => body } as Response);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LoginPage", () => {
  it("initializes with empty credentials and remember-me unchecked", () => {
    render(<LoginPage onLogin={vi.fn()} />);

    expect(screen.getByPlaceholderText("admin@example.com")).toHaveValue("");
    expect(screen.getByPlaceholderText("비밀번호를 입력하세요")).toHaveValue("");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("shows a validation error when submitting without a password", async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);

    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findByText("이메일과 비밀번호를 입력해 주세요.")).toBeInTheDocument();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    render(<LoginPage onLogin={vi.fn()} />);

    const pwInput = screen.getByPlaceholderText("비밀번호를 입력하세요");
    expect(pwInput).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "비밀번호 보기" }));
    expect(pwInput).toHaveAttribute("type", "text");
  });

  it("shows a notice when clicking 비밀번호 찾기", async () => {
    const user = userEvent.setup();
    render(<LoginPage onLogin={vi.fn()} />);

    await user.click(screen.getByText("비밀번호 찾기"));

    expect(
      await screen.findByText("비밀번호 재설정은 서버의 계정 복구 API와 연결해야 합니다."),
    ).toBeInTheDocument();
  });

  it("calls onLogin with the user on a successful admin login", async () => {
    const user = { id: "1", email: "admin@example.com", name: "Admin", role: "admin" as const };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ token: "abc123", user })),
    );
    const userEventInstance = userEvent.setup();
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);

    await userEventInstance.type(screen.getByPlaceholderText("admin@example.com"), "admin@example.com");
    await userEventInstance.type(screen.getByPlaceholderText("비밀번호를 입력하세요"), "password");
    await userEventInstance.click(screen.getByRole("button", { name: "로그인" }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(user));
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe("abc123");
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("allows a viewer-role login (lower roles can log in with restricted actions, not blocked entirely)", async () => {
    const user = { id: "2", email: "viewer@example.com", name: "Viewer", role: "viewer" as const };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ token: "abc123", user })),
    );
    const userEventInstance = userEvent.setup();
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);

    await userEventInstance.type(screen.getByPlaceholderText("admin@example.com"), "admin@example.com");
    await userEventInstance.type(screen.getByPlaceholderText("비밀번호를 입력하세요"), "password");
    await userEventInstance.click(screen.getByRole("button", { name: "로그인" }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(user));
  });

  it("shows the server error message when login fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ message: "잘못된 비밀번호입니다." }, false, 401)),
    );
    const userEventInstance = userEvent.setup();
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);

    await userEventInstance.type(screen.getByPlaceholderText("admin@example.com"), "admin@example.com");
    await userEventInstance.type(screen.getByPlaceholderText("비밀번호를 입력하세요"), "wrong");
    await userEventInstance.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findByText("잘못된 비밀번호입니다.")).toBeInTheDocument();
    expect(onLogin).not.toHaveBeenCalled();
  });
});
