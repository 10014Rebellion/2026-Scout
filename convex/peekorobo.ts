// Peekorobo (peekorobo.com) team performance data. Its headline stat is
// called "ACE" (and "RAW") -- Peekorobo's own rating, distinct from
// Statbotics' EPA. Always label it "ACE (Peekorobo)" in the UI, never EPA.
// Free API key from https://www.peekorobo.com/user; public endpoints work
// without one but are rate-limited hard enough to be impractical for
// syncing a whole event.
const PEEKOROBO_BASE = "https://peekorobo-db-bec52087b7e6.herokuapp.com"

// Verified live (2026-09-18) against /event/{key}/event_perfs/{team} and
// /event/{key}/event_perfs for real teams/events.
export interface PeekoroboEventPerf {
  team_number: number
  ace: number | null
  auto_raw: number | null
  teleop_raw: number | null
  endgame_raw: number | null
}

// A 404 (Peekorobo has no data for this team/event) is treated as
// "unavailable," not an error -- never fails the caller's larger sync.
export async function fetchPeekoroboEventPerf(
  teamNumber: number,
  eventKey: string,
): Promise<PeekoroboEventPerf | null> {
  const apiKey = process.env.PEEKOROBO_API_KEY
  if (!apiKey) {
    return null
  }
  const res = await fetch(`${PEEKOROBO_BASE}/event/${eventKey}/event_perfs/${teamNumber}`, {
    headers: { "X-API-Key": apiKey },
  })
  if (!res.ok) {
    return null
  }
  return res.json() as Promise<PeekoroboEventPerf>
}

// One call for every team at an event, rather than one call per team --
// used when syncing the CURRENT event (all teams at once), as opposed to
// each team's individually-determined most recent PRIOR event.
export async function fetchPeekoroboEventPerfsBatch(eventKey: string): Promise<Map<number, PeekoroboEventPerf>> {
  const result = new Map<number, PeekoroboEventPerf>()
  const apiKey = process.env.PEEKOROBO_API_KEY
  if (!apiKey) {
    return result
  }
  const res = await fetch(`${PEEKOROBO_BASE}/event/${eventKey}/event_perfs`, {
    headers: { "X-API-Key": apiKey },
  })
  if (!res.ok) {
    return result
  }
  const body = (await res.json()) as { perfs?: PeekoroboEventPerf[] }
  for (const perf of body.perfs ?? []) {
    result.set(perf.team_number, perf)
  }
  return result
}
