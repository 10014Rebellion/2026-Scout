import { v } from "convex/values"
import { action, internalMutation, internalQuery } from "./_generated/server"
import { internal, api } from "./_generated/api"

const TBA_BASE = "https://www.thebluealliance.com/api/v3"

// Not reused from convex/tbaImport.ts because that helper isn't exported --
// this is a deliberately small equivalent, not a duplicated dependency.
async function tbaFetch<T>(path: string): Promise<T> {
  const apiKey = process.env.TBA_API_KEY
  if (!apiKey) {
    throw new Error("TBA_API_KEY is not configured")
  }
  const res = await fetch(`${TBA_BASE}${path}`, {
    headers: { "X-TBA-Auth-Key": apiKey },
  })
  if (!res.ok) {
    throw new Error(`TBA request failed (${res.status}): ${path}`)
  }
  return res.json() as Promise<T>
}

// Verified against TBA's 2026 REBUILT game-logic source (see task brief) --
// FUEL is only ever reported per-alliance. hubScore's *Count fields are raw
// ball counts; *Points are TBA's own point conversion of those counts. Climb
// (autoTowerRobot*/endGameTowerRobot*) is the one part of this payload that
// IS per-robot and exact, which is why it's copied verbatim elsewhere and
// never estimated.
interface TbaHubScore {
  autoCount: number
  autoPoints: number
  transitionCount: number
  transitionPoints: number
  shift1Count: number
  shift1Points: number
  shift2Count: number
  shift2Points: number
  shift3Count: number
  shift3Points: number
  shift4Count: number
  shift4Points: number
  endgameCount: number
  endgamePoints: number
  teleopCount: number
  teleopPoints: number
  totalCount: number
  totalPoints: number
  uncounted: number
}

interface TbaAllianceBreakdown {
  totalAutoPoints: number
  totalTeleopPoints: number
  totalTowerPoints: number
  totalPoints: number
  endGameTowerPoints: number
  hubScore: TbaHubScore
  autoTowerRobot1: string
  autoTowerRobot2: string
  autoTowerRobot3: string
  endGameTowerRobot1: string
  endGameTowerRobot2: string
  endGameTowerRobot3: string
  energizedAchieved: boolean
  superchargedAchieved: boolean
  traversalAchieved: boolean
  majorFoulCount: number
  minorFoulCount: number
}

interface TbaMatchFull {
  key: string
  comp_level: string
  match_number: number
  set_number: number
  actual_time?: number | null
  alliances: {
    red: { team_keys: string[]; score: number }
    blue: { team_keys: string[]; score: number }
  }
  score_breakdown: { red: TbaAllianceBreakdown; blue: TbaAllianceBreakdown } | null
}

// Replicates TBA's own (undocumented as a field) auto-alliance-first
// derivation: compare totalAutoPoints, then walk the four Alliance Shift
// counts in order until one side is nonzero at a non-tied shift. This is a
// best-effort replication of TBA's internal comparison, not a published
// field -- treat it as lower-confidence than everything else this module
// writes.
function computeHubActiveFirst(
  red: TbaAllianceBreakdown,
  blue: TbaAllianceBreakdown,
): "red" | "blue" | "tied" {
  if (red.totalAutoPoints !== blue.totalAutoPoints) {
    return red.totalAutoPoints > blue.totalAutoPoints ? "red" : "blue"
  }
  const shiftKeys = ["shift1Count", "shift2Count", "shift3Count", "shift4Count"] as const
  for (const key of shiftKeys) {
    const r = red.hubScore[key]
    const b = blue.hubScore[key]
    if (r !== b) {
      return r > b ? "red" : "blue"
    }
  }
  return "tied"
}

// RP = 3/1/0 for win/tie/loss plus +1 per achieved boolean TBA already
// computed for us -- no need to re-derive the raw FUEL/TOWER thresholds.
function computeRp(allianceScore: number, otherScore: number, breakdown: TbaAllianceBreakdown) {
  const outcome = allianceScore > otherScore ? 3 : allianceScore === otherScore ? 1 : 0
  const bonuses = [breakdown.energizedAchieved, breakdown.superchargedAchieved, breakdown.traversalAchieved].filter(
    Boolean,
  ).length
  return outcome + bonuses
}

