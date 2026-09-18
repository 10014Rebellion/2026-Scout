import { cn } from "@/lib/utils"

export type Confidence = "low" | "medium" | "high"

export const CLIMB_LABEL: Record<string, string> = {
  none: "No climb",
  level1: "Level 1",
  level2: "Level 2",
  level3: "Level 3",
}

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

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
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
