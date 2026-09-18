import { v } from "convex/values"
import { action, internalMutation, internalQuery } from "./_generated/server"
import { internal, api } from "./_generated/api"
import { Id } from "./_generated/dataModel"

const TBA_BASE = "https://www.thebluealliance.com/api/v3"

interface TbaEventSimple {
  name: string
  start_date: string
  end_date: string
}

interface TbaTeamSimple {
  key: string
  team_number: number
  nickname: string
  city?: string | null
  state_prov?: string | null
  country?: string | null
}

interface TbaMatchSimple {
  key: string
  comp_level: string
  match_number: number
  set_number: number
  alliances: {
    red: { team_keys: string[] }
    blue: { team_keys: string[] }
  }
  time?: number | null
  actual_time?: number | null
}

// Verified live against /event/{key}/rankings for a real 2026 event -- rank
// and sort_orders are null until TBA has published a ranking (e.g. before
// quals start), which callers must treat as "not yet available", not zero.
interface TbaEventRanking {
  rank: number | null
  team_key: string
  matches_played: number
  record: { wins: number; losses: number; ties: number } | null
}

interface TbaRankingsResponse {
  rankings: TbaEventRanking[] | null
}

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

function teamNumberFromKey(teamKey: string) {
  return parseInt(teamKey.replace("frc", ""), 10)
}

// Imports event info, teams, and qual + playoff matches from TBA. Does not
// import rankings (see syncEventRankings), EPA/OPR, awards, team colors, or
// videos -- none of that is used anywhere in this app.
export const importEvent = action({
  args: { tbaEventKey: v.string() },
  handler: async (
    ctx,
    { tbaEventKey },
  ): Promise<{ eventId: Id<"events">; teamCount: number; matchCount: number }> => {
    const role = await ctx.runQuery(api.auth.currentRole, {})
    if (role !== "admin") {
      throw new Error("Admin access required")
    }

    const eventInfo = await tbaFetch<TbaEventSimple>(`/event/${tbaEventKey}/simple`)
    const tbaTeams = await tbaFetch<TbaTeamSimple[]>(`/event/${tbaEventKey}/teams/simple`)
    const tbaMatches = await tbaFetch<TbaMatchSimple[]>(`/event/${tbaEventKey}/matches/simple`)

    const eventId: Id<"events"> = await ctx.runMutation(internal.tbaImport.upsertEventData, {
      event: {
        tbaEventKey,
        name: eventInfo.name,
        startDate: eventInfo.start_date,
        endDate: eventInfo.end_date,
      },
      teams: tbaTeams.map((t) => ({
        tbaTeamKey: t.key,
        teamNumber: t.team_number,
        nickname: t.nickname,
        city: t.city ?? undefined,
        stateProv: t.state_prov ?? undefined,
        country: t.country ?? undefined,
      })),
      matches: tbaMatches.map((m) => ({
        tbaMatchKey: m.key,
        compLevel: m.comp_level,
        matchNumber: m.match_number,
        setNumber: m.set_number,
        redTeamNumbers: m.alliances.red.team_keys.map(teamNumberFromKey),
        blueTeamNumbers: m.alliances.blue.team_keys.map(teamNumberFromKey),
        scheduledTime: m.time ? m.time * 1000 : undefined,
        hasBeenPlayed: Boolean(m.actual_time),
      })),
    })

    return { eventId, teamCount: tbaTeams.length, matchCount: tbaMatches.length }
  },
})

