import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireAdmin } from "./auth"

export const ALLIANCES = ["red", "blue"] as const
export const POSITIONS = [1, 2, 3] as const

export function positionLabel(alliance: "red" | "blue", position: number) {
  return `${alliance === "red" ? "Red" : "Blue"} ${position}`
}

// All 6 field-position slots for the event, with whichever scout (if any)
// owns each one. Always returns exactly 6 rows, in a fixed order, so the
// admin UI can render a stable grid even before anything's been assigned.
export const listForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const assignments = await ctx.db
      .query("scoutPositionAssignments")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()

    const rows = []
    for (const alliance of ALLIANCES as readonly ("red" | "blue")[]) {
      for (const position of POSITIONS) {
        const assignment = assignments.find((a) => a.alliance === alliance && a.position === position)
        const scout = assignment ? await ctx.db.get(assignment.scoutId) : null
        const isValidRealScout = scout !== null && !scout.isMockScout
        rows.push({
          alliance,
          position,
          label: positionLabel(alliance, position),
          scoutId: isValidRealScout ? assignment!.scoutId : null,
          scoutName: isValidRealScout ? scout.name : null,
        })
      }
    }
    return rows
  },
})

// Upsert by (eventId, alliance, position) -- one scout per slot, enforced
// at mutation time the same way scoutAssignments.reassignTeam enforces one
// scout per team.
export const assignPosition = mutation({
  args: {
    eventId: v.id("events"),
    alliance: v.union(v.literal("red"), v.literal("blue")),
    position: v.number(),
    scoutId: v.id("scouts"),
  },
  handler: async (ctx, { eventId, alliance, position, scoutId }) => {
    await requireAdmin(ctx)
    const existing = await ctx.db
      .query("scoutPositionAssignments")
      .withIndex("by_event_alliance_position", (q) =>
        q.eq("eventId", eventId).eq("alliance", alliance).eq("position", position),
      )
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, { scoutId, assignedAt: Date.now() })
    } else {
      await ctx.db.insert("scoutPositionAssignments", { eventId, alliance, position, scoutId, assignedAt: Date.now() })
    }
  },
})
