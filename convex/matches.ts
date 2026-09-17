import { v } from "convex/values"
import { query } from "./_generated/server"

export const getById = query({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    return await ctx.db.get(matchId)
  },
})

export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const matches = await ctx.db
      .query("matches")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()
    return matches.sort((a, b) => a.matchNumber - b.matchNumber)
  },
})

export const listByTeam = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const team = await ctx.db.get(teamId)
    if (!team) {
      return []
    }
    const matches = await ctx.db
      .query("matches")
      .withIndex("by_event", (q) => q.eq("eventId", team.eventId))
      .collect()
    return matches
      .filter(
        (m) =>
          m.redTeamNumbers.includes(team.teamNumber) ||
          m.blueTeamNumbers.includes(team.teamNumber),
      )
      .sort((a, b) => a.matchNumber - b.matchNumber)
  },
})