export const getEventById = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => ctx.db.get(eventId),
})

const scoreUpdateValidator = v.object({
  tbaMatchKey: v.string(),
  tbaScoreBreakdown: v.any(),
  redAutoFuel: v.number(),
  blueAutoFuel: v.number(),
  redTeleopFuel: v.number(),
  blueTeleopFuel: v.number(),
  redTowerPoints: v.number(),
  blueTowerPoints: v.number(),
  redRp: v.number(),
  blueRp: v.number(),
  hubActiveFirst: v.union(v.literal("red"), v.literal("blue"), v.literal("tied")),
})

export const applyScoreSync = internalMutation({
  args: { updates: v.array(scoreUpdateValidator) },
  handler: async (ctx, { updates }): Promise<{ matched: number; skipped: number }> => {
    let matched = 0
    let skipped = 0
    for (const update of updates) {
      const existing = await ctx.db
        .query("matches")
        .withIndex("by_tbaMatchKey", (q) => q.eq("tbaMatchKey", update.tbaMatchKey))
        .unique()
      if (!existing) {
        skipped += 1
        continue
      }
      await ctx.db.patch(existing._id, {
        tbaScoreBreakdown: update.tbaScoreBreakdown,
        redAutoFuel: update.redAutoFuel,
        blueAutoFuel: update.blueAutoFuel,
        redTeleopFuel: update.redTeleopFuel,
        blueTeleopFuel: update.blueTeleopFuel,
        redTowerPoints: update.redTowerPoints,
        blueTowerPoints: update.blueTowerPoints,
        redRp: update.redRp,
        blueRp: update.blueRp,
        hubActiveFirst: update.hubActiveFirst,
      })
      matched += 1
    }
    return { matched, skipped }
  },
})

// Full-detail match fetch (not /simple) is required because score_breakdown
// -- the only source of FUEL data -- is omitted from the simple model. One
// call per event covers every match (qual + playoff), which is why this
// re-syncs every played match every run instead of tracking per-match sync
// state: at this app's event scale that's simpler and just as cheap as a
// partial-sync design.
export const syncEventScores = action({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }): Promise<{ matchesSynced: number; matchesSkipped: number }> => {
    const role = await ctx.runQuery(api.auth.currentRole, {})
    if (role !== "admin") {
      throw new Error("Admin access required")
    }

    const event = await ctx.runQuery(internal.tbaScoreSync.getEventById, { eventId })
    if (!event) {
      throw new Error("Event not found")
    }

    const tbaMatches = await tbaFetch<TbaMatchFull[]>(`/event/${event.tbaEventKey}/matches`)

    const playedQuals = tbaMatches.filter(
      (m) => Boolean(m.actual_time) && m.score_breakdown !== null,
    )

    const updates = playedQuals.map((match) => {
      const breakdown = match.score_breakdown!
      const { red, blue } = breakdown
      return {
        tbaMatchKey: match.key,
        tbaScoreBreakdown: breakdown,
        redAutoFuel: red.hubScore.autoCount,
        blueAutoFuel: blue.hubScore.autoCount,
        redTeleopFuel: red.hubScore.teleopCount,
        blueTeleopFuel: blue.hubScore.teleopCount,
        redTowerPoints: red.totalTowerPoints,
        blueTowerPoints: blue.totalTowerPoints,
        redRp: computeRp(match.alliances.red.score, match.alliances.blue.score, red),
        blueRp: computeRp(match.alliances.blue.score, match.alliances.red.score, blue),
        hubActiveFirst: computeHubActiveFirst(red, blue),
      }
    })

    if (updates.length === 0) {
      return { matchesSynced: 0, matchesSkipped: 0 }
    }

    const result: { matched: number; skipped: number } = await ctx.runMutation(
      internal.tbaScoreSync.applyScoreSync,
      { updates },
    )

    return { matchesSynced: result.matched, matchesSkipped: result.skipped }
  },
})

export type { TbaAllianceBreakdown, TbaHubScore }
