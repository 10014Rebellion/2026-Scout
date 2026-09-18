import { Id } from "@/convex/_generated/dataModel"

export const TIER_ORDER = [
  "Tier1",
  "Tier2",
  "Tier3",
  "DoNotPick",
  "Uncategorized",
] as const

export type TierValue = (typeof TIER_ORDER)[number]

export const TIER_LABELS: Record<TierValue, string> = {
  Tier1: "Tier 1",
  Tier2: "Tier 2",
  Tier3: "Tier 3",
  DoNotPick: "Do Not Pick",
  Uncategorized: "Uncategorized",
}

export interface PickListCard {
  teamId: Id<"teams">
  teamNumber: number
  nickname: string
  tier: TierValue
  position: number
  hasEntry: boolean
  pitScouted: boolean
  hasMockData: boolean
  avgDriverRating: number | null
  avgEstimatedScore: number | null
  record: { wins: number; losses: number; ties: number } | null
  previousEventAce: number | undefined
}

export type BoardColumns = Record<TierValue, PickListCard[]>

export type OwnerId = Id<"scouts"> | "primary"
