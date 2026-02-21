export function buildDateStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}`;
}

export function sanitizeFileToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildTableLines(columns, rows) {
  const header = columns.join(" | ");
  const separator = columns.map(() => "----").join(" | ");
  const content = rows.map((row) => row.map((cell) => String(cell ?? "-")).join(" | "));
  return [header, separator, ...content];
}

export function buildCsv(headers, rows) {
  const csvRows = [];
  csvRows.push(headers.map(escapeCsvCell).join(","));
  for (const row of rows) {
    csvRows.push(row.map(escapeCsvCell).join(","));
  }
  return csvRows.join("\n");
}

export function buildCsvDocument(metaRows, headers, rows) {
  const lines = [];
  for (const row of metaRows || []) {
    if (!Array.isArray(row) || !row.length) {
      lines.push("");
      continue;
    }
    lines.push(row.map(escapeCsvCell).join(","));
  }
  lines.push((headers || []).map(escapeCsvCell).join(","));
  for (const row of rows || []) {
    lines.push((row || []).map(escapeCsvCell).join(","));
  }
  return lines.join("\n");
}

export function downloadCsvFile({ filename, content }) {
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadPdfReport({ filename, title, lines }) {
  const generatedAt = formatDate(new Date().toISOString(), true);
  const printableLines = [
    `Generated: ${generatedAt}`,
    "",
    ...lines.map((line) => String(line ?? "")),
  ];
  const blob = createPdfBlob(title, printableLines);

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function formatDate(value, includeTime = false) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: includeTime ? "2-digit" : undefined,
    minute: includeTime ? "2-digit" : undefined,
  }).format(date);
}

function escapeCsvCell(value) {
  const normalized = String(value ?? "");
  if (
    normalized.includes(",") ||
    normalized.includes('"') ||
    normalized.includes("\n") ||
    normalized.includes("\r")
  ) {
    return `"${normalized.replaceAll('"', '""')}"`;
  }
  return normalized;
}

function createPdfBlob(title, lines) {
  const wrappedLines = wrapPdfLines(lines, 105);
  const linesPerPage = 44;
  const pages = chunkArray(wrappedLines, linesPerPage);
  if (!pages.length) {
    pages.push(["No data available."]);
  }

  const encoder = new TextEncoder();
  const objects = [];

  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };

  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];

  for (let index = 0; index < pages.length; index += 1) {
    const contentStream = buildPdfPageContent(title, pages[index], index + 1, pages.length);
    const streamLength = encoder.encode(contentStream).length;
    const contentId = addObject(
      `<< /Length ${streamLength} >>\nstream\n${contentStream}\nendstream`
    );
    const pageId = addObject(
      `<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);
  }

  const pagesId = addObject(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`
  );

  for (const pageId of pageIds) {
    objects[pageId - 1] = objects[pageId - 1].replace("PAGES_REF", `${pagesId} 0 R`);
  }

  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let i = 0; i < objects.length; i += 1) {
    offsets[i + 1] = encoder.encode(pdf).length;
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

function buildPdfPageContent(title, lines, pageNumber, totalPages) {
  const operations = [];

  operations.push(`BT /F1 16 Tf 1 0 0 1 40 758 Tm (${escapePdfText(toPdfAscii(title))}) Tj ET`);
  operations.push(
    `BT /F1 9 Tf 1 0 0 1 40 742 Tm (${escapePdfText(
      toPdfAscii(`Page ${pageNumber} of ${totalPages}`)
    )}) Tj ET`
  );
  operations.push("0.6 w 40 736 m 572 736 l S");

  let y = 718;
  for (const line of lines) {
    operations.push(`BT /F1 10 Tf 1 0 0 1 40 ${y} Tm (${escapePdfText(toPdfAscii(line))}) Tj ET`);
    y -= 15;
  }

  return operations.join("\n");
}

function wrapPdfLines(lines, maxChars) {
  const wrapped = [];
  for (const rawLine of lines) {
    const normalized = toPdfAscii(rawLine || "").trimEnd();
    if (!normalized.length) {
      wrapped.push("");
      continue;
    }

    let remaining = normalized;
    while (remaining.length > maxChars) {
      let splitIndex = remaining.lastIndexOf(" ", maxChars);
      if (splitIndex <= 0) {
        splitIndex = maxChars;
      }
      wrapped.push(remaining.slice(0, splitIndex).trimEnd());
      remaining = remaining.slice(splitIndex).trimStart();
    }
    wrapped.push(remaining);
  }
  return wrapped;
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function escapePdfText(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function toPdfAscii(value) {
  return String(value || "").replace(/[^\x20-\x7E]/g, "?");
}
