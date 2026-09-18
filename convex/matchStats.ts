import { v } from "convex/values"
import { query } from "./_generated/server"
import { Doc } from "./_generated/dataModel"

interface TbaAllianceBreakdownShape {
  totalAutoPoints?: number
  totalTeleopPoints?: number
  totalTowerPoints?: number
  totalPoints?: number
  autoTowerRobot1?: string
  autoTowerRobot2?: string
  autoTowerRobot3?: string
  endGameTowerRobot1?: string
  endGameTowerRobot2?: string
  endGameTowerRobot3?: string
}

function mapAutoClimb(raw: string | undefined): "none" | "level1" | null {
  if (raw === undefined) return null
  return raw === "Level1" ? "level1" : "none"
}

function mapEndgameClimb(raw: string | undefined): "none" | "level1" | "level2" | "level3" | null {
  if (raw === undefined) return null
  if (raw === "Level1") return "level1"
  if (raw === "Level2") return "level2"
  if (raw === "Level3") return "level3"
  return "none"
}

// Bracket order, not alphabetical -- "qm" must sort before playoff levels,
// and playoff levels must sort in elimination order.
const COMP_LEVEL_ORDER: Record<string, number> = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 }

// One row per (match, team-in-that-match) -- 6 rows per match (3 red + 3
// blue) -- flattened for the Match-by-Match Analysis tab. Every field here
// is either copied straight from TBA (alliance FUEL/TOWER totals, per-robot
// climb, RP), from a scout's own submitted report, or from this app's own
// AI estimate for that specific (match, team). Nothing here is invented:
// fields TBA hasn't published yet (unsynced score, no ranking, etc.) come
// back null/undefined rather than a guessed value.
export const listForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const [matches, teams] = await Promise.all([
      ctx.db
        .query("matches")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .collect(),
      ctx.db
        .query("teams")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .collect(),
    ])

    const teamByNumber = new Map<number, Doc<"teams">>(teams.map((t) => [t.teamNumber, t]))

    const rows = await Promise.all(
      matches.flatMap((match) => {
        const breakdown = match.tbaScoreBreakdown as
          | { red?: TbaAllianceBreakdownShape; blue?: TbaAllianceBreakdownShape }
          | null
          | undefined

        return (["red", "blue"] as const).flatMap((alliance) =>
          (alliance === "red" ? match.redTeamNumbers : match.blueTeamNumbers).map(
            async (teamNumber, robotIndex) => {
              const team = teamByNumber.get(teamNumber)
              if (!team) return null

              const allianceBreakdown = breakdown?.[alliance]
              const opponentBreakdown = breakdown?.[alliance === "red" ? "blue" : "red"]

              let result: "win" | "loss" | "tie" | null = null
              if (allianceBreakdown?.totalPoints !== undefined && opponentBreakdown?.totalPoints !== undefined) {
                result =
                  allianceBreakdown.totalPoints > opponentBreakdown.totalPoints
                    ? "win"
                    : allianceBreakdown.totalPoints < opponentBreakdown.totalPoints
                      ? "loss"
                      : "tie"
              }

              const [matchReport, aiAnalysis] = await Promise.all([
                ctx.db
                  .query("matchReports")
                  .withIndex("by_match_team", (q) => q.eq("matchId", match._id).eq("teamId", team._id))
                  .unique(),
                ctx.db
                  .query("aiTeamAnalysis")
                  .withIndex("by_match_team", (q) => q.eq("matchId", match._id).eq("teamId", team._id))
                  .unique(),
              ])

              return {
                matchId: match._id,
                tbaMatchKey: match.tbaMatchKey,
                compLevel: match.compLevel,
                matchNumber: match.matchNumber,
                setNumber: match.setNumber,
                hasBeenPlayed: match.hasBeenPlayed,
                scheduledTime: match.scheduledTime,
                teamId: team._id,
                teamNumber: team.teamNumber,
                nickname: team.nickname,
                alliance,
                result,
                allianceAutoFuelPoints: allianceBreakdown?.totalAutoPoints,
                allianceTeleopFuelPoints: allianceBreakdown?.totalTeleopPoints,
                allianceTowerPoints: allianceBreakdown?.totalTowerPoints,
                allianceTotalPoints: allianceBreakdown?.totalPoints,
                allianceRp: alliance === "red" ? match.redRp : match.blueRp,
                autoClimb: mapAutoClimb(
                  allianceBreakdown?.[`autoTowerRobot${robotIndex + 1}` as "autoTowerRobot1"],
                ),
                endgameClimb: mapEndgameClimb(
                  allianceBreakdown?.[`endGameTowerRobot${robotIndex + 1}` as "endGameTowerRobot1"],
                ),
                scoutReportSubmitted: matchReport !== null,
                sliders: matchReport?.sliders ?? null,
                scoutNotes: matchReport?.notes ?? null,
                isMockScoutData: matchReport?.isMockData ?? false,
                aiEstimate: aiAnalysis
                  ? {
                      estimatedAutoFuelPoints: aiAnalysis.estimatedAutoFuelPoints,
                      estimatedTeleopFuelPoints: aiAnalysis.estimatedTeleopFuelPoints,
                      confidence: aiAnalysis.confidence,
                      reasoning: aiAnalysis.reasoning,
                    }
                  : null,
              }
            },
          ),
        )
      }),
    )

    return rows
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => {
        const levelDiff = (COMP_LEVEL_ORDER[a.compLevel] ?? 99) - (COMP_LEVEL_ORDER[b.compLevel] ?? 99)
        if (levelDiff !== 0) return levelDiff
        if (a.setNumber !== b.setNumber) return a.setNumber - b.setNumber
        if (a.matchNumber !== b.matchNumber) return a.matchNumber - b.matchNumber
        return a.teamNumber - b.teamNumber
      })
  },
})
