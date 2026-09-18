import { fetchQuery } from "convex/nextjs"
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server"
import { api } from "@/convex/_generated/api"

const COLUMNS = [
  "Team Number",
  "Nickname",
  "City",
  "State",
  "Country",
  "Pit Scouted",
  "Drivetrain",
  "Vision System",
  "Driver Experience (1-4)",
  "Claims Auto Level 1",
  "Preferred Start",
  "Claimed Scoring (1-5)",
  "Claimed Defense (1-5)",
  "Claimed Feed/Assist (1-5)",
  "Max FUEL Capacity",
  "Intake Speed",
  "Floor Intake",
  "Human Player Intake",
  "Intake Width (in)",
  "Claimed Max TOWER Level",
  "Climb Consistency",
  "Pit Notes",
  "Match Reports",
  "Avg Teleop Scoring",
  "Avg Auto Scoring",
  "Avg Defense",
  "Avg Reliability",
  "Avg Strategy",
  "Avg Driver Skill",
  "Avg Scout Confidence",
  "AI Matches Analyzed",
  "AI Avg Auto FUEL Points",
  "AI Avg Teleop FUEL Points",
  "Pick List Tier",
] as const

function csvCell(value: unknown): string {
  if (value === undefined || value === null) return ""
  const str = String(value)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

function fmt(value: number | null | undefined, digits = 2) {
  return value === null || value === undefined ? "" : value.toFixed(digits)
}

export async function GET() {
  const token = await convexAuthNextjsToken()
  const activeEvent = await fetchQuery(api.events.getActiveEvent, {}, { token })
  if (!activeEvent) {
    return new Response("No active event to export.", { status: 404 })
  }

  const rows = await fetchQuery(
    api.dataExport.getExportRows,
    { eventId: activeEvent._id },
    { token },
  )

  const lines = [COLUMNS.join(",")]
  for (const row of rows) {
    const { team, pitReport, matchReportCount, avgSliders, aiSummary, tier } = row
    lines.push(
      [
        team.teamNumber,
        team.nickname,
        team.city ?? "",
        team.stateProv ?? "",
        team.country ?? "",
        pitReport ? "Yes" : "No",
        pitReport?.drivetrain ?? "",
        pitReport?.visionSystem ?? "",
        pitReport?.driverExperience ?? "",
        pitReport?.claimsAutoLevel1 === undefined ? "" : pitReport.claimsAutoLevel1 ? "Yes" : "No",
        pitReport?.preferredStartPosition ?? "",
        pitReport?.claimedScoringAbility ?? "",
        pitReport?.claimedDefensiveAbility ?? "",
        pitReport?.claimedFeedAssistAbility ?? "",
        pitReport?.maxFuelCapacity ?? "",
        pitReport?.intakeSpeed ?? "",
        pitReport?.hasFloorIntake === undefined ? "" : pitReport.hasFloorIntake ? "Yes" : "No",
        pitReport?.hasHumanPlayerIntake === undefined ? "" : pitReport.hasHumanPlayerIntake ? "Yes" : "No",
        pitReport?.intakeWidthInches ?? "",
        pitReport?.claimedMaxTowerLevel ?? "",
        pitReport?.climbConsistency ?? "",
        pitReport?.notes ?? "",
        matchReportCount,
        fmt(avgSliders.teleopScoring),
        fmt(avgSliders.autoScoring),
        fmt(avgSliders.defense),
        fmt(avgSliders.reliability),
        fmt(avgSliders.strategy),
        fmt(avgSliders.driverSkill),
        fmt(avgSliders.confidence),
        aiSummary?.matchesAnalyzed ?? 0,
        fmt(aiSummary?.avgAutoFuelPoints ?? null),
        fmt(aiSummary?.avgTeleopFuelPoints ?? null),
        tier,
      ]
        .map(csvCell)
        .join(","),
    )
  }

  const csv = lines.join("\r\n")
  const filename = `${activeEvent.tbaEventKey}-scouting-export.csv`

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
