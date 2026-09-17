"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { ChevronLeft } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Doc, Id } from "@/convex/_generated/dataModel"
import { RequireScoutIdentity } from "@/components/require-scout-identity"
import { MatchSliderField } from "@/components/match-slider-field"
import { useScoutIdentity } from "@/lib/use-scout-identity"
import { enqueueSubmission, type MatchReportSubmission } from "@/lib/offline-queue"
import { SLIDER_ORDER } from "@/lib/match-report-scale"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

type Sliders = MatchReportSubmission["sliders"]
type Rationale = MatchReportSubmission["rationale"]

const DEFAULT_SLIDERS: Sliders = {
  teleopScoring: 3,
  autoScoring: 3,
  defense: 3,
  reliability: 3,
  strategy: 3,
  driverSkill: 3,
  confidence: 3,
}

const EMPTY_RATIONALE: Rationale = {
  teleopScoring: "",
  autoScoring: "",
  defense: "",
  reliability: "",
  strategy: "",
  driverSkill: "",
  confidence: "",
}

export default function MatchReportPage() {
  return (
    <RequireScoutIdentity>
      <MatchReportForm />
    </RequireScoutIdentity>
  )
}

function MatchReportForm() {
  const params = useParams<{ matchId: string; teamId: string }>()
  const matchId = params.matchId as Id<"matches">
  const teamId = params.teamId as Id<"teams">

  const match = useQuery(api.matches.getById, { matchId })
  const team = useQuery(api.teams.getById, { teamId })
  const existingReport = useQuery(api.matchReports.getByMatchTeam, { matchId, teamId })

  if (match === undefined || team === undefined || existingReport === undefined) {
    return null
  }

  if (match === null || team === null) {
    return (
      <div className="mx-auto max-w-md p-6 text-center text-sm text-muted-foreground">
        Match or team not found.
      </div>
    )
  }

  return (
    <MatchReportEditor
      matchId={matchId}
      teamId={teamId}
      match={match}
      team={team}
      existingReport={existingReport}
    />
  )
}

function MatchReportEditor({
  matchId,
  teamId,
  match,
  team,
  existingReport,
}: {
  matchId: Id<"matches">
  teamId: Id<"teams">
  match: Doc<"matches">
  team: Doc<"teams">
  existingReport: Doc<"matchReports"> | null
}) {
  const router = useRouter()
  const { scoutId, scoutName } = useScoutIdentity()
  const submitMatchReport = useMutation(api.matchReports.submit)

  // Lazy initializers run once on mount, after the parent has already
  // resolved existingReport -- no effect/sync needed to hydrate an
  // edit-in-progress form from a prior submission.
  const [sliders, setSliders] = useState<Sliders>(() => existingReport?.sliders ?? DEFAULT_SLIDERS)
  const [rationale, setRationale] = useState<Rationale>(
    () => existingReport?.rationale ?? EMPTY_RATIONALE,
  )
  const [notes, setNotes] = useState(() => existingReport?.notes ?? "")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const alliance = match.redTeamNumbers.includes(team.teamNumber) ? "red" : "blue"
  const teamNumber = team.teamNumber

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!scoutId) return
    setIsSubmitting(true)

    const payload: MatchReportSubmission = {
      matchId,
      teamId,
      scoutId,
      sliders,
      rationale,
      notes: notes.trim() || undefined,
      submittedAt: Date.now(),
    }

    try {
      if (!navigator.onLine) {
        throw new Error("offline")
      }
      await submitMatchReport(payload)
      toast.success(`Match report saved for team ${teamNumber}`)
      router.push("/match-scouting")
    } catch {
      // Deliberately not navigating away here: a client-side route
      // transition needs a network round-trip Next.js hasn't cached, and
      // attempting one while offline can hard-fail to the browser's own
      // offline page even though the report itself is already safely
      // queued in localStorage. Leaving the scout on the form (with the
      // persistent offline banner now showing) is the safer failure mode.
      enqueueSubmission({ kind: "matchReport", payload })
      toast.warning("No connection -- report saved on this device and will sync automatically")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 pb-24 md:p-8">
      <div className="animate-stagger-in flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => router.push("/match-scouting")}
          aria-label="Back to match scouting"
        >
          <ChevronLeft />
        </Button>
        <div>
          <h1 className="text-xl font-bold">
            {match.compLevel === "qm" ? "Qual" : match.compLevel.toUpperCase()}{" "}
            {match.matchNumber}
          </h1>
          <p className="font-mono text-sm text-muted-foreground">
            Team {team.teamNumber} &middot; {team.nickname} &middot; {alliance}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {SLIDER_ORDER.map((key, index) => (
          <div
            key={key}
            className="animate-stagger-in panel-depth rounded-lg border border-border p-4"
            style={{ animationDelay: `${index * 30}ms` }}
          >
            <MatchSliderField
              sliderKey={key}
              value={sliders[key]}
              onValueChange={(value) => setSliders((s) => ({ ...s, [key]: value }))}
              rationale={rationale[key]}
              onRationaleChange={(value) => setRationale((r) => ({ ...r, [key]: value }))}
            />
          </div>
        ))}

        <div className="animate-stagger-in panel-depth flex flex-col gap-2 rounded-lg border border-border p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Notes
          </h2>
          <Textarea
            aria-label="Notes"
            placeholder="General pattern observations -- anything the sliders above didn't capture..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
          />
        </div>

        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card p-4 md:sticky md:bottom-4 md:mx-0 md:rounded-lg md:border">
          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || !scoutId}>
            {isSubmitting ? "Saving..." : `Submit match report${scoutName ? ` as ${scoutName}` : ""}`}
          </Button>
        </div>
      </form>
    </div>
  )
}
