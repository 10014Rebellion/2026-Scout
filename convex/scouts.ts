import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireAdmin } from "./auth"

export const list = query({
  args: {},
  handler: async (ctx) => {
    const scouts = await ctx.db.query("scouts").collect()
    return scouts.sort((a, b) => a.name.localeCompare(b.name))
  },
})

export const add = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    await requireAdmin(ctx)
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      throw new Error("Name is required")
    }
    return await ctx.db.insert("scouts", { name: trimmed })
  },
})

export const remove = mutation({
  args: { scoutId: v.id("scouts") },
  handler: async (ctx, { scoutId }) => {
    await requireAdmin(ctx)
    const assignments = await ctx.db
      .query("scoutAssignments")
      .withIndex("by_scout", (q) => q.eq("scoutId", scoutId))
      .collect()
    for (const assignment of assignments) {
      await ctx.db.delete(assignment._id)
    }
    await ctx.db.delete(scoutId)
  },
})
