"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { CheckCircle2, CircleDashed } from "lucide-react"
import { cn } from "cn"
import type { PickListCard } from "./types"

function formatNumber(n: number | null, digits = 1) {
  return n === null ? "—" : n.toFixed(digits)
}

function formatRecord(record: PickListCard["record"]) {
  if (!record) return "—"
  return `${record.wins}-${record.losses}${record.ties > 0 ? `-${record.ties}` : ""}`
}

export function PickListCardTile({
  card,
  overlay = false,
  readOnly = false,
}: {
  card: PickListCard
  overlay?: boolean
  readOnly?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.teamId, disabled: readOnly })

  const style = overlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition,
      }

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={style}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      className={cn(
        "panel-depth flex touch-none flex-col gap-1.5 rounded-lg border border-border p-2.5 text-left transition-shadow",
        isDragging && !overlay && "opacity-30",
        overlay && "scale-105 rotate-1 cursor-grabbing shadow-2xl ring-2 ring-ring/50",
        !overlay && !readOnly && "cursor-grab active:cursor-grabbing",
        !overlay && readOnly && "cursor-default",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 font-mono text-base font-bold leading-none">
          {card.teamNumber}
          {card.hasMockData && (
            <span
              className="rounded-full bg-warning px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase leading-none tracking-wide text-warning-foreground"
              title="This team has mock/test scouting data"
            >
              Test
            </span>
          )}
        </span>
        {card.pitScouted ? (
          <CheckCircle2 className="size-3.5 shrink-0 text-muted-foreground" aria-label="Pit scouted" />
        ) : (
          <CircleDashed className="size-3.5 shrink-0 text-muted-foreground/50" aria-label="Not pit scouted" />
        )}
      </div>
      <p className="line-clamp-1 text-xs text-muted-foreground" title={card.nickname}>
        {card.nickname}
      </p>
      <div className="mt-1 grid grid-cols-3 gap-1 text-center text-[0.65rem] text-muted-foreground">
        <div className="flex flex-col">
          <span className="font-mono font-medium text-foreground">
            {formatNumber(card.avgDriverRating)}
          </span>
          <span>driver</span>
        </div>
        <div className="flex flex-col">
          <span className="font-mono font-medium text-foreground">
            {formatNumber(card.avgEstimatedScore)}
          </span>
          <span>est pts</span>
        </div>
        <div className="flex flex-col">
          <span className="font-mono font-medium text-foreground">
            {formatRecord(card.record)}
          </span>
          <span>record</span>
        </div>
      </div>
    </div>
  )
}
