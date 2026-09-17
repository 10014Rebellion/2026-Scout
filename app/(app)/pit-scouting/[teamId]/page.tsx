"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { ChevronLeft } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Doc, Id } from "@/convex/_generated/dataModel"
import { RequireScoutIdentity } from "@/components/require-scout-identity"
import { ScaleButtons } from "@/components/scale-buttons"
import { useScoutIdentity } from "@/lib/use-scout-identity"
import { enqueueSubmission } from "@/lib/offline-queue"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Drivetrain = "Swerve" | "Tank" | "X-Drive" | "Mecanum" | "Other"
type VisionSystem = "Limelight" | "PhotonVision" | "None" | "Other"
type StartPosition = "Left" | "Center" | "Right"
type IntakeSpeed = "Fast" | "Medium" | "Slow"
type ClimbConsistency = "consistent-multiple" | "consistent-once" | "inconsistent"

// Base UI's Select shows a raw value string when closed unless given a
// value->label map up front (it can't read SelectItem children, which
// are unmounted while the popup is closed) -- matters here since these
// values differ from their display text.
const CLIMB_CONSISTENCY_LABELS: Record<ClimbConsistency, string> = {
  "consistent-multiple": "Consistent, can climb multiple times",
  "consistent-once": "Consistent, once per match",
  inconsistent: "Inconsistent / unreliable",
}

interface FormState {
  weightLbs: string
  drivetrain: Drivetrain | ""
  drivetrainSpeedEstimate: string
  visionSystem: VisionSystem | ""
  hasPracticeFieldAccess: boolean
  driverExperience: number | undefined
  autoRoutineCount: string
  claimedAutoFuelCycles: string
  claimsAutoLevel1: boolean
  preferredStartPosition: StartPosition | ""
  claimedScoringAbility: number | undefined
  claimedDefensiveAbility: number | undefined
  claimedFeedAssistAbility: number | undefined
  maxFuelCapacity: string
  intakeSpeed: IntakeSpeed | ""
  hasFloorIntake: boolean
  hasHumanPlayerIntake: boolean
  intakeWidthInches: string
  claimedMaxTowerLevel: number | undefined
  climbConsistency: ClimbConsistency | ""
  notes: string
}

const EMPTY_FORM: FormState = {
  weightLbs: "",
  drivetrain: "",
  drivetrainSpeedEstimate: "",
  visionSystem: "",
  hasPracticeFieldAccess: false,
  driverExperience: undefined,
  autoRoutineCount: "",
  claimedAutoFuelCycles: "",
  claimsAutoLevel1: false,
  preferredStartPosition: "",
  claimedScoringAbility: undefined,
  claimedDefensiveAbility: undefined,
  claimedFeedAssistAbility: undefined,
  maxFuelCapacity: "",
  intakeSpeed: "",
  hasFloorIntake: false,
  hasHumanPlayerIntake: false,
  intakeWidthInches: "",
  claimedMaxTowerLevel: undefined,
  climbConsistency: "",
  notes: "",
}

export default function PitReportPage() {
  return (
    <RequireScoutIdentity>
      <PitReportForm />
    </RequireScoutIdentity>
  )
}

function toNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined
  const n = Number(value)
  return Number.isNaN(n) ? undefined : n
}

function buildFormState(existingReport: Doc<"pitReports"> | null): FormState {
  if (!existingReport) {
    return EMPTY_FORM
  }
  return {
    weightLbs: existingReport.weightLbs?.toString() ?? "",
    drivetrain: existingReport.drivetrain ?? "",
    drivetrainSpeedEstimate: existingReport.drivetrainSpeedEstimate ?? "",
    visionSystem: existingReport.visionSystem ?? "",
    hasPracticeFieldAccess: existingReport.hasPracticeFieldAccess ?? false,
    driverExperience: existingReport.driverExperience,
    autoRoutineCount: existingReport.autoRoutineCount?.toString() ?? "",
    claimedAutoFuelCycles: existingReport.claimedAutoFuelCycles?.toString() ?? "",
    claimsAutoLevel1: existingReport.claimsAutoLevel1 ?? false,
    preferredStartPosition: existingReport.preferredStartPosition ?? "",
    claimedScoringAbility: existingReport.claimedScoringAbility,
    claimedDefensiveAbility: existingReport.claimedDefensiveAbility,
    claimedFeedAssistAbility: existingReport.claimedFeedAssistAbility,
    maxFuelCapacity: existingReport.maxFuelCapacity?.toString() ?? "",
    intakeSpeed: existingReport.intakeSpeed ?? "",
    hasFloorIntake: existingReport.hasFloorIntake ?? false,
    hasHumanPlayerIntake: existingReport.hasHumanPlayerIntake ?? false,
    intakeWidthInches: existingReport.intakeWidthInches?.toString() ?? "",
    claimedMaxTowerLevel: existingReport.claimedMaxTowerLevel,
    climbConsistency: existingReport.climbConsistency ?? "",
    notes: existingReport.notes ?? "",
  }
}

