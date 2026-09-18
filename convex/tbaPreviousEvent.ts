import { v } from "convex/values"
import { action, internalMutation, internalQuery } from "./_generated/server"
import { internal, api } from "./_generated/api"
import { Id } from "./_generated/dataModel"

const TBA_BASE = "https://www.thebluealliance.com/api/v3"

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

interface TbaEventSimpleWithKey {
  key: string
  name: string
  start_date: string
  end_date: string
}

interface TbaWltRecord {
  wins: number
  losses: number
  ties: number
}

// Verified live against /team/{key}/events/{year}/statuses for a real team
// with playoff history. rank/record are null when TBA hasn't published a
// ranking for that event -- must be surfaced as "unavailable," not guessed.
// The *_status_str fields TBA also returns are pre-formatted HTML (contain
// literal <b> tags) and are deliberately not used here to avoid needing to
// render raw HTML from a third party.
interface TbaTeamEventStatus {
  alliance?: { number: number; pick: number } | null
  playoff?: {
    level: string
    record?: TbaWltRecord | null
    status?: string | null
  } | null
  qual?: {
    num_teams: number
    ranking: { rank: number | null; record: TbaWltRecord | null } | null
  } | null
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

export const listTeamsForEvent = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()
    return teams.map((t) => ({ teamId: t._id, tbaTeamKey: t.tbaTeamKey }))
  },
})

const previousEventValidator = v.object({
  tbaEventKey: v.string(),
  name: v.string(),
  endDate: v.string(),
  qualRank: v.optional(v.number()),
  qualNumTeams: v.optional(v.number()),
  qualWins: v.optional(v.number()),
  qualLosses: v.optional(v.number()),
  qualTies: v.optional(v.number()),
  allianceNumber: v.optional(v.number()),
  alliancePick: v.optional(v.number()),
  playoffLevel: v.optional(v.string()),
  playoffStatus: v.optional(v.string()),
  playoffWins: v.optional(v.number()),
  playoffLosses: v.optional(v.number()),
  playoffTies: v.optional(v.number()),
})

export const applyPreviousEventData = internalMutation({
  args: {
    updates: v.array(
      v.object({
        teamId: v.id("teams"),
        previousEvent: v.optional(previousEventValidator),
      }),
    ),
  },
  handler: async (ctx, { updates }) => {
    for (const update of updates) {
      await ctx.db.patch(update.teamId, {
        previousEvent: update.previousEvent,
        previousEventCheckedAt: Date.now(),
      })
    }
    return { updated: updates.length }
  },
})

// For every team at the active event, finds their most recent OTHER
// competition in the same season (strictly before this event's start date)
// and snapshots its qual rank/record, alliance selection, and playoff
// result. Two TBA calls per team (event list + statuses), run with limited
// concurrency to keep this reasonably fast without hammering TBA's API.
export const syncPreviousEventInfo = action({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }): Promise<{ updated: number; withPreviousEvent: number; failed: number }> => {
    const role = await ctx.runQuery(api.auth.currentRole, {})
    if (role !== "admin") {
      throw new Error("Admin access required")
    }

    const event = await ctx.runQuery(internal.tbaImport.getEventById, { eventId })
    if (!event) {
      throw new Error("Event not found")
    }

    const teams: { teamId: Id<"teams">; tbaTeamKey: string }[] = await ctx.runQuery(
      internal.tbaPreviousEvent.listTeamsForEvent,
      { eventId },
    )
    const year = event.startDate.slice(0, 4)

    let failed = 0
    const results = await mapWithConcurrency(teams, 6, async (team) => {
      try {
        const [events, statuses] = await Promise.all([
          tbaFetch<TbaEventSimpleWithKey[]>(`/team/${team.tbaTeamKey}/events/${year}/simple`),
          tbaFetch<Record<string, TbaTeamEventStatus>>(`/team/${team.tbaTeamKey}/events/${year}/statuses`),
        ])

        const priorEvents = events
          .filter((e) => e.key !== event.tbaEventKey && e.start_date < event.startDate)
          .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))
        const mostRecent = priorEvents[0]
        if (!mostRecent) {
          return { teamId: team.teamId, previousEvent: undefined }
        }

        const status: TbaTeamEventStatus | undefined = statuses[mostRecent.key]
        return {
          teamId: team.teamId,
          previousEvent: {
            tbaEventKey: mostRecent.key,
            name: mostRecent.name,
            endDate: mostRecent.end_date,
            qualRank: status?.qual?.ranking?.rank ?? undefined,
            qualNumTeams: status?.qual?.num_teams ?? undefined,
            qualWins: status?.qual?.ranking?.record?.wins ?? undefined,
            qualLosses: status?.qual?.ranking?.record?.losses ?? undefined,
            qualTies: status?.qual?.ranking?.record?.ties ?? undefined,
            allianceNumber: status?.alliance?.number ?? undefined,
            alliancePick: status?.alliance?.pick ?? undefined,
            playoffLevel: status?.playoff?.level ?? undefined,
            playoffStatus: status?.playoff?.status ?? undefined,
            playoffWins: status?.playoff?.record?.wins ?? undefined,
            playoffLosses: status?.playoff?.record?.losses ?? undefined,
            playoffTies: status?.playoff?.record?.ties ?? undefined,
          },
        }
      } catch {
        failed++
        return null
      }
    })

    // A failed fetch is skipped entirely rather than patched with
    // previousEvent: undefined, so a transient TBA error can't wipe out
    // good data from an earlier successful sync.
    const updates = results.filter((r): r is NonNullable<typeof r> => r !== null)

    const { updated } = await ctx.runMutation(internal.tbaPreviousEvent.applyPreviousEventData, { updates })
    const withPreviousEvent = updates.filter((u) => u.previousEvent !== undefined).length

    return { updated, withPreviousEvent, failed }
  },
})
