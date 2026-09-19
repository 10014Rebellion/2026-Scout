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
    // True only for the placeholder scout the mock-data generator creates
    // to own its fabricated reports. Filtered out of every real, human-
    // facing scout list (identity picker, scout assignment) so it can
    // never be confused with, or accidentally assigned as, a real person.
    isMockScout: v.optional(v.boolean()),
  }).index("by_name", ["name"]),

  events: defineTable({
    tbaEventKey: v.string(),
    name: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    imported: v.boolean(),
    importedAt: v.optional(v.number()),
    // True for an event created via manual CSV import (TBA down), never set
    // by the real TBA importer. tbaEventKey for a manual event is a
    // synthesized "manual-..." placeholder, not a real TBA key, until
    // manualImport.reconcileWithTba patches it (and clears this flag) once
    // TBA is back.
    isManual: v.optional(v.boolean()),
  }).index("by_tbaEventKey", ["tbaEventKey"]),

  teams: defineTable({
    eventId: v.id("events"),
    tbaTeamKey: v.string(),
    teamNumber: v.number(),
    nickname: v.string(),
    city: v.optional(v.string()),
    stateProv: v.optional(v.string()),
    country: v.optional(v.string()),
    // Current-event qualification standing, from TBA's /event/{key}/rankings.
    // Populated by tbaImport's ranking sync; null/absent rank means TBA
    // hasn't published a ranking yet (e.g. before quals start) -- never
    // inferred from match results ourselves.
    qualRank: v.optional(v.number()),
    qualNumTeams: v.optional(v.number()),
    qualWins: v.optional(v.number()),
    qualLosses: v.optional(v.number()),
    qualTies: v.optional(v.number()),
    // Peekorobo's ACE rating (see previousEvent.ace below for the "distinct
    // from Statbotics' EPA" note) for this team AT THE CURRENT event.
    // Populated by tbaImport's ranking sync alongside qualRank; absent when
    // Peekorobo has no data for this team/event.
    ace: v.optional(v.number()),
    aceAutoRaw: v.optional(v.number()),
    aceTeleopRaw: v.optional(v.number()),
    aceEndgameRaw: v.optional(v.number()),
    // Set whenever syncPreviousEventInfo runs for this team, whether or not
    // it found a prior event -- lets the UI distinguish "checked TBA, there
    // genuinely isn't one" from "never synced yet" instead of guessing.
    previousEventCheckedAt: v.optional(v.number()),
    // Snapshot of this team's most recent OTHER competition this same
    // season, strictly before the active event's start date. Sourced from
    // TBA's per-team event-status endpoint; absent entirely if TBA has no
    // qualifying prior event (never fabricated). See tbaPreviousEvent.ts.
    previousEvent: v.optional(
      v.object({
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
        // Peekorobo's ACE metric (their own performance rating, distinct
        // from Statbotics' EPA -- not the same number, so always labeled
        // "ACE (Peekorobo)" in the UI, never "EPA"), as of this same prior
        // event. Absent when Peekorobo has no data for this team/event.
        ace: v.optional(v.number()),
        aceAutoRaw: v.optional(v.number()),
        aceTeleopRaw: v.optional(v.number()),
        aceEndgameRaw: v.optional(v.number()),
      }),
    ),
  })
    .index("by_event", ["eventId"])
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

  // Classical position-based scouting: a scout owns one of the 6 field
  // positions (e.g. "Red 2") for a RANGE of qualification match numbers,
  // rather than one specific team for the whole event. Which team occupies
  // that position changes every match -- the actual team to scout is looked
  // up per match at read time (see matchReports.dashboardForScout), never
  // stored here. Multiple rows can exist for the same (event, alliance,
  // position) as long as their [startMatchNumber, endMatchNumber] ranges
  // don't overlap, so a seat can rotate between scouts over the course of
  // an event (enforced at mutation time in scoutPositionAssignments.ts, the
  // same way scoutAssignments enforces one-row-per-team). This is an
  // alternative to scoutAssignments, not a replacement: the two can be used
  // side by side, since a team-based scout can never end up double-booked
  // across two teams sharing a match, and neither can a position-based one
  // (they only ever watch one seat per match, by construction). Scoped to
  // qualification matches only -- playoff scheduling doesn't have stable
  // "ranges" the same way, and alliance selection has already happened by
  // then.
  scoutPositionAssignments: defineTable({
    eventId: v.id("events"),
    alliance: v.union(v.literal("red"), v.literal("blue")),
    position: v.number(), // 1, 2, or 3 -- index into redTeamNumbers/blueTeamNumbers
    scoutId: v.id("scouts"),
    startMatchNumber: v.number(), // inclusive, qualification match number
    endMatchNumber: v.number(), // inclusive, qualification match number
    assignedAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_event_alliance_position", ["eventId", "alliance", "position"])
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
    // True only for reports created by the admin "generate test data" tool.
    // Never set by the real scouting forms. Lets the UI badge mock data and
    // lets it all be wiped in one pass without touching real submissions.
    isMockData: v.optional(v.boolean()),
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
    // See pitReports.isMockData -- same purpose, same rule (real forms never set it).
    isMockData: v.optional(v.boolean()),
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
    // Matches where at least one alliance's Gemini call failed for a
    // non-rate-limit reason (or the match had no synced score_breakdown).
    // Counted separately from processedMatches so "completed" can't imply
    // "every match got a real estimate" when some silently didn't -- these
    // are exactly the matches the next incremental run will retry.
    matchesErrored: v.optional(v.number()),
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
