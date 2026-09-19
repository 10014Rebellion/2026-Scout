// Minimal dependency-free CSV parser: comma-separated, optional
// double-quoted fields with "" as an escaped quote. Good enough for the
// small, hand-edited or Claude-generated files manual import expects --
// not a general-purpose CSV library.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++
      row.push(field)
      field = ""
      if (row.some((f) => f.trim().length > 0)) rows.push(row)
      row = []
    } else {
      field += char
    }
  }
  row.push(field)
  if (row.some((f) => f.trim().length > 0)) rows.push(row)

  return rows
}

// First row is the header; each subsequent row becomes an object keyed by
// (trimmed) header name, with missing trailing cells defaulting to "".
export function parseCsvWithHeader(text: string): Record<string, string>[] {
  const rows = parseCsv(text)
  if (rows.length === 0) return []
  const headers = rows[0].map((h) => h.trim())
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((h, i) => [h, (row[i] ?? "").trim()])))
}
