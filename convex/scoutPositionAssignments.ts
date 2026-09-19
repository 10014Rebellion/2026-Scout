import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireAdmin } from "./auth"

export const ALLIANCES = ["red", "blue"] as const
export const POSITIONS = [1, 2, 3] as const

export function positionLabel(alliance: "red" | "blue", position: number) {
  return `${alliance === "red" ? "Red" : "Blue"} ${position}`
}

// All 6 field-position slots for the event, each with its list of
// qual-match-range assignments (a seat can rotate between several scouts
// over the course of an event). Always returns exactly 6 rows, in a fixed
// order, even for seats with zero ranges, so the admin UI can render a
// stable grid.
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
        const seatAssignments = assignments
          .filter((a) => a.alliance === alliance && a.position === position)
          .sort((a, b) => a.startMatchNumber - b.startMatchNumber)

        const ranges = await Promise.all(
          seatAssignments.map(async (a) => {
            const scout = await ctx.db.get(a.scoutId)
            const isValidRealScout = scout !== null && !scout.isMockScout
            return {
              _id: a._id,
              startMatchNumber: a.startMatchNumber,
              endMatchNumber: a.endMatchNumber,
              scoutId: isValidRealScout ? a.scoutId : null,
              scoutName: isValidRealScout ? scout.name : "(removed scout)",
            }
          }),
        )

        rows.push({ alliance, position, label: positionLabel(alliance, position), ranges })
      }
    }
    return rows
  },
})

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart <= bEnd && bStart <= aEnd
}

// Adds one match-range assignment to a seat. Rejects a range that overlaps
// an existing one for the same seat -- a match must have exactly one scout
// watching a given seat, never zero-vs-ambiguous or two-at-once.
export const addPositionRange = mutation({
  args: {
    eventId: v.id("events"),
    alliance: v.union(v.literal("red"), v.literal("blue")),
    position: v.number(),
    scoutId: v.id("scouts"),
    startMatchNumber: v.number(),
    endMatchNumber: v.number(),
  },
  handler: async (ctx, { eventId, alliance, position, scoutId, startMatchNumber, endMatchNumber }) => {
    await requireAdmin(ctx)

    if (startMatchNumber < 1 || endMatchNumber < startMatchNumber) {
      throw new Error("Invalid match range")
    }

    const existing = await ctx.db
      .query("scoutPositionAssignments")
      .withIndex("by_event_alliance_position", (q) =>
        q.eq("eventId", eventId).eq("alliance", alliance).eq("position", position),
      )
      .collect()

    const conflict = existing.find((a) =>
      rangesOverlap(startMatchNumber, endMatchNumber, a.startMatchNumber, a.endMatchNumber),
    )
    if (conflict) {
      throw new Error(
        `Matches ${conflict.startMatchNumber}-${conflict.endMatchNumber} on this seat are already assigned`,
      )
    }

    await ctx.db.insert("scoutPositionAssignments", {
      eventId,
      alliance,
      position,
      scoutId,
      startMatchNumber,
      endMatchNumber,
      assignedAt: Date.now(),
    })
  },
})

export const removePositionRange = mutation({
  args: { assignmentId: v.id("scoutPositionAssignments") },
  handler: async (ctx, { assignmentId }) => {
    await requireAdmin(ctx)
    await ctx.db.delete(assignmentId)
  },
})
