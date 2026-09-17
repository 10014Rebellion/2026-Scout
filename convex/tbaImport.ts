import { v } from "convex/values"
import { action, internalMutation } from "./_generated/server"
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

// Imports event info, teams, and qualification matches from TBA. Does not
// import rankings, EPA/OPR, awards, playoff matches, team colors, or
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

    const qualMatches = tbaMatches.filter((m) => m.comp_level === "qm")

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
      matches: qualMatches.map((m) => ({
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

    return { eventId, teamCount: tbaTeams.length, matchCount: qualMatches.length }
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

    for (const team of teams) {
      const existing = await ctx.db
        .query("teams")
        .withIndex("by_tbaTeamKey", (q) => q.eq("tbaTeamKey", team.tbaTeamKey))
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
