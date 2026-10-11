import { v } from "convex/values"
import { action, internalMutation } from "./_generated/server"
import { internal, api } from "./_generated/api"
import { Id } from "./_generated/dataModel"
import { computeHubActiveFirst, computeRp, type TbaAllianceBreakdown } from "./tbaScoreSync"

// Official FIRST FRC Events API -- an explicit alternative to TBA (admin
// picks per event, see Event Setup), not a silent fallback. Verified live
// (2026-10-11) against a real completed event before writing any of this:
// auth is HTTP Basic (username:token, base64), and critically, the
// /scores/{event}/{level} endpoint returns the same field names TBA's
// score_breakdown does (hubScore, autoTowerRobot1-3, endGameTowerRobot1-3,
// energizedAchieved, etc.) -- FIRST is TBA's original data source, so this
// isn't a coincidence. That's why this file reuses tbaScoreSync's
// tiebreak/RP math and both modules' upsert mutations instead of
// reimplementing them.
const FRC_API_BASE = "https://frc-api.firstinspires.org/v3.0"

// This API is slow in practice (single-digit minutes per call during
// testing, vs TBA's sub-second responses) -- these are plain admin-
// triggered actions, not something to wire into a fast UI interaction.
async function frcFetch<T>(path: string): Promise<T> {
  const username = process.env.FRC_API_USERNAME
  const token = process.env.FRC_API_TOKEN
  if (!username || !token) {
    throw new Error("FRC_API_USERNAME/FRC_API_TOKEN are not configured")
  }
  const basic = btoa(`${username}:${token}`)
  const res = await fetch(`${FRC_API_BASE}${path}`, {
    headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
  })
  if (!res.ok) {
    throw new Error(`FIRST API request failed (${res.status}): ${path}`)
  }
  return res.json() as Promise<T>
}

interface FrcEvent {
  code: string
  name: string
  dateStart: string
  dateEnd: string
}
interface FrcEventsResponse {
  Events: FrcEvent[]
}

interface FrcTeam {
  teamNumber: number
  nameShort: string
  city?: string | null
  stateProv?: string | null
  country?: string | null
}
interface FrcTeamsResponse {
  teams: FrcTeam[]
}

interface FrcScheduleTeam {
  station: string
  teamNumber: number
}
interface FrcScheduleMatch {
  matchNumber: number
  startTime?: string | null
  teams: FrcScheduleTeam[]
}
interface FrcScheduleResponse {
  Schedule: FrcScheduleMatch[]
}

interface FrcMatchResult {
  matchNumber: number
  actualStartTime?: string | null
}
interface FrcMatchesResponse {
  Matches: FrcMatchResult[]
}

interface FrcAllianceScore extends TbaAllianceBreakdown {
  alliance: "Red" | "Blue"
}
interface FrcMatchScore {
  matchNumber: number
  alliances: FrcAllianceScore[]
}
interface FrcScoresResponse {
  MatchScores: FrcMatchScore[]
}

function stationTeamNumber(teams: FrcScheduleTeam[], station: string) {
  return teams.find((t) => t.station === station)?.teamNumber
}

export const markSource = internalMutation({
  args: { eventId: v.id("events"), source: v.union(v.literal("tba"), v.literal("frcapi")) },
  handler: async (ctx, { eventId, source }) => {
    await ctx.db.patch(eventId, { source })
  },
})

// Imports event info, teams, and the qualification schedule from the FIRST
// API -- the FRC-API equivalent of tbaImport.importEvent. Playoff matches
// aren't included: FIRST's schedule endpoint only publishes the qual
// schedule in advance the same way a paper schedule would, matching this
// app's existing "manual mode" scope decision rather than TBA's (which
// includes playoffs once they're bracketed).
export const importEvent = action({
  args: { season: v.number(), eventCode: v.string() },
  handler: async (ctx, { season, eventCode }): Promise<{ eventId: Id<"events">; teamCount: number; matchCount: number }> => {
    const role = await ctx.runQuery(api.auth.currentRole, {})
    if (role !== "admin") {
      throw new Error("Admin access required")
    }

    const code = eventCode.trim().toUpperCase()

    const [eventsResp, teamsResp, scheduleResp] = await Promise.all([
      frcFetch<FrcEventsResponse>(`/${season}/events?eventCode=${code}`),
      frcFetch<FrcTeamsResponse>(`/${season}/teams?eventCode=${code}`),
      frcFetch<FrcScheduleResponse>(`/${season}/schedule/${code}/qual`),
    ])

    const eventInfo = eventsResp.Events[0]
    if (!eventInfo) {
      throw new Error(`FIRST API has no event with code "${code}" for ${season}`)
    }

    const eventId: Id<"events"> = await ctx.runMutation(internal.tbaImport.upsertEventData, {
      event: {
        tbaEventKey: `frcapi-${season}-${code}`,
        name: eventInfo.name,
        startDate: eventInfo.dateStart.slice(0, 10),
        endDate: eventInfo.dateEnd.slice(0, 10),
      },
      teams: teamsResp.teams.map((t) => ({
        tbaTeamKey: `frc${t.teamNumber}`,
        teamNumber: t.teamNumber,
        nickname: t.nameShort,
        city: t.city ?? undefined,
        stateProv: t.stateProv ?? undefined,
        country: t.country ?? undefined,
      })),
      matches: scheduleResp.Schedule.map((m) => ({
        tbaMatchKey: `frcapi-${code}-qm${m.matchNumber}`,
        compLevel: "qm",
        matchNumber: m.matchNumber,
        setNumber: 1,
        redTeamNumbers: (["Red1", "Red2", "Red3"] as const)
          .map((s) => stationTeamNumber(m.teams, s))
          .filter((n): n is number => n !== undefined),
        blueTeamNumbers: (["Blue1", "Blue2", "Blue3"] as const)
          .map((s) => stationTeamNumber(m.teams, s))
          .filter((n): n is number => n !== undefined),
        scheduledTime: m.startTime ? Date.parse(m.startTime) : undefined,
        hasBeenPlayed: false,
      })),
    })

    await ctx.runMutation(internal.frcApi.markSource, { eventId, source: "frcapi" })

    return { eventId, teamCount: teamsResp.teams.length, matchCount: scheduleResp.Schedule.length }
  },
})

