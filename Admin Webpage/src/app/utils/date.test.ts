import { describe, expect, it } from "vitest";
import { parseServerDate } from "./date";

describe("parseServerDate", () => {
  it("treats a timezone-less datetime string as UTC", () => {
    const date = parseServerDate("2026-07-24T13:47:37.022325");
    expect(date.toISOString()).toBe("2026-07-24T13:47:37.022Z");
  });

  it("leaves a string that already has a Z suffix untouched", () => {
    const date = parseServerDate("2026-07-24T13:47:37Z");
    expect(date.toISOString()).toBe("2026-07-24T13:47:37.000Z");
  });

  it("leaves a string that already has a numeric UTC offset untouched", () => {
    const date = parseServerDate("2026-07-24T22:47:37+09:00");
    expect(date.toISOString()).toBe("2026-07-24T13:47:37.000Z");
  });

  it("returns an invalid date for empty input", () => {
    expect(Number.isNaN(parseServerDate(undefined).getTime())).toBe(true);
    expect(Number.isNaN(parseServerDate("").getTime())).toBe(true);
  });
});
