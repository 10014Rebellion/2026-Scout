import { Id } from "@/convex/_generated/dataModel"
import { useUiStore } from "@/lib/store/ui-store"

// localStorage (not IndexedDB) is deliberate here: payloads are a handful
// of small objects, never binary, and localStorage is synchronous, so the
// "is anything queued?" count can be read straight into the UI store
// without an async round-trip.
const STORAGE_KEY = "scout-offline-queue-v1"

export type PitReportSubmission = {
  teamId: Id<"teams">
  scoutId: Id<"scouts">
  weightLbs?: number
  drivetrain?: "Swerve" | "Tank" | "X-Drive" | "Mecanum" | "Other"
  drivetrainSpeedEstimate?: string
  visionSystem?: "Limelight" | "PhotonVision" | "None" | "Other"
  hasPracticeFieldAccess?: boolean
  driverExperience?: number
  autoRoutineCount?: number
  claimedAutoFuelCycles?: number
  claimsAutoLevel1?: boolean
  preferredStartPosition?: "Left" | "Center" | "Right"
  claimedScoringAbility?: number
  claimedDefensiveAbility?: number
  claimedFeedAssistAbility?: number
  maxFuelCapacity?: number
  intakeSpeed?: "Fast" | "Medium" | "Slow"
  hasFloorIntake?: boolean
  hasHumanPlayerIntake?: boolean
  intakeWidthInches?: number
  claimedMaxTowerLevel?: number
  climbConsistency?: "consistent-multiple" | "consistent-once" | "inconsistent"
  notes?: string
  submittedAt: number
}

export type MatchReportSubmission = {
  matchId: Id<"matches">
  teamId: Id<"teams">
  scoutId: Id<"scouts">
  sliders: {
    teleopScoring: number
    autoScoring: number
    defense: number
    reliability: number
    strategy: number
    driverSkill: number
    confidence: number
  }
  rationale: {
    teleopScoring: string
    autoScoring: string
    defense: string
    reliability: string
    strategy: string
    driverSkill: string
    confidence: string
  }
  notes?: string
  submittedAt: number
}

export type QueuedItem =
  | { id: string; kind: "pitReport"; payload: PitReportSubmission }
  | { id: string; kind: "matchReport"; payload: MatchReportSubmission }

function readQueue(): QueuedItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as QueuedItem[]) : []
  } catch {
    return []
  }
}

function writeQueue(queue: QueuedItem[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  } catch {
    // Storage unavailable/full -- nothing more we can do client-side.
  }
  useUiStore.getState().setQueuedCount(queue.length)
}

export function enqueueSubmission(item: Omit<QueuedItem, "id">) {
  const queue = readQueue()
  queue.push({ ...item, id: crypto.randomUUID() } as QueuedItem)
  writeQueue(queue)
}

export function peekQueue(): QueuedItem[] {
  return readQueue()
}

export function removeFromQueue(id: string) {
  writeQueue(readQueue().filter((item) => item.id !== id))
}

export function refreshQueuedCount() {
  useUiStore.getState().setQueuedCount(readQueue().length)
}
