import { v } from "convex/values"
import { query } from "./_generated/server"

function average(values: number[]) {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

// One flattened row per team -- teams, pit reports, match report averages,
// AI analysis, and pick list tier all in one place, which is the most
// useful shape for a small team pasting this into a spreadsheet.
export const getExportRows = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()
    teams.sort((a, b) => a.teamNumber - b.teamNumber)

    return await Promise.all(
      teams.map(async (team) => {
        const [pitReport, matchReports, aiSummary, pickListEntry] = await Promise.all([
          ctx.db
            .query("pitReports")
            .withIndex("by_team", (q) => q.eq("teamId", team._id))
            .unique(),
          ctx.db
            .query("matchReports")
            .withIndex("by_team", (q) => q.eq("teamId", team._id))
            .collect(),
          ctx.db
            .query("aiTeamSeasonSummary")
            .withIndex("by_team", (q) => q.eq("teamId", team._id))
            .unique(),
          ctx.db
            .query("pickListEntries")
            .withIndex("by_owner_team", (q) =>
              q.eq("ownerId", "primary").eq("teamId", team._id),
            )
            .unique(),
        ])

        return {
          team,
          pitReport,
          matchReportCount: matchReports.length,
          avgSliders: {
            teleopScoring: average(matchReports.map((r) => r.sliders.teleopScoring)),
            autoScoring: average(matchReports.map((r) => r.sliders.autoScoring)),
            defense: average(matchReports.map((r) => r.sliders.defense)),
            reliability: average(matchReports.map((r) => r.sliders.reliability)),
            strategy: average(matchReports.map((r) => r.sliders.strategy)),
            driverSkill: average(matchReports.map((r) => r.sliders.driverSkill)),
            confidence: average(matchReports.map((r) => r.sliders.confidence)),
          },
          aiSummary,
          tier: pickListEntry?.tier ?? "Uncategorized",
        }
      }),
    )
  },
})
