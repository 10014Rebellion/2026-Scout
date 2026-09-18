import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

const slidersValidator = v.object({
  teleopScoring: v.number(),
  autoScoring: v.number(),
  defense: v.number(),
  reliability: v.number(),
  strategy: v.number(),
  driverSkill: v.number(),
  confidence: v.number(),
})

const rationaleValidator = v.object({
  teleopScoring: v.string(),
  autoScoring: v.string(),
  defense: v.string(),
  reliability: v.string(),
  strategy: v.string(),
  driverSkill: v.string(),
  confidence: v.string(),
})

export const getByMatchTeam = query({
  args: { matchId: v.id("matches"), teamId: v.id("teams") },
  handler: async (ctx, { matchId, teamId }) => {
    return await ctx.db
      .query("matchReports")
      .withIndex("by_match_team", (q) => q.eq("matchId", matchId).eq("teamId", teamId))
      .unique()
  },
})

// One row per (team the scout watches) x (match that team plays in) --
// built from scoutAssignments rather than every match in the event, since
// a scout only ever reports on their own assigned teams.
export const dashboardForScout = query({
  args: { scoutId: v.id("scouts") },
  handler: async (ctx, { scoutId }) => {
    const assignments = await ctx.db
      .query("scoutAssignments")
      .withIndex("by_scout", (q) => q.eq("scoutId", scoutId))
      .collect()

    const teams = (
      await Promise.all(assignments.map((assignment) => ctx.db.get(assignment.teamId)))
    ).filter((team) => team !== null)

    const items = []
    for (const team of teams) {
      const matches = await ctx.db
        .query("matches")
        .withIndex("by_event", (q) => q.eq("eventId", team.eventId))
        .collect()
      const relevantMatches = matches.filter(
        (match) =>
          match.redTeamNumbers.includes(team.teamNumber) ||
          match.blueTeamNumbers.includes(team.teamNumber),
      )
      for (const match of relevantMatches) {
        const report = await ctx.db
          .query("matchReports")
          .withIndex("by_match_team", (q) =>
            q.eq("matchId", match._id).eq("teamId", team._id),
          )
          .unique()
        items.push({
          match,
          team,
          alliance: match.redTeamNumbers.includes(team.teamNumber) ? "red" : "blue",
          hasReport: report !== null,
        })
      }
    }

    return items.sort((a, b) => a.match.matchNumber - b.match.matchNumber)
  },
})

// All of a team's match reports, newest match first -- for the Team
// Detail view (scouting history across the whole event, not one scout's
// dashboard).
export const listByTeam = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const reports = await ctx.db
      .query("matchReports")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect()
    const withMatches = await Promise.all(
      reports.map(async (report) => ({
        report,
        match: await ctx.db.get(report.matchId),
      })),
    )
    return withMatches.sort((a, b) => (b.match?.matchNumber ?? 0) - (a.match?.matchNumber ?? 0))
  },
})

// Report counts per team -- drives the Team List grid without an N+1
// query per card.
export const countsForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()
    const counts: Record<string, number> = {}
    for (const team of teams) {
      const reports = await ctx.db
        .query("matchReports")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .collect()
      counts[team._id] = reports.length
    }
    return counts
  },
})

// One report per (match, team) pair -- patches an existing row if the
// scout is correcting an earlier submission.
export const submit = mutation({
  args: {
    matchId: v.id("matches"),
    teamId: v.id("teams"),
    scoutId: v.id("scouts"),
    sliders: slidersValidator,
    rationale: rationaleValidator,
    notes: v.optional(v.string()),
    submittedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { matchId, teamId, ...rest } = args
    const existing = await ctx.db
      .query("matchReports")
      .withIndex("by_match_team", (q) => q.eq("matchId", matchId).eq("teamId", teamId))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, rest)
    } else {
      await ctx.db.insert("matchReports", { matchId, teamId, ...rest })
    }
  },
})
