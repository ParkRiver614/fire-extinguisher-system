import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePersistentState } from "./usePersistentState";

afterEach(() => {
  localStorage.clear();
});

describe("usePersistentState", () => {
  it("initializes from the provided default when nothing is stored", () => {
    const { result } = renderHook(() => usePersistentState("test-key", "default"));
    expect(result.current[0]).toBe("default");
  });

  it("initializes from an existing localStorage value", () => {
    localStorage.setItem("test-key", JSON.stringify("stored-value"));
    const { result } = renderHook(() => usePersistentState("test-key", "default"));
    expect(result.current[0]).toBe("stored-value");
  });

  it("persists updates to localStorage", () => {
    const { result } = renderHook(() => usePersistentState("test-key", "default"));

    act(() => {
      result.current[1]("updated");
    });

    expect(result.current[0]).toBe("updated");
    expect(JSON.parse(localStorage.getItem("test-key")!)).toBe("updated");
  });

  it("supports functional updates based on the previous value", () => {
    const { result } = renderHook(() => usePersistentState("counter", 0));

    act(() => {
      result.current[1]((previous) => previous + 1);
    });

    expect(result.current[0]).toBe(1);
  });

  it("falls back to the default value when stored JSON is malformed", () => {
    localStorage.setItem("bad-key", "{not valid json");
    const { result } = renderHook(() => usePersistentState("bad-key", "fallback"));
    expect(result.current[0]).toBe("fallback");
  });

  it("syncs state across hook instances sharing the same key", () => {
    const { result: first } = renderHook(() => usePersistentState("shared-key", "a"));
    const { result: second } = renderHook(() => usePersistentState("shared-key", "a"));

    act(() => {
      first.current[1]("b");
    });

    expect(second.current[0]).toBe("b");
  });

  it("does not affect state under a different key", () => {
    const { result: keyA } = renderHook(() => usePersistentState("key-a", "a"));
    const { result: keyB } = renderHook(() => usePersistentState("key-b", "b"));

    act(() => {
      keyA.current[1]("changed");
    });

    expect(keyB.current[0]).toBe("b");
  });
});
