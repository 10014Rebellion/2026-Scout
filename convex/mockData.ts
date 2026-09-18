import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireAdmin } from "./auth"

const MOCK_SCOUT_NAME = "TEST Mock Scout (auto-generated)"
const MOCK_NOTE_PREFIX = "[MOCK/TEST DATA -- not a real scouting report] "

// How many teams to seed, at most, per generate call.
const TEAM_COUNT = 10

// Deterministic per-team variety without a real RNG dependency -- fine for
// disposable test data, not used for anything that needs real randomness.
function pseudoRandom(seed: number, salt: number) {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

function scaledPick(seed: number, salt: number, min: number, max: number) {
  return Math.round(min + pseudoRandom(seed, salt) * (max - min))
}

// Reports counts for the active event's mock data, so the admin UI can show
// what's currently seeded without generating/clearing blind.
export const statusForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()
    const teamIds = new Set(teams.map((t) => t._id))

    let mockPitReports = 0
    let mockMatchReports = 0
    for (const team of teams) {
      const pit = await ctx.db
        .query("pitReports")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .unique()
      if (pit?.isMockData) mockPitReports++
      const matchReports = await ctx.db
        .query("matchReports")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .collect()
      mockMatchReports += matchReports.filter((r) => r.isMockData && teamIds.has(r.teamId)).length
    }
    return { mockPitReports, mockMatchReports }
  },
})

// Seeds one pit report + one match report each for up to TEAM_COUNT teams in
// the given event, skipping any team that already has a pit report or a
// report on the match it would use (real or mock) so this never clobbers
// existing data. Every row is flagged isMockData: true and its text fields
// are prefixed so it's unmistakable in the UI.
export const generateForActiveEvent = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await requireAdmin(ctx)

    const mockScout = await ctx.db
      .query("scouts")
      .withIndex("by_name", (q) => q.eq("name", MOCK_SCOUT_NAME))
      .unique()
    const mockScoutId = mockScout
      ? mockScout._id
      : await ctx.db.insert("scouts", { name: MOCK_SCOUT_NAME, isMockScout: true })

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()
    const matches = await ctx.db
      .query("matches")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()
    matches.sort((a, b) => a.matchNumber - b.matchNumber)

    const drivetrains = ["Swerve", "Tank", "X-Drive", "Mecanum"] as const
    const startPositions = ["Left", "Center", "Right"] as const

    let seeded = 0
    let skipped = 0
    const now = Date.now()

    for (const team of teams) {
      if (seeded >= TEAM_COUNT) break

      const firstMatch = matches.find(
        (m) => m.redTeamNumbers.includes(team.teamNumber) || m.blueTeamNumbers.includes(team.teamNumber),
      )
      if (!firstMatch) {
        skipped++
        continue
      }

      const existingPit = await ctx.db
        .query("pitReports")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .unique()
      const existingMatchReport = await ctx.db
        .query("matchReports")
        .withIndex("by_match_team", (q) => q.eq("matchId", firstMatch._id).eq("teamId", team._id))
        .unique()
      if (existingPit || existingMatchReport) {
        skipped++
        continue
      }

      const seed = team.teamNumber

      await ctx.db.insert("pitReports", {
        teamId: team._id,
        scoutId: mockScoutId,
        isMockData: true,
        weightLbs: scaledPick(seed, 1, 100, 125),
        drivetrain: drivetrains[scaledPick(seed, 2, 0, drivetrains.length - 1)],
        visionSystem: "Limelight",
        hasPracticeFieldAccess: true,
        driverExperience: scaledPick(seed, 3, 1, 4),
        autoRoutineCount: scaledPick(seed, 4, 1, 3),
        claimsAutoLevel1: pseudoRandom(seed, 5) > 0.4,
        preferredStartPosition: startPositions[scaledPick(seed, 6, 0, startPositions.length - 1)],
        claimedScoringAbility: scaledPick(seed, 7, 2, 5),
        claimedDefensiveAbility: scaledPick(seed, 8, 1, 4),
        intakeSpeed: (["Fast", "Medium", "Slow"] as const)[scaledPick(seed, 9, 0, 2)],
        claimedMaxTowerLevel: scaledPick(seed, 10, 0, 3),
        climbConsistency: (["consistent-multiple", "consistent-once", "inconsistent"] as const)[
          scaledPick(seed, 11, 0, 2)
        ],
        notes: `${MOCK_NOTE_PREFIX}Generated for workflow testing, team ${team.teamNumber}.`,
        submittedAt: now,
      })

      const sliderValue = (salt: number) => scaledPick(seed, salt, 2, 5)
      await ctx.db.insert("matchReports", {
        matchId: firstMatch._id,
        teamId: team._id,
        scoutId: mockScoutId,
        isMockData: true,
        sliders: {
          teleopScoring: sliderValue(20),
          autoScoring: sliderValue(21),
          defense: sliderValue(22),
          reliability: sliderValue(23),
          strategy: sliderValue(24),
          driverSkill: sliderValue(25),
          confidence: sliderValue(26),
        },
        rationale: {
          teleopScoring: `${MOCK_NOTE_PREFIX}Placeholder rationale.`,
          autoScoring: `${MOCK_NOTE_PREFIX}Placeholder rationale.`,
          defense: `${MOCK_NOTE_PREFIX}Placeholder rationale.`,
          reliability: `${MOCK_NOTE_PREFIX}Placeholder rationale.`,
          strategy: `${MOCK_NOTE_PREFIX}Placeholder rationale.`,
          driverSkill: `${MOCK_NOTE_PREFIX}Placeholder rationale.`,
          confidence: `${MOCK_NOTE_PREFIX}Placeholder rationale.`,
        },
        notes: `${MOCK_NOTE_PREFIX}Match ${firstMatch.compLevel}${firstMatch.matchNumber}.`,
        submittedAt: now,
      })

      seeded++
    }

    return { seeded, skipped }
  },
})

// Deletes every mock-flagged pit/match report in the given event, plus the
// placeholder mock scout itself once it no longer owns anything. Never
// touches a real report, even for a team that also has mock rows.
export const clearForEvent = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await requireAdmin(ctx)

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()

    let deleted = 0
    for (const team of teams) {
      const pit = await ctx.db
        .query("pitReports")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .unique()
      if (pit?.isMockData) {
        await ctx.db.delete(pit._id)
        deleted++
      }
      const matchReports = await ctx.db
        .query("matchReports")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .collect()
      for (const report of matchReports) {
        if (report.isMockData) {
          await ctx.db.delete(report._id)
          deleted++
        }
      }
    }

    // The mock scout is shared across every event (scouts aren't event-
    // scoped), so only remove it once it owns nothing anywhere -- otherwise
    // clearing THIS event's mock data would dangle another event's rows.
    const mockScout = await ctx.db
      .query("scouts")
      .withIndex("by_name", (q) => q.eq("name", MOCK_SCOUT_NAME))
      .unique()
    if (mockScout) {
      const [allPitReports, allMatchReports] = await Promise.all([
        ctx.db.query("pitReports").collect(),
        ctx.db.query("matchReports").collect(),
      ])
      const stillOwnsData =
        allPitReports.some((r) => r.scoutId === mockScout._id) ||
        allMatchReports.some((r) => r.scoutId === mockScout._id)
      if (!stillOwnsData) {
        await ctx.db.delete(mockScout._id)
      }
    }

    return { deleted }
  },
})
