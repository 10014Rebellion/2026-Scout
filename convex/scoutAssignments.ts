import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireAdmin } from "./auth"

export const listForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()
    const rows = await Promise.all(
      teams.map(async (team) => {
        const assignment = await ctx.db
          .query("scoutAssignments")
          .withIndex("by_team", (q) => q.eq("teamId", team._id))
          .unique()
        const scout = assignment ? await ctx.db.get(assignment.scoutId) : null
        return {
          team,
          scoutId: assignment?.scoutId ?? null,
          scoutName: scout?.name ?? null,
        }
      }),
    )
    return rows.sort((a, b) => a.team.teamNumber - b.team.teamNumber)
  },
})

export const listForScout = query({
  args: { scoutId: v.id("scouts") },
  handler: async (ctx, { scoutId }) => {
    const assignments = await ctx.db
      .query("scoutAssignments")
      .withIndex("by_scout", (q) => q.eq("scoutId", scoutId))
      .collect()
    const teams = await Promise.all(
      assignments.map((assignment) => ctx.db.get(assignment.teamId)),
    )
    return teams
      .filter((team) => team !== null)
      .sort((a, b) => a.teamNumber - b.teamNumber)
  },
})

// Manual override: reassigns a single team to a different scout. Enforced
// as one row per team via the by_team index -- patch if a row already
// exists, insert otherwise -- rather than a schema-level constraint, since
// Convex doesn't have native unique indexes.
export const reassignTeam = mutation({
  args: { teamId: v.id("teams"), scoutId: v.id("scouts") },
  handler: async (ctx, { teamId, scoutId }) => {
    await requireAdmin(ctx)
    const existing = await ctx.db
      .query("scoutAssignments")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, { scoutId, assignedAt: Date.now() })
    } else {
      await ctx.db.insert("scoutAssignments", {
        teamId,
        scoutId,
        assignedAt: Date.now(),
      })
    }
  },
})

// Evenly splits every team in the event across all scouts (round-robin by
// team number), overwriting any existing assignments.
export const rebalance = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await requireAdmin(ctx)
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()
    const scouts = await ctx.db.query("scouts").collect()
    if (scouts.length === 0) {
      throw new Error("Add at least one scout before rebalancing")
    }
    const sortedTeams = [...teams].sort((a, b) => a.teamNumber - b.teamNumber)
    for (let i = 0; i < sortedTeams.length; i++) {
      const team = sortedTeams[i]
      const scoutId = scouts[i % scouts.length]._id
      const existing = await ctx.db
        .query("scoutAssignments")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .unique()
      if (existing) {
        await ctx.db.patch(existing._id, { scoutId, assignedAt: Date.now() })
      } else {
        await ctx.db.insert("scoutAssignments", {
          teamId: team._id,
          scoutId,
          assignedAt: Date.now(),
        })
      }
    }
  },
})
