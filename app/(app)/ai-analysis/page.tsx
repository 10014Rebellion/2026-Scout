"use client"

import { useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { Sparkles, ChevronDown, RefreshCw } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { useRole } from "@/lib/use-role"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

type Confidence = "low" | "medium" | "high"

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
}

const CONFIDENCE_CLASS: Record<Confidence, string> = {
  high: "bg-primary/10 text-primary",
  medium: "bg-warning/20 text-warning-foreground",
  low: "bg-destructive/10 text-destructive",
}

const CLIMB_LABEL: Record<string, string> = {
  none: "No climb",
  level1: "Level 1",
  level2: "Level 2",
  level3: "Level 3",
}

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span
      className={cn(
        "w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        CONFIDENCE_CLASS[confidence],
      )}
    >
      {CONFIDENCE_LABEL[confidence]}
    </span>
  )
}

export default function AiAnalysisPage() {
  const role = useRole()
  const activeEvent = useQuery(api.events.getActiveEvent)
  const job = useQuery(api.aiAnalysis.getJobForEvent, activeEvent ? { eventId: activeEvent._id } : "skip")
  const teamSummaries = useQuery(
    api.aiAnalysis.listTeamSummaries,
    activeEvent ? { eventId: activeEvent._id } : "skip",
  )

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 md:p-10">
      <div className="animate-stagger-in flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Sparkles className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold">AI Analysis</h1>
          <p className="text-sm text-muted-foreground">
            Estimated per-robot FUEL scoring, reconciled from real TBA alliance totals and scout ratings.
          </p>
        </div>
      </div>

      {!activeEvent && (
        <div className="panel-depth animate-stagger-in rounded-lg border border-border p-4 text-sm text-muted-foreground">
          No active event yet. Import one from Event Setup first.
        </div>
      )}

      {activeEvent && role === "admin" && (
        <AdminControls eventId={activeEvent._id} job={job ?? null} />
      )}

      {activeEvent && (
        <div className="animate-stagger-in flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Team estimates</h2>
          {teamSummaries === undefined && (
            <p className="text-sm text-muted-foreground">Loading...</p>
          )}
          {teamSummaries?.length === 0 && (
            <p className="text-sm text-muted-foreground">No teams imported for this event yet.</p>
          )}
          <div className="flex flex-col gap-2">
            {teamSummaries?.map((row) => <TeamRow key={row.team._id} row={row} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function AdminControls({
  eventId,
  job,
}: {
  eventId: Id<"events">
  job: {
    status: "running" | "paused_backoff" | "completed" | "failed"
    totalMatches: number
    processedMatches: number
  } | null
}) {
  const syncScores = useAction(api.tbaScoreSync.syncEventScores)
  const startRun = useMutation(api.aiAnalysis.startAnalysisRun)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isStarting, setIsStarting] = useState(false)

  const isRunActive = job?.status === "running" || job?.status === "paused_backoff"

  async function handleSync() {
    setIsSyncing(true)
    try {
      const result = await syncScores({ eventId })
      toast.success(`Synced scores for ${result.matchesSynced} played match(es)`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "TBA score sync failed")
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleRunAnalysis() {
    setIsStarting(true)
    try {
      await startRun({ eventId })
      toast.success("Analysis started")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start analysis")
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <div className="panel-depth animate-stagger-in flex flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={handleSync} disabled={isSyncing}>
          <RefreshCw className={cn("size-4", isSyncing && "animate-spin")} />
          {isSyncing ? "Syncing scores..." : "Sync TBA scores"}
        </Button>
        <Button onClick={handleRunAnalysis} disabled={isStarting || isRunActive}>
          <Sparkles className="size-4" />
          {isRunActive ? "Analysis running..." : isStarting ? "Starting..." : "Run analysis"}
        </Button>
      </div>

      {job && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {job.status === "running" && "Processing matches..."}
              {job.status === "paused_backoff" && "Paused (rate limited), will resume automatically..."}
              {job.status === "completed" && "Last run completed"}
              {job.status === "failed" && "Last run failed"}
            </span>
            <span>
              {job.processedMatches} / {job.totalMatches} matches
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                job.status === "paused_backoff" ? "bg-warning" : "bg-primary",
              )}
              style={{
                width: `${job.totalMatches === 0 ? 0 : Math.round((job.processedMatches / job.totalMatches) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function TeamRow({
  row,
}: {
  row: {
    team: { _id: Id<"teams">; teamNumber: number; nickname: string }
    summary: { avgAutoFuelPoints: number; avgTeleopFuelPoints: number; matchesAnalyzed: number } | null
    dominantConfidence: Confidence | null
    matchesAnalyzed: number
  }
}) {
  const [expanded, setExpanded] = useState(false)
  const analyses = useQuery(
    api.aiAnalysis.listAnalysesForTeam,
    expanded ? { teamId: row.team._id } : "skip",
  )

  return (
    <div className="panel-depth rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold">{row.team.teamNumber}</span>
          <span className="text-sm">{row.team.nickname}</span>
        </div>
        <div className="flex items-center gap-3">
          {row.summary ? (
            <>
              <span className="text-xs text-muted-foreground">
                Auto <span className="font-mono font-semibold text-foreground">{row.summary.avgAutoFuelPoints.toFixed(1)}</span>
                {" · "}
                Teleop{" "}
                <span className="font-mono font-semibold text-foreground">
                  {row.summary.avgTeleopFuelPoints.toFixed(1)}
                </span>
              </span>
              {row.dominantConfidence && <ConfidenceBadge confidence={row.dominantConfidence} />}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Not yet analyzed</span>
          )}
          <ChevronDown className={cn("size-4 shrink-0 transition-transform", expanded && "rotate-180")} />
        </div>
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-border p-4">
          {analyses === undefined && <p className="text-sm text-muted-foreground">Loading...</p>}
          {analyses?.length === 0 && (
            <p className="text-sm text-muted-foreground">No per-match analysis yet for this team.</p>
          )}
          {analyses?.map(({ analysis, match }) => (
            <div key={analysis._id} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono font-semibold text-foreground">
                  {match ? `${match.compLevel}${match.matchNumber}` : "Unknown match"}
                </span>
                <span>
                  Auto {analysis.estimatedAutoFuelPoints.toFixed(1)} pts &middot; Teleop{" "}
                  {analysis.estimatedTeleopFuelPoints.toFixed(1)} pts
                </span>
                <span>{CLIMB_LABEL[analysis.tbaClimbLevel]}</span>
                <ConfidenceBadge confidence={analysis.confidence} />
              </div>
              <p className="text-sm text-muted-foreground">{analysis.reasoning}</p>
              <Separator />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
