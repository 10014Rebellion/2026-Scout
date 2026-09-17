"use client"

import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { cn } from "cn"
import { PickListCardTile } from "./pick-list-card"
import { TIER_LABELS, type PickListCard, type TierValue } from "./types"

const TIER_ACCENT: Record<TierValue, string> = {
  Tier1: "border-t-accent",
  Tier2: "border-t-primary/60",
  Tier3: "border-t-border",
  DoNotPick: "border-t-destructive/60",
  Uncategorized: "border-t-border",
}

export function PickListColumn({
  tier,
  cards,
  readOnly,
}: {
  tier: TierValue
  cards: PickListCard[]
  readOnly: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: tier, disabled: readOnly })

  return (
    <div className="flex w-64 shrink-0 flex-col gap-2 md:w-full">
      <div
        className={cn(
          "flex items-center justify-between border-t-2 px-1 pt-1.5",
          TIER_ACCENT[tier],
        )}
      >
        <h3 className="text-sm font-semibold">{TIER_LABELS[tier]}</h3>
        <span className="font-mono text-xs text-muted-foreground">{cards.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 rounded-lg p-1.5 transition-colors",
          isOver && !readOnly && "bg-accent/15",
        )}
      >
        <SortableContext
          items={cards.map((c) => c.teamId)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((card) => (
            <PickListCardTile key={card.teamId} card={card} readOnly={readOnly} />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <p className="p-2 text-center text-xs text-muted-foreground/60">Drop here</p>
        )}
      </div>
    </div>
  )
}