export const upsertEventData = internalMutation({
  args: {
    event: v.object({
      tbaEventKey: v.string(),
      name: v.string(),
      startDate: v.string(),
      endDate: v.string(),
    }),
    teams: v.array(
      v.object({
        tbaTeamKey: v.string(),
        teamNumber: v.number(),
        nickname: v.string(),
        city: v.optional(v.string()),
        stateProv: v.optional(v.string()),
        country: v.optional(v.string()),
      }),
    ),
    matches: v.array(
      v.object({
        tbaMatchKey: v.string(),
        compLevel: v.string(),
        matchNumber: v.number(),
        setNumber: v.number(),
        redTeamNumbers: v.array(v.number()),
        blueTeamNumbers: v.array(v.number()),
        scheduledTime: v.optional(v.number()),
        hasBeenPlayed: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, { event, teams, matches }): Promise<Id<"events">> => {
    const existingEvent = await ctx.db
      .query("events")
      .withIndex("by_tbaEventKey", (q) => q.eq("tbaEventKey", event.tbaEventKey))
      .unique()
    const eventId = existingEvent
      ? existingEvent._id
      : await ctx.db.insert("events", { ...event, imported: false })

    if (existingEvent) {
      await ctx.db.patch(eventId, {
        name: event.name,
        startDate: event.startDate,
        endDate: event.endDate,
      })
    }

    // Scoped by (eventId, teamNumber), not globally by tbaTeamKey. A real
    // team's tbaTeamKey (e.g. "frc254") is the same across every event it
    // attends, so a global lookup would find and reuse that team's row
    // from a PREVIOUS event, silently carrying over its old pitReports/
    // matchReports/aiTeamAnalysis (all keyed by this team's persistent
    // _id, not by event) into the newly active event. Scoping to the
    // current event means a team new to this event always gets a fresh
    // row -- and therefore a clean scouting slate -- while re-importing
    // the SAME event (same eventId) still correctly finds and updates
    // its existing rows.
    for (const team of teams) {
      const existing = await ctx.db
        .query("teams")
        .withIndex("by_event_teamNumber", (q) => q.eq("eventId", eventId).eq("teamNumber", team.teamNumber))
        .unique()
      if (existing) {
        await ctx.db.patch(existing._id, { ...team, eventId })
      } else {
        await ctx.db.insert("teams", { ...team, eventId })
      }
    }

    for (const match of matches) {
      const existing = await ctx.db
        .query("matches")
        .withIndex("by_tbaMatchKey", (q) => q.eq("tbaMatchKey", match.tbaMatchKey))
        .unique()
      if (existing) {
        await ctx.db.patch(existing._id, { ...match, eventId })
      } else {
        await ctx.db.insert("matches", { ...match, eventId })
      }
    }

    await ctx.db.patch(eventId, { imported: true, importedAt: Date.now() })

    return eventId
  },
})

// Refreshes qualification rank/record for every team at the given event.
// Separate from importEvent since rankings change after every match and an
// admin may want to refresh them without re-importing teams/matches.
export const syncEventRankings = action({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }): Promise<{ updated: number }> => {
    const role = await ctx.runQuery(api.auth.currentRole, {})
    if (role !== "admin") {
      throw new Error("Admin access required")
    }

    const event = await ctx.runQuery(internal.tbaImport.getEventById, { eventId })
    if (!event) {
      throw new Error("Event not found")
    }

    const { rankings } = await tbaFetch<TbaRankingsResponse>(`/event/${event.tbaEventKey}/rankings`)

    const updates = (rankings ?? []).map((r) => ({
      teamNumber: teamNumberFromKey(r.team_key),
      qualRank: r.rank ?? undefined,
      qualWins: r.record?.wins,
      qualLosses: r.record?.losses,
      qualTies: r.record?.ties,
    }))

    return await ctx.runMutation(internal.tbaImport.applyRankingSync, {
      eventId,
      qualNumTeams: rankings?.length ?? undefined,
      updates,
    })
  },
})

export const getEventById = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => ctx.db.get(eventId),
})

export const applyRankingSync = internalMutation({
  args: {
    eventId: v.id("events"),
    qualNumTeams: v.optional(v.number()),
    updates: v.array(
      v.object({
        teamNumber: v.number(),
        qualRank: v.optional(v.number()),
        qualWins: v.optional(v.number()),
        qualLosses: v.optional(v.number()),
        qualTies: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, { eventId, qualNumTeams, updates }): Promise<{ updated: number }> => {
    let updated = 0
    for (const update of updates) {
      const team = await ctx.db
        .query("teams")
        .withIndex("by_event_teamNumber", (q) => q.eq("eventId", eventId).eq("teamNumber", update.teamNumber))
        .unique()
      if (!team) continue
      await ctx.db.patch(team._id, {
        qualRank: update.qualRank,
        qualWins: update.qualWins,
        qualLosses: update.qualLosses,
        qualTies: update.qualTies,
        qualNumTeams,
      })
      updated++
    }
    return { updated }
  },
})
