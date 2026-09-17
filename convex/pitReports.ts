import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

const drivetrainValidator = v.union(
  v.literal("Swerve"),
  v.literal("Tank"),
  v.literal("X-Drive"),
  v.literal("Mecanum"),
  v.literal("Other"),
)

const visionSystemValidator = v.union(
  v.literal("Limelight"),
  v.literal("PhotonVision"),
  v.literal("None"),
  v.literal("Other"),
)

const startPositionValidator = v.union(
  v.literal("Left"),
  v.literal("Center"),
  v.literal("Right"),
)

const intakeSpeedValidator = v.union(
  v.literal("Fast"),
  v.literal("Medium"),
  v.literal("Slow"),
)

const climbConsistencyValidator = v.union(
  v.literal("consistent-multiple"),
  v.literal("consistent-once"),
  v.literal("inconsistent"),
)

export const getByTeam = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    return await ctx.db
      .query("pitReports")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .unique()
  },
})

// Drives the scouted/not-scouted grid on the pit scouting landing page.
export const listStatusForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()
    const statuses = await Promise.all(
      teams.map(async (team) => {
        const report = await ctx.db
          .query("pitReports")
          .withIndex("by_team", (q) => q.eq("teamId", team._id))
          .unique()
        return {
          teamId: team._id,
          teamNumber: team.teamNumber,
          nickname: team.nickname,
          isScouted: report !== null,
        }
      }),
    )
    return statuses.sort((a, b) => a.teamNumber - b.teamNumber)
  },
})

// One report per team -- patches the existing row if a scout is correcting
// an earlier submission rather than creating a duplicate.
export const submit = mutation({
  args: {
    teamId: v.id("teams"),
    scoutId: v.id("scouts"),
    weightLbs: v.optional(v.number()),
    drivetrain: v.optional(drivetrainValidator),
    drivetrainSpeedEstimate: v.optional(v.string()),
    visionSystem: v.optional(visionSystemValidator),
    hasPracticeFieldAccess: v.optional(v.boolean()),
    driverExperience: v.optional(v.number()),
    autoRoutineCount: v.optional(v.number()),
    claimedAutoFuelCycles: v.optional(v.number()),
    claimsAutoLevel1: v.optional(v.boolean()),
    preferredStartPosition: v.optional(startPositionValidator),
    claimedScoringAbility: v.optional(v.number()),
    claimedDefensiveAbility: v.optional(v.number()),
    claimedFeedAssistAbility: v.optional(v.number()),
    maxFuelCapacity: v.optional(v.number()),
    intakeSpeed: v.optional(intakeSpeedValidator),
    hasFloorIntake: v.optional(v.boolean()),
    hasHumanPlayerIntake: v.optional(v.boolean()),
    intakeWidthInches: v.optional(v.number()),
    claimedMaxTowerLevel: v.optional(v.number()),
    climbConsistency: v.optional(climbConsistencyValidator),
    notes: v.optional(v.string()),
    submittedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { teamId, ...rest } = args
    const existing = await ctx.db
      .query("pitReports")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, rest)
    } else {
      await ctx.db.insert("pitReports", { teamId, ...rest })
    }
  },
})
