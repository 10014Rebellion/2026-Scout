// Shared formatting for TBA-derived team standing data (current-event
// ranking and previous-event snapshot), used by both the Team List cards
// and the Team Detail dialog so the two stay consistent.

const PLAYOFF_LEVEL_LABEL: Record<string, string> = {
  qf: "Quarterfinals",
  sf: "Semifinals",
  f: "Finals",
}

export function formatOrdinalPick(pick: number) {
  if (pick === 0) return "Captain"
  const suffix = pick === 1 ? "st" : pick === 2 ? "nd" : pick === 3 ? "rd" : "th"
  return `${pick}${suffix} pick`
}

export function formatRecord(record: { wins: number; losses: number; ties: number } | null | undefined) {
  if (!record) return null
  return `${record.wins}-${record.losses}${record.ties > 0 ? `-${record.ties}` : ""}`
}

export function formatPlayoffResult(level: string | undefined, status: string | undefined) {
  if (!status) return null
  const levelLabel = level ? (PLAYOFF_LEVEL_LABEL[level] ?? level.toUpperCase()) : null
  if (status === "won") return "Won the event"
  if (status === "eliminated") return levelLabel ? `Eliminated in ${levelLabel}` : "Eliminated"
  if (status === "playing") return levelLabel ? `Competing in ${levelLabel}` : "Competing in playoffs"
  return null
}