function PitReportForm() {
  const params = useParams<{ teamId: string }>()
  const teamId = params.teamId as Id<"teams">

  const team = useQuery(api.teams.getById, { teamId })
  const existingReport = useQuery(api.pitReports.getByTeam, { teamId })

  if (team === undefined || existingReport === undefined) {
    return null
  }

  if (team === null) {
    return (
      <div className="mx-auto max-w-md p-6 text-center text-sm text-muted-foreground">
        Team not found.
      </div>
    )
  }

  return <PitReportEditor teamId={teamId} team={team} existingReport={existingReport} />
}

function PitReportEditor({
  teamId,
  team,
  existingReport,
}: {
  teamId: Id<"teams">
  team: Doc<"teams">
  existingReport: Doc<"pitReports"> | null
}) {
  const router = useRouter()
  const { scoutId, scoutName } = useScoutIdentity()
  const submitPitReport = useMutation(api.pitReports.submit)

  // Lazy initializer runs once on mount, when existingReport has already
  // resolved (the parent gates rendering on that) -- no effect/sync needed
  // to hydrate an edit-in-progress form from a prior submission.
  const [form, setForm] = useState<FormState>(() => buildFormState(existingReport))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const teamNumber = team.teamNumber

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!scoutId) return
    setIsSubmitting(true)

    const payload = {
      teamId,
      scoutId,
      weightLbs: toNumber(form.weightLbs),
      drivetrain: form.drivetrain || undefined,
      drivetrainSpeedEstimate: form.drivetrainSpeedEstimate.trim() || undefined,
      visionSystem: form.visionSystem || undefined,
      hasPracticeFieldAccess: form.hasPracticeFieldAccess,
      driverExperience: form.driverExperience,
      autoRoutineCount: toNumber(form.autoRoutineCount),
      claimedAutoFuelCycles: toNumber(form.claimedAutoFuelCycles),
      claimsAutoLevel1: form.claimsAutoLevel1,
      preferredStartPosition: form.preferredStartPosition || undefined,
      claimedScoringAbility: form.claimedScoringAbility,
      claimedDefensiveAbility: form.claimedDefensiveAbility,
      claimedFeedAssistAbility: form.claimedFeedAssistAbility,
      maxFuelCapacity: toNumber(form.maxFuelCapacity),
      intakeSpeed: form.intakeSpeed || undefined,
      hasFloorIntake: form.hasFloorIntake,
      hasHumanPlayerIntake: form.hasHumanPlayerIntake,
      intakeWidthInches: toNumber(form.intakeWidthInches),
      claimedMaxTowerLevel: form.claimedMaxTowerLevel,
      climbConsistency: form.climbConsistency || undefined,
      notes: form.notes.trim() || undefined,
      submittedAt: Date.now(),
    } as const

    try {
      if (!navigator.onLine) {
        throw new Error("offline")
      }
      await submitPitReport(payload)
      toast.success(`Pit report saved for team ${teamNumber}`)
      router.push("/pit-scouting")
    } catch {
      // Deliberately not navigating away here: a client-side route
      // transition needs a network round-trip Next.js hasn't cached, and
      // attempting one while offline can hard-fail to the browser's own
      // offline page even though the report itself is already safely
      // queued in localStorage. Leaving the scout on the form (with the
      // persistent offline banner now showing) is the safer failure mode.
      enqueueSubmission({ kind: "pitReport", payload })
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
          onClick={() => router.push("/pit-scouting")}
          aria-label="Back to pit scouting"
        >
          <ChevronLeft />
        </Button>
        <div>
          <h1 className="font-mono text-2xl font-bold">{team.teamNumber}</h1>
          <p className="text-sm text-muted-foreground">{team.nickname}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        <Section title="General Robot Info">
          <Field label="Robot weight (lbs)" htmlFor="weightLbs">
            <Input
              id="weightLbs"
              inputMode="decimal"
              placeholder="e.g. 120"
              value={form.weightLbs}
              onChange={(e) => setForm((f) => ({ ...f, weightLbs: e.target.value }))}
            />
          </Field>
          <Field label="Drivetrain type" htmlFor="drivetrain">
            <Select
              value={form.drivetrain}
              onValueChange={(v) => setForm((f) => ({ ...f, drivetrain: v as Drivetrain }))}
            >
              <SelectTrigger id="drivetrain" className="w-full">
                <SelectValue placeholder="Select drivetrain" />
              </SelectTrigger>
              <SelectContent>
                {(["Swerve", "Tank", "X-Drive", "Mecanum", "Other"] as const).map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Estimated top speed"
            htmlFor="drivetrainSpeedEstimate"
            hint="Whatever unit is easiest to eyeball, e.g. 'fast' or '14 ft/s'"
          >
            <Input
              id="drivetrainSpeedEstimate"
              placeholder="e.g. 14 ft/s"
              value={form.drivetrainSpeedEstimate}
              onChange={(e) =>
                setForm((f) => ({ ...f, drivetrainSpeedEstimate: e.target.value }))
              }
            />
          </Field>
          <Field label="Vision system" htmlFor="visionSystem">
            <Select
              value={form.visionSystem}
              onValueChange={(v) => setForm((f) => ({ ...f, visionSystem: v as VisionSystem }))}
            >
              <SelectTrigger id="visionSystem" className="w-full">
                <SelectValue placeholder="Select vision system" />
              </SelectTrigger>
              <SelectContent>
                {(["Limelight", "PhotonVision", "None", "Other"] as const).map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <CheckboxField
            label="Has access to a practice field"
            checked={form.hasPracticeFieldAccess}
            onChange={(checked) => setForm((f) => ({ ...f, hasPracticeFieldAccess: checked }))}
          />
        </Section>

        <Section title="Driver & Autonomous">
          <Field label="Driver experience (years/seasons)">
            <ScaleButtons
              ariaLabel="Driver experience (years/seasons)"
              min={1}
              max={4}
              value={form.driverExperience}
              onChange={(v) => setForm((f) => ({ ...f, driverExperience: v }))}
            />
          </Field>
          <Field label="Number of distinct auto routines" htmlFor="autoRoutineCount">
            <Input
              id="autoRoutineCount"
              inputMode="numeric"
              placeholder="e.g. 2"
              value={form.autoRoutineCount}
              onChange={(e) => setForm((f) => ({ ...f, autoRoutineCount: e.target.value }))}
            />
          </Field>
          <Field label="Claimed FUEL cycles scored during auto" htmlFor="claimedAutoFuelCycles">
            <Input
              id="claimedAutoFuelCycles"
              inputMode="numeric"
              placeholder="e.g. 3"
              value={form.claimedAutoFuelCycles}
              onChange={(e) =>
                setForm((f) => ({ ...f, claimedAutoFuelCycles: e.target.value }))
              }
            />
          </Field>
          <CheckboxField
            label="Claims to reach Level 1 during auto"
            checked={form.claimsAutoLevel1}
            onChange={(checked) => setForm((f) => ({ ...f, claimsAutoLevel1: checked }))}
          />
          <Field label="Preferred starting position" htmlFor="preferredStartPosition">
            <Select
              value={form.preferredStartPosition}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, preferredStartPosition: v as StartPosition }))
              }
            >
              <SelectTrigger id="preferredStartPosition" className="w-full">
                <SelectValue placeholder="Select starting position" />
              </SelectTrigger>
              <SelectContent>
                {(["Left", "Center", "Right"] as const).map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </Section>

        <Section title="FUEL Handling">
          <Field label="Claimed scoring ability" hint="1 = weak, 5 = excellent">
            <ScaleButtons
              ariaLabel="Claimed scoring ability"
              min={1}
              max={5}
              value={form.claimedScoringAbility}
              onChange={(v) => setForm((f) => ({ ...f, claimedScoringAbility: v }))}
            />
          </Field>
          <Field label="Claimed defensive ability" hint="1 = weak, 5 = excellent">
            <ScaleButtons
              ariaLabel="Claimed defensive ability"
              min={1}
              max={5}
              value={form.claimedDefensiveAbility}
              onChange={(v) => setForm((f) => ({ ...f, claimedDefensiveAbility: v }))}
            />
          </Field>
          <Field label="Claimed feeding/assist ability" hint="1 = weak, 5 = excellent">
            <ScaleButtons
              ariaLabel="Claimed feeding/assist ability"
              min={1}
              max={5}
              value={form.claimedFeedAssistAbility}
              onChange={(v) => setForm((f) => ({ ...f, claimedFeedAssistAbility: v }))}
            />
          </Field>
          <Field label="Max FUEL capacity (pieces held at once)" htmlFor="maxFuelCapacity">
            <Input
              id="maxFuelCapacity"
              inputMode="numeric"
              placeholder="e.g. 5"
              value={form.maxFuelCapacity}
              onChange={(e) => setForm((f) => ({ ...f, maxFuelCapacity: e.target.value }))}
            />
          </Field>
          <Field label="Intake speed" htmlFor="intakeSpeed">
            <Select
              value={form.intakeSpeed}
              onValueChange={(v) => setForm((f) => ({ ...f, intakeSpeed: v as IntakeSpeed }))}
            >
              <SelectTrigger id="intakeSpeed" className="w-full">
                <SelectValue placeholder="Select intake speed" />
              </SelectTrigger>
              <SelectContent>
                {(["Fast", "Medium", "Slow"] as const).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <CheckboxField
            label="Has a floor intake"
            checked={form.hasFloorIntake}
            onChange={(checked) => setForm((f) => ({ ...f, hasFloorIntake: checked }))}
          />
          <CheckboxField
            label="Has a human player station intake"
            checked={form.hasHumanPlayerIntake}
            onChange={(checked) => setForm((f) => ({ ...f, hasHumanPlayerIntake: checked }))}
          />
          <Field label="Intake width (inches)" htmlFor="intakeWidthInches">
            <Input
              id="intakeWidthInches"
              inputMode="decimal"
              placeholder="e.g. 24"
              value={form.intakeWidthInches}
              onChange={(e) => setForm((f) => ({ ...f, intakeWidthInches: e.target.value }))}
            />
          </Field>
        </Section>

        <Section title="Climbing">
          <Field label="Claimed max TOWER level" hint="0 = does not climb, 3 = highest level">
            <ScaleButtons
              ariaLabel="Claimed max TOWER level"
              min={0}
              max={3}
              value={form.claimedMaxTowerLevel}
              onChange={(v) => setForm((f) => ({ ...f, claimedMaxTowerLevel: v }))}
            />
          </Field>
          <Field label="Climb consistency" htmlFor="climbConsistency">
            <Select
              items={CLIMB_CONSISTENCY_LABELS}
              value={form.climbConsistency}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, climbConsistency: v as ClimbConsistency }))
              }
            >
              <SelectTrigger id="climbConsistency" className="w-full">
                <SelectValue placeholder="Select consistency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="consistent-multiple">
                  Consistent, can climb multiple times
                </SelectItem>
                <SelectItem value="consistent-once">Consistent, once per match</SelectItem>
                <SelectItem value="inconsistent">Inconsistent / unreliable</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </Section>

        <Section title="Notes">
          <Textarea
            aria-label="Notes"
            placeholder="Anything else worth remembering about this robot or team..."
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={4}
          />
        </Section>

        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card p-4 md:sticky md:bottom-4 md:mx-0 md:rounded-lg md:border">
          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || !scoutId}>
            {isSubmitting ? "Saving..." : `Submit pit report${scoutName ? ` as ${scoutName}` : ""}`}
          </Button>
        </div>
      </form>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="animate-stagger-in panel-depth flex flex-col gap-4 rounded-lg border border-border p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {hint && <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  )
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm font-medium">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      {label}
    </label>
  )
}
