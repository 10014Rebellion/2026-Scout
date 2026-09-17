import { v } from "convex/values"
import { query } from "./_generated/server"

export const getById = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    return await ctx.db.get(teamId)
  },
})

export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()
    return teams.sort((a, b) => a.teamNumber - b.teamNumber)
  },
})
