import { defineSchema, defineTable } from "convex/server"
import { authTables } from "@convex-dev/auth/server"
import { v } from "convex/values"

export default defineSchema({
  ...authTables,
  // Extends the auth-managed `users` table with our role field. There are
  // only ever two rows here: one for the shared admin PIN session, one for
  // the shared scout PIN session. See convex/auth.ts.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(v.union(v.literal("admin"), v.literal("scout"))),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_role", ["role"]),

  // Roster of real people who can be assigned teams and submit reports.
  // Not tied 1:1 to an auth identity -- individual attribution happens via
  // a client-side name picker on top of the shared "scout" PIN session.
  scouts: defineTable({
    name: v.string(),
  }).index("by_name", ["name"]),

  events: defineTable({
    tbaEventKey: v.string(),
    name: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    imported: v.boolean(),
    importedAt: v.optional(v.number()),
  }).index("by_tbaEventKey", ["tbaEventKey"]),

  teams: defineTable({
    eventId: v.id("events"),
    tbaTeamKey: v.string(),
    teamNumber: v.number(),
    nickname: v.string(),
    city: v.optional(v.string()),
    stateProv: v.optional(v.string()),
    country: v.optional(v.string()),
  })
    .index("by_event", ["eventId"])
    .index("by_tbaTeamKey", ["tbaTeamKey"])
    .index("by_event_teamNumber", ["eventId", "teamNumber"]),

  matches: defineTable({
    eventId: v.id("events"),
    tbaMatchKey: v.string(),
    compLevel: v.string(),
    matchNumber: v.number(),
    setNumber: v.number(),
    redTeamNumbers: v.array(v.number()),
    blueTeamNumbers: v.array(v.number()),
    scheduledTime: v.optional(v.number()),
    hasBeenPlayed: v.boolean(),
    // Raw TBA score_breakdown passthrough, kept verbatim for re-derivation
    // if our normalized fields' logic ever needs to change.
    tbaScoreBreakdown: v.optional(v.any()),
    redAutoFuel: v.optional(v.number()),
    blueAutoFuel: v.optional(v.number()),
    redTeleopFuel: v.optional(v.number()),
    blueTeleopFuel: v.optional(v.number()),
    redTowerPoints: v.optional(v.number()),
    blueTowerPoints: v.optional(v.number()),
    // Derived by replicating TBA's own determine_auto_winner tiebreak chain
    // (totalAutoPoints, then hubScore.shift1Count..shift4Count) -- TBA does
    // not publish this as a field.
    hubActiveFirst: v.optional(
      v.union(v.literal("red"), v.literal("blue"), v.literal("tied")),
    ),
    redRp: v.optional(v.number()),
    blueRp: v.optional(v.number()),
  })
    .index("by_event", ["eventId"])
    .index("by_tbaMatchKey", ["tbaMatchKey"])
    .index("by_event_compLevel_matchNumber", [
      "eventId",
      "compLevel",
      "matchNumber",
    ]),

  // One row per team: the scout permanently responsible for watching every
  // qualification match that team plays. Uniqueness (one watcher per team)
  // is enforced at mutation time via the by_team index, not schema-time.
  scoutAssignments: defineTable({
    teamId: v.id("teams"),
    scoutId: v.id("scouts"),
    assignedAt: v.number(),
    assignedBy: v.optional(v.id("scouts")),
  })
    .index("by_team", ["teamId"])
    .index("by_scout", ["scoutId"]),

  pitReports: defineTable({
    teamId: v.id("teams"),
    scoutId: v.id("scouts"),
    // General robot info
    weightLbs: v.optional(v.number()),
    drivetrain: v.optional(
      v.union(
        v.literal("Swerve"),
        v.literal("Tank"),
        v.literal("X-Drive"),
        v.literal("Mecanum"),
        v.literal("Other"),
      ),
    ),
    drivetrainSpeedEstimate: v.optional(v.string()),
    visionSystem: v.optional(
      v.union(
        v.literal("Limelight"),
        v.literal("PhotonVision"),
        v.literal("None"),
        v.literal("Other"),
      ),
    ),
    hasPracticeFieldAccess: v.optional(v.boolean()),
    // Driver & Autonomous
    driverExperience: v.optional(v.number()), // 1-4
    autoRoutineCount: v.optional(v.number()),
    claimedAutoFuelCycles: v.optional(v.number()),
    claimsAutoLevel1: v.optional(v.boolean()),
    preferredStartPosition: v.optional(
      v.union(v.literal("Left"), v.literal("Center"), v.literal("Right")),
    ),
    // FUEL Handling
    claimedScoringAbility: v.optional(v.number()), // 1-5
    claimedDefensiveAbility: v.optional(v.number()), // 1-5
    claimedFeedAssistAbility: v.optional(v.number()), // 1-5
    maxFuelCapacity: v.optional(v.number()),
    intakeSpeed: v.optional(
      v.union(v.literal("Fast"), v.literal("Medium"), v.literal("Slow")),
    ),
    hasFloorIntake: v.optional(v.boolean()),
    hasHumanPlayerIntake: v.optional(v.boolean()),
    intakeWidthInches: v.optional(v.number()),
    // Climbing
    claimedMaxTowerLevel: v.optional(v.number()), // 0-3
    climbConsistency: v.optional(
      v.union(
        v.literal("consistent-multiple"),
        v.literal("consistent-once"),
        v.literal("inconsistent"),
      ),
    ),
    notes: v.optional(v.string()),
    submittedAt: v.number(),
  }).index("by_team", ["teamId"]),

  matchReports: defineTable({
    matchId: v.id("matches"),
    teamId: v.id("teams"),
    scoutId: v.id("scouts"),
    sliders: v.object({
      teleopScoring: v.number(),
      autoScoring: v.number(),
      defense: v.number(),
      reliability: v.number(),
      strategy: v.number(),
      driverSkill: v.number(),
      confidence: v.number(),
    }),
    rationale: v.object({
      teleopScoring: v.string(),
      autoScoring: v.string(),
      defense: v.string(),
      reliability: v.string(),
      strategy: v.string(),
      driverSkill: v.string(),
      confidence: v.string(),
    }),
    notes: v.optional(v.string()),
    submittedAt: v.number(),
  })
    .index("by_match", ["matchId"])
    .index("by_team", ["teamId"])
    .index("by_match_team", ["matchId", "teamId"]),

  aiTeamAnalysis: defineTable({
    teamId: v.id("teams"),
    matchId: v.id("matches"),
    estimatedAutoFuelPoints: v.number(),
    estimatedTeleopFuelPoints: v.number(),
    confidence: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
    ),
    reasoning: v.string(),
    // Copied verbatim from TBA -- never AI-estimated.
    tbaClimbLevel: v.union(
      v.literal("none"),
      v.literal("level1"),
      v.literal("level2"),
      v.literal("level3"),
    ),
    modelVersion: v.string(),
    generatedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_match_team", ["matchId", "teamId"]),

  aiTeamSeasonSummary: defineTable({
    teamId: v.id("teams"),
    matchesAnalyzed: v.number(),
    avgAutoFuelPoints: v.number(),
    avgTeleopFuelPoints: v.number(),
    updatedAt: v.number(),
  }).index("by_team", ["teamId"]),

  pickListEntries: defineTable({
    // A specific scout's personal list, or the literal "primary" for the
    // single admin-owned shared list.
    ownerId: v.union(v.id("scouts"), v.literal("primary")),
    teamId: v.id("teams"),
    tier: v.union(
      v.literal("Tier1"),
      v.literal("Tier2"),
      v.literal("Tier3"),
      v.literal("DoNotPick"),
      v.literal("Uncategorized"),
    ),
    position: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_team", ["ownerId", "teamId"]),

  pickListMerges: defineTable({
    triggeredBy: v.id("scouts"),
    triggeredAt: v.number(),
    algorithmVersion: v.string(),
    participatingScoutIds: v.array(v.id("scouts")),
    resultingOrder: v.array(v.id("teams")),
  }).index("by_triggeredAt", ["triggeredAt"]),

  aiAnalysisJobs: defineTable({
    eventId: v.id("events"),
    status: v.union(
      v.literal("running"),
      v.literal("paused_backoff"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    totalMatches: v.number(),
    processedMatches: v.number(),
    windowStartedAt: v.number(),
    currentBackoffUntil: v.optional(v.number()),
    consecutive429s: v.number(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_event", ["eventId"]),

  aiAnalysisQueue: defineTable({
    runId: v.id("aiAnalysisJobs"),
    matchId: v.id("matches"),
    status: v.union(v.literal("queued"), v.literal("done"), v.literal("error")),
    attempts: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_run_status", ["runId", "status"]),
})
