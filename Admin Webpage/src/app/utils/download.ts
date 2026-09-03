export function downloadTextFile(filename: string, content: string, mimeType = "text/plain;charset=utf-8") {
  // Prepend UTF-8 BOM for CSV so Excel/Windows correctly reads Korean characters
  const prefix = mimeType.includes("csv") ? "﻿" : "";
  const blob = new Blob([prefix, content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function toCsv(rows: Array<Record<string, string | number | boolean | null | undefined>>) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const DATE_RE = /^\d{4}-\d{2}-\d{2}(T.*)?$/;
  const escapeCell = (value: string | number | boolean | null | undefined) => {
    const text = String(value ?? "");
    // Wrap date strings with ="..." so Excel treats them as text and avoids ###### display
    if (DATE_RE.test(text)) return `="${text}"`;
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(",")),
  ].join("\n");
}
