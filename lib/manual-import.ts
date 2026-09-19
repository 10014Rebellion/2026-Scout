import { parseCsvWithHeader } from "./csv"

export interface ManualTeamRow {
  teamNumber: number
  nickname: string
  city?: string
  stateProv?: string
  country?: string
}

export interface ManualMatchRow {
  matchNumber: number
  redTeamNumbers: number[]
  blueTeamNumbers: number[]
  scheduledTime?: number
}

function requireInt(value: string | undefined, label: string, rowNumber: number): number {
  const parsed = parseInt((value ?? "").trim(), 10)
  if (Number.isNaN(parsed)) {
    throw new Error(`Row ${rowNumber}: missing or invalid ${label}`)
  }
  return parsed
}

// Expected header: teamNumber,nickname,city,stateProv,country (city/
// stateProv/country optional, may be blank or omitted entirely).
export function parseTeamsCsv(text: string): ManualTeamRow[] {
  const rows = parseCsvWithHeader(text)
  return rows.map((row, i) => {
    const rowNumber = i + 2 // +1 for header row, +1 for 1-indexing
    const teamNumber = requireInt(row.teamNumber, "teamNumber", rowNumber)
    const nickname = (row.nickname ?? "").trim()
    if (nickname.length === 0) {
      throw new Error(`Row ${rowNumber}: missing nickname`)
    }
    return {
      teamNumber,
      nickname,
      city: row.city?.trim() || undefined,
      stateProv: row.stateProv?.trim() || undefined,
      country: row.country?.trim() || undefined,
    }
  })
}

// Expected header: matchNumber,red1,red2,red3,blue1,blue2,blue3,scheduledTime
// (scheduledTime optional, any format Date.parse understands, e.g.
// "2026-04-10 09:00"; left unset if blank or unparseable).
export function parseMatchesCsv(text: string): ManualMatchRow[] {
  const rows = parseCsvWithHeader(text)
  return rows.map((row, i) => {
    const rowNumber = i + 2
    const matchNumber = requireInt(row.matchNumber, "matchNumber", rowNumber)
    const redTeamNumbers = ["red1", "red2", "red3"].map((key) => requireInt(row[key], key, rowNumber))
    const blueTeamNumbers = ["blue1", "blue2", "blue3"].map((key) => requireInt(row[key], key, rowNumber))

    let scheduledTime: number | undefined
    const rawTime = row.scheduledTime?.trim()
    if (rawTime) {
      const parsed = Date.parse(rawTime)
      if (!Number.isNaN(parsed)) scheduledTime = parsed
    }

    return { matchNumber, redTeamNumbers, blueTeamNumbers, scheduledTime }
  })
}
