import { describe, expect, it } from "vitest";
import { toCsv } from "./download";

describe("toCsv", () => {
  it("returns an empty string for no rows", () => {
    expect(toCsv([])).toBe("");
  });

  it("builds a header row from the first row's keys", () => {
    const csv = toCsv([{ name: "A", age: 1 }]);
    expect(csv.split("\n")[0]).toBe("name,age");
  });

  it("joins multiple rows with newlines in header order", () => {
    const csv = toCsv([
      { name: "A", age: 1 },
      { name: "B", age: 2 },
    ]);
    expect(csv).toBe("name,age\nA,1\nB,2");
  });

  it("renders null/undefined cells as empty strings", () => {
    const csv = toCsv([{ name: "A", note: null, extra: undefined }]);
    expect(csv).toBe("name,note,extra\nA,,");
  });

  it("quotes cells containing commas, quotes, or newlines", () => {
    const csv = toCsv([{ text: 'has,comma and "quote"\nand newline' }]);
    expect(csv).toBe('text\n"has,comma and ""quote""\nand newline"');
  });

  it("does not quote plain cells", () => {
    const csv = toCsv([{ text: "plain text" }]);
    expect(csv).toBe("text\nplain text");
  });

  it("wraps ISO date-like strings in ='...' to prevent Excel auto-formatting", () => {
    const csv = toCsv([{ date: "2026-07-06", datetime: "2026-07-06T10:00:00" }]);
    expect(csv).toBe('date,datetime\n="2026-07-06",="2026-07-06T10:00:00"');
  });

  it("does not wrap strings that merely resemble dates loosely", () => {
    const csv = toCsv([{ note: "2026/07/06" }]);
    expect(csv).toBe("note\n2026/07/06");
  });
});
