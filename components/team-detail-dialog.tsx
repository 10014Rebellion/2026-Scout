"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { ConfidenceBadge, CLIMB_LABEL } from "@/components/confidence-badge"
import { TIER_LABELS, type TierValue } from "@/components/pick-list/types"
import { formatOrdinalPick, formatPlayoffResult, formatRecord } from "@/lib/format-team-status"

const SLIDER_LABELS: Record<string, string> = {
  teleopScoring: "Teleop scoring",
  autoScoring: "Auto scoring",
  defense: "Defense",
  reliability: "Reliability",
  strategy: "Strategy",
  driverSkill: "Driver skill",
  confidence: "Scout confidence",
}

const CLIMB_VALUE: Record<string, number> = { none: 0, level1: 1, level2: 2, level3: 3 }

function MockDataBadge() {
  return (
    <span className="rounded-full bg-warning px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning-foreground">
      Test data
    </span>
  )
}

function average(values: number[]) {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

export function TeamDetailDialog({
  teamId,
  tier,
  onClose,
}: {
  teamId: Id<"teams">
  tier: TierValue
  onClose: () => void
}) {
  const team = useQuery(api.teams.getById, { teamId })
  const pitReport = useQuery(api.pitReports.getByTeam, { teamId })
  const matchReports = useQuery(api.matchReports.listByTeam, { teamId })
  const analyses = useQuery(api.aiAnalysis.listAnalysesForTeam, { teamId })

  const avgClimb =
    analyses && analyses.length > 0
      ? average(analyses.map(({ analysis }) => CLIMB_VALUE[analysis.tbaClimbLevel]))
      : null
  const avgClimbLabel =
    avgClimb === null
      ? "—"
      : avgClimb === 0
        ? "No climb"
        : `~Level ${avgClimb.toFixed(1)}`

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <span className="font-mono">{team?.teamNumber}</span>
            {team?.nickname}
          </DialogTitle>
          <DialogDescription>
            {[team?.city, team?.stateProv, team?.country].filter(Boolean).join(", ") || "Location unknown"}
            {" · "}
            <span className="font-semibold">{TIER_LABELS[tier]}</span>
          </DialogDescription>
        </DialogHeader>

        <Section title="This event">
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex flex-col">
              <span className="font-mono text-base font-semibold">
                {team?.qualRank !== undefined
                  ? `#${team.qualRank}${team.qualNumTeams ? ` / ${team.qualNumTeams}` : ""}`
                  : "—"}
              </span>
              <span className="text-xs text-muted-foreground">qual rank</span>
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-base font-semibold">
                {formatRecord(
                  team?.qualWins !== undefined
                    ? { wins: team.qualWins, losses: team.qualLosses ?? 0, ties: team.qualTies ?? 0 }
                    : null,
                ) ?? "—"}
              </span>
              <span className="text-xs text-muted-foreground">qual record</span>
            </div>
          </div>
        </Section>

        <Separator />

        <Section title="Previous event" badge={<span className="text-[10px] font-normal text-muted-foreground">(different competition -- not this event)</span>}>
          {team === undefined && <Loading />}
          {team && team.previousEvent === undefined && team.previousEventCheckedAt === undefined && (
            <Empty text="Not yet checked -- run &ldquo;Sync previous-event data&rdquo; on the Team List page." />
          )}
          {team && team.previousEvent === undefined && team.previousEventCheckedAt !== undefined && (
            <Empty text="No other competition on record for this team this season." />
          )}
          {team?.previousEvent && (
            <div className="flex flex-col gap-2 text-sm">
              <p className="font-medium">
                {team.previousEvent.name}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ended {team.previousEvent.endDate}
                </span>
              </p>
              <div className="flex flex-wrap gap-4">
                <div className="flex flex-col">
                  <span className="font-mono text-base font-semibold">
                    {team.previousEvent.qualRank !== undefined
                      ? `#${team.previousEvent.qualRank}${team.previousEvent.qualNumTeams ? ` / ${team.previousEvent.qualNumTeams}` : ""}`
                      : "Unavailable"}
                  </span>
                  <span className="text-xs text-muted-foreground">qual rank</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-mono text-base font-semibold">
                    {formatRecord(
                      team.previousEvent.qualWins !== undefined
                        ? {
                            wins: team.previousEvent.qualWins,
                            losses: team.previousEvent.qualLosses ?? 0,
                            ties: team.previousEvent.qualTies ?? 0,
                          }
                        : null,
                    ) ?? "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">qual record</span>
                </div>
                {team.previousEvent.allianceNumber !== undefined && (
                  <div className="flex flex-col">
                    <span className="font-mono text-base font-semibold">
                      Alliance {team.previousEvent.allianceNumber}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {team.previousEvent.alliancePick !== undefined
                        ? formatOrdinalPick(team.previousEvent.alliancePick)
                        : "selection"}
                    </span>
                  </div>
                )}
                {team.previousEvent.ace !== undefined && (
                  <div className="flex flex-col">
                    <span className="font-mono text-base font-semibold">{team.previousEvent.ace.toFixed(1)}</span>
                    <span className="text-xs text-muted-foreground">
                      ACE (Peekorobo)
                      {team.previousEvent.aceAutoRaw !== undefined && (
                        <>
                          {" "}
                          &middot; Auto {team.previousEvent.aceAutoRaw.toFixed(1)} &middot; Teleop{" "}
                          {team.previousEvent.aceTeleopRaw?.toFixed(1)} &middot; Endgame{" "}
                          {team.previousEvent.aceEndgameRaw?.toFixed(1)}
                        </>
                      )}
                    </span>
                  </div>
                )}
              </div>
              {formatPlayoffResult(team.previousEvent.playoffLevel, team.previousEvent.playoffStatus) && (
                <p className="text-muted-foreground">
                  {formatPlayoffResult(team.previousEvent.playoffLevel, team.previousEvent.playoffStatus)}
                  {team.previousEvent.playoffWins !== undefined && (
                    <>
                      {" "}
                      (playoff record{" "}
                      {formatRecord({
                        wins: team.previousEvent.playoffWins,
                        losses: team.previousEvent.playoffLosses ?? 0,
                        ties: team.previousEvent.playoffTies ?? 0,
                      })}
                      )
                    </>
                  )}
                </p>
              )}
            </div>
          )}
        </Section>

        <Separator />

        <Section title="AI analysis">
          {analyses === undefined && <Loading />}
          {analyses?.length === 0 && <Empty text="Not yet analyzed." />}
          {analyses && analyses.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-4 text-sm">
                <Stat
                  label="Avg auto pts"
                  value={average(analyses.map((a) => a.analysis.estimatedAutoFuelPoints))}
                />
                <Stat
                  label="Avg teleop pts"
                  value={average(analyses.map((a) => a.analysis.estimatedTeleopFuelPoints))}
                />
                <div className="flex flex-col">
                  <span className="font-mono text-base font-semibold">{avgClimbLabel}</span>
                  <span className="text-xs text-muted-foreground">avg climb (exact, from TBA)</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {analyses.map(({ analysis, match }) => (
                  <div key={analysis._id} className="rounded-md border border-border p-2.5 text-xs">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-foreground">
                        {match ? `${match.compLevel}${match.matchNumber}` : "Unknown match"}
                      </span>
                      <span className="text-muted-foreground">
                        Auto {analysis.estimatedAutoFuelPoints.toFixed(1)} · Teleop{" "}
                        {analysis.estimatedTeleopFuelPoints.toFixed(1)} ·{" "}
                        {CLIMB_LABEL[analysis.tbaClimbLevel]}
                      </span>
                      <ConfidenceBadge confidence={analysis.confidence} />
                    </div>
                    <p className="text-muted-foreground">{analysis.reasoning}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        <Separator />

        <Section title="Pit scouting" badge={pitReport?.isMockData ? <MockDataBadge /> : null}>
          {pitReport === undefined && <Loading />}
          {pitReport === null && <Empty text="Not yet pit scouted." />}
          {pitReport && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
              <Field label="Drivetrain" value={pitReport.drivetrain} />
              <Field label="Weight" value={pitReport.weightLbs ? `${pitReport.weightLbs} lb` : undefined} />
              <Field label="Vision" value={pitReport.visionSystem} />
              <Field
                label="Driver experience"
                value={pitReport.driverExperience ? `${pitReport.driverExperience} / 4` : undefined}
              />
              <Field
                label="Auto Level 1 claim"
                value={pitReport.claimsAutoLevel1 === undefined ? undefined : pitReport.claimsAutoLevel1 ? "Yes" : "No"}
              />
              <Field label="Start position" value={pitReport.preferredStartPosition} />
              <Field
                label="Claimed scoring"
                value={pitReport.claimedScoringAbility ? `${pitReport.claimedScoringAbility} / 5` : undefined}
              />
              <Field
                label="Claimed defense"
                value={pitReport.claimedDefensiveAbility ? `${pitReport.claimedDefensiveAbility} / 5` : undefined}
              />
              <Field label="Intake speed" value={pitReport.intakeSpeed} />
              <Field
                label="Max TOWER level"
                value={pitReport.claimedMaxTowerLevel !== undefined ? String(pitReport.claimedMaxTowerLevel) : undefined}
              />
              <Field label="Climb consistency" value={pitReport.climbConsistency} />
              {pitReport.notes && (
                <div className="col-span-full">
                  <span className="text-xs text-muted-foreground">Notes</span>
                  <p>{pitReport.notes}</p>
                </div>
              )}
            </div>
          )}
        </Section>

        <Separator />

        <Section title="Match reports">
          {matchReports === undefined && <Loading />}
          {matchReports?.length === 0 && <Empty text="No match reports submitted yet." />}
          <div className="flex flex-col gap-2">
            {matchReports?.map(({ report, match }) => (
              <div key={report._id} className="rounded-md border border-border p-2.5 text-xs">
                <p className="mb-1.5 flex items-center gap-2 font-mono font-semibold text-foreground">
                  {match ? `${match.compLevel}${match.matchNumber}` : "Unknown match"}
                  {report.isMockData && <MockDataBadge />}
                </p>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {Object.entries(report.sliders).map(([key, value]) => (
                    <div key={key} className="flex flex-col">
                      <span className="font-mono font-semibold text-foreground">{value} / 5</span>
                      <span className="text-muted-foreground">{SLIDER_LABELS[key] ?? key}</span>
                    </div>
                  ))}
                </div>
                {report.notes && <p className="mt-1.5 text-muted-foreground">{report.notes}</p>}
              </div>
            ))}
          </div>
        </Section>
      </DialogContent>
    </Dialog>
  )
}

function Section({
  title,
  badge,
  children,
}: {
  title: string
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {title}
        {badge}
      </h3>
      {children}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-base font-semibold">{value === null ? "—" : value.toFixed(1)}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  if (value === undefined) return null
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  )
}

function Loading() {
  return <p className="text-sm text-muted-foreground">Loading...</p>
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>
}
