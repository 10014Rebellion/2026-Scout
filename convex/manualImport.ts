import { v } from "convex/values"
import { action, internalMutation, mutation } from "./_generated/server"
import { internal, api } from "./_generated/api"
import { Id } from "./_generated/dataModel"
import { requireAdmin } from "./auth"

// Bridge mode for when TBA is unreachable: lets an admin hand-enter a team
// list and qualification schedule (typically transcribed from a paper
// schedule) so scouting can start on time, then later reconcile the same
// event against real TBA data once it's back up (see reconcileWithTba).

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

export const createManualEvent = mutation({
  args: { name: v.string(), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { name, startDate, endDate }): Promise<Id<"events">> => {
    await requireAdmin(ctx)
    if (name.trim().length === 0) {
      throw new Error("Name is required")
    }
    // Placeholder key, never a real TBA event key (those never start with
    // "manual-"), so it can't collide with anything real and so
    // reconcileWithTba can tell a not-yet-reconciled event apart from one
    // that already has a genuine key.
    const tbaEventKey = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    return await ctx.db.insert("events", {
      tbaEventKey,
      name: name.trim(),
      startDate,
      endDate,
      imported: true,
      importedAt: Date.now(),
      isManual: true,
    })
  },
})

// Upserts by (eventId, teamNumber) -- same identity rule tbaImport uses --
// so re-importing a corrected CSV (or reconciling with TBA later) updates
// existing rows in place instead of duplicating them.
export const importManualTeams = mutation({
  args: {
    eventId: v.id("events"),
    teams: v.array(
      v.object({
        teamNumber: v.number(),
        nickname: v.string(),
        city: v.optional(v.string()),
        stateProv: v.optional(v.string()),
        country: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { eventId, teams }): Promise<{ inserted: number; updated: number }> => {
    await requireAdmin(ctx)
    let inserted = 0
    let updated = 0
    for (const team of teams) {
      const existing = await ctx.db
        .query("teams")
        .withIndex("by_event_teamNumber", (q) => q.eq("eventId", eventId).eq("teamNumber", team.teamNumber))
        .unique()
      if (existing) {
        await ctx.db.patch(existing._id, {
          nickname: team.nickname,
          city: team.city,
          stateProv: team.stateProv,
          country: team.country,
        })
        updated++
      } else {
        await ctx.db.insert("teams", {
          eventId,
          tbaTeamKey: `manual-frc${team.teamNumber}`,
          teamNumber: team.teamNumber,
          nickname: team.nickname,
          city: team.city,
          stateProv: team.stateProv,
          country: team.country,
        })
        inserted++
      }
    }
    return { inserted, updated }
  },
})

// Qualification matches only -- manual mode covers the printed schedule,
// not results (see schema.ts note on scoutPositionAssignments for the same
// "qm only" scoping rationale elsewhere in this app). setNumber is always 1
// and hasBeenPlayed always false: a hand-entered schedule is inherently
// pre-match.
export const importManualMatches = mutation({
  args: {
    eventId: v.id("events"),
    matches: v.array(
      v.object({
        matchNumber: v.number(),
        redTeamNumbers: v.array(v.number()),
        blueTeamNumbers: v.array(v.number()),
        scheduledTime: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, { eventId, matches }): Promise<{ inserted: number; updated: number }> => {
    await requireAdmin(ctx)
    let inserted = 0
    let updated = 0
    for (const match of matches) {
      const existing = await ctx.db
        .query("matches")
        .withIndex("by_event_compLevel_matchNumber", (q) =>
          q.eq("eventId", eventId).eq("compLevel", "qm").eq("matchNumber", match.matchNumber),
        )
        .unique()
      if (existing) {
        await ctx.db.patch(existing._id, {
          redTeamNumbers: match.redTeamNumbers,
          blueTeamNumbers: match.blueTeamNumbers,
          scheduledTime: match.scheduledTime,
        })
        updated++
      } else {
        await ctx.db.insert("matches", {
          eventId,
          tbaMatchKey: `manual-${eventId}-qm${match.matchNumber}`,
          compLevel: "qm",
          matchNumber: match.matchNumber,
          setNumber: 1,
          redTeamNumbers: match.redTeamNumbers,
          blueTeamNumbers: match.blueTeamNumbers,
          scheduledTime: match.scheduledTime,
          hasBeenPlayed: false,
        })
        inserted++
      }
    }
    return { inserted, updated }
  },
})

// Upgrades a manual event in place once TBA is back: fetches the real event
// by its real key and merges it into the SAME event/team/match rows (never
// creates a second copy of the event), so every pit report, match report,
// pick list entry, and AI analysis tied to those rows survives untouched.
export const reconcileWithTba = action({
  args: { eventId: v.id("events"), tbaEventKey: v.string() },
  handler: async (ctx, { eventId, tbaEventKey }): Promise<{ teamCount: number; matchCount: number }> => {
    const role = await ctx.runQuery(api.auth.currentRole, {})
    if (role !== "admin") {
      throw new Error("Admin access required")
    }

    const eventInfo = await tbaFetch<TbaEventSimple>(`/event/${tbaEventKey}/simple`)
    const tbaTeams = await tbaFetch<TbaTeamSimple[]>(`/event/${tbaEventKey}/teams/simple`)
    const tbaMatches = await tbaFetch<TbaMatchSimple[]>(`/event/${tbaEventKey}/matches/simple`)

    await ctx.runMutation(internal.manualImport.applyReconciliation, {
      eventId,
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

    return { teamCount: tbaTeams.length, matchCount: tbaMatches.length }
  },
})

export const applyReconciliation = internalMutation({
  args: {
    eventId: v.id("events"),
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
  handler: async (ctx, { eventId, event, teams, matches }) => {
    const collidingEvent = await ctx.db
      .query("events")
      .withIndex("by_tbaEventKey", (q) => q.eq("tbaEventKey", event.tbaEventKey))
      .unique()
    if (collidingEvent && collidingEvent._id !== eventId) {
      throw new Error(
        "This TBA event is already imported as a separate event -- reconcile isn't possible without merging two different event records",
      )
    }

    await ctx.db.patch(eventId, {
      tbaEventKey: event.tbaEventKey,
      name: event.name,
      startDate: event.startDate,
      endDate: event.endDate,
      isManual: false,
    })

    for (const team of teams) {
      const existing = await ctx.db
        .query("teams")
        .withIndex("by_event_teamNumber", (q) => q.eq("eventId", eventId).eq("teamNumber", team.teamNumber))
        .unique()
      if (existing) {
        await ctx.db.patch(existing._id, { ...team })
      } else {
        await ctx.db.insert("teams", { ...team, eventId })
      }
    }

    for (const match of matches) {
      // Not .unique(): playoff sets (e.g. sf1m1/sf2m1/sf3m1) share the same
      // (eventId, compLevel, matchNumber) and differ only by setNumber,
      // which this index doesn't cover -- so more than one row can
      // legitimately match here.
      const candidates = await ctx.db
        .query("matches")
        .withIndex("by_event_compLevel_matchNumber", (q) =>
          q.eq("eventId", eventId).eq("compLevel", match.compLevel).eq("matchNumber", match.matchNumber),
        )
        .collect()
      const existing = candidates.find((c) => c.setNumber === match.setNumber)
      if (existing) {
        await ctx.db.patch(existing._id, { ...match })
      } else {
        await ctx.db.insert("matches", { ...match, eventId })
      }
    }
  },
})