// FRC-API equivalent of tbaScoreSync.syncEventScores. FIRST splits what TBA
// gives in one call across two endpoints: /matches has actualStartTime
// (played/not played), /scores has the detailed FUEL/climb breakdown --
// merged here by matchNumber.
export const syncEventScores = action({
  args: { season: v.number(), eventCode: v.string() },
  handler: async (ctx, { season, eventCode }): Promise<{ matchesSynced: number; matchesSkipped: number }> => {
    const role = await ctx.runQuery(api.auth.currentRole, {})
    if (role !== "admin") {
      throw new Error("Admin access required")
    }

    const code = eventCode.trim().toUpperCase()

    const [matchesResp, scoresResp] = await Promise.all([
      frcFetch<FrcMatchesResponse>(`/${season}/matches/${code}/qual`),
      frcFetch<FrcScoresResponse>(`/${season}/scores/${code}/qual`),
    ])

    const playedMatchNumbers = new Set(
      matchesResp.Matches.filter((m) => Boolean(m.actualStartTime)).map((m) => m.matchNumber),
    )

    const updates = scoresResp.MatchScores.filter((m) => playedMatchNumbers.has(m.matchNumber)).map((m) => {
      const red = m.alliances.find((a) => a.alliance === "Red")
      const blue = m.alliances.find((a) => a.alliance === "Blue")
      if (!red || !blue) {
        throw new Error(`FIRST API match ${m.matchNumber} is missing a red or blue alliance score`)
      }
      return {
        tbaMatchKey: `frcapi-${code}-qm${m.matchNumber}`,
        tbaScoreBreakdown: { red, blue },
        redAutoFuel: red.hubScore.autoCount,
        blueAutoFuel: blue.hubScore.autoCount,
        redTeleopFuel: red.hubScore.teleopCount,
        blueTeleopFuel: blue.hubScore.teleopCount,
        redTowerPoints: red.totalTowerPoints,
        blueTowerPoints: blue.totalTowerPoints,
        redRp: computeRp(red.totalPoints, blue.totalPoints, red),
        blueRp: computeRp(blue.totalPoints, red.totalPoints, blue),
        hubActiveFirst: computeHubActiveFirst(red, blue),
      }
    })

    if (updates.length === 0) {
      return { matchesSynced: 0, matchesSkipped: 0 }
    }

    const result = await ctx.runMutation(internal.tbaScoreSync.applyScoreSync, { updates })
    return { matchesSynced: result.matched, matchesSkipped: result.skipped }
  },
})

interface FrcRanking {
  teamNumber: number
  rank: number
  wins: number
  losses: number
  ties: number
}
interface FrcRankingsResponse {
  Rankings: FrcRanking[]
}

// FRC-API equivalent of tbaImport.syncEventRankings, minus the Peekorobo
// ACE half -- Peekorobo mirrors TBA's event-key space, which a
// "frcapi-<season>-<CODE>" synthesized key was never going to match, so
// that's out of scope here rather than silently wired to return nothing.
export const syncEventRankings = action({
  args: { eventId: v.id("events"), season: v.number(), eventCode: v.string() },
  handler: async (ctx, { eventId, season, eventCode }): Promise<{ updated: number }> => {
    const role = await ctx.runQuery(api.auth.currentRole, {})
    if (role !== "admin") {
      throw new Error("Admin access required")
    }

    const code = eventCode.trim().toUpperCase()
    const { Rankings } = await frcFetch<FrcRankingsResponse>(`/${season}/rankings/${code}`)

    const updates = Rankings.map((r) => ({
      teamNumber: r.teamNumber,
      rank: { qualRank: r.rank, qualWins: r.wins, qualLosses: r.losses, qualTies: r.ties },
      ace: undefined,
    }))

    return await ctx.runMutation(internal.tbaImport.applyRankingSync, {
      eventId,
      qualNumTeams: Rankings.length,
      updates,
    })
  },
})
