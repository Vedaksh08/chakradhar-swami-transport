/**
 * Reads a CSV back into rows and cells.
 *
 * Written to take back exactly what `downloadCsv` puts out — quoted cells,
 * doubled quotes inside them, commas and newlines within a field — and to
 * cope with what a spreadsheet adds on the way through: CRLF endings, a
 * leading byte-order mark, and a trailing blank line.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      // Swallow the \n of a \r\n pair rather than ending a second row.
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }

  // A file that ends in a newline leaves one empty row behind.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Download a 2-D array as a CSV file. */
export function downloadCsv(rows: (string | number)[][], filename: string) {
  const csv = rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\n");

  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
