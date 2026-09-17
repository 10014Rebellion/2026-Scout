"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery, useMutation } from "convex/react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { useUiStore } from "@/lib/store/ui-store"
import { PickListColumn } from "./pick-list-column"
import { PickListCardTile } from "./pick-list-card"
import { TIER_ORDER, type BoardColumns, type OwnerId, type TierValue } from "./types"

const EMPTY_COLUMNS: BoardColumns = {
  Tier1: [],
  Tier2: [],
  Tier3: [],
  DoNotPick: [],
  Uncategorized: [],
}

function findColumnOfCard(columns: BoardColumns, cardId: string): TierValue | null {
  for (const tier of TIER_ORDER) {
    if (columns[tier].some((c) => c.teamId === cardId)) return tier
  }
  return null
}

export function PickListBoard({
  eventId,
  ownerId,
  readOnly,
}: {
  eventId: Id<"events">
  ownerId: OwnerId
  readOnly: boolean
}) {
  const boardData = useQuery(api.pickListEntries.boardForOwner, { eventId, ownerId })
  const moveCard = useMutation(api.pickListEntries.moveCard)

  const [columns, setColumns] = useState<BoardColumns>(EMPTY_COLUMNS)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const setDraggingTeamId = useUiStore((s) => s.setDraggingTeamId)

  // Mirrors the live Convex subscription into local state so an in-progress
  // drag isn't clobbered by a server update mid-gesture; syncs back once the
  // drag ends. Deliberate sync-on-external-change, not derivable state.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (boardData && !isDragging) {
      setColumns(boardData as BoardColumns)
    }
  }, [boardData, isDragging])
  /* eslint-enable react-hooks/set-state-in-effect */

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const activeCard = useMemo(() => {
    if (!activeId) return null
    for (const tier of TIER_ORDER) {
      const found = columns[tier].find((c) => c.teamId === activeId)
      if (found) return found
    }
    return null
  }, [activeId, columns])

  if (readOnly) {
    // Read-only boards never enter drag context; render a static grid instead.
    return (
      <div className="grid grid-cols-1 gap-4 overflow-x-auto pb-2 md:grid-cols-5">
        {TIER_ORDER.map((tier) => (
          <PickListColumn key={tier} tier={tier} cards={columns[tier]} readOnly />
        ))}
      </div>
    )
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
    setIsDragging(true)
    setDraggingTeamId(String(event.active.id))
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return
    const draggedId = String(active.id)
    const overId = String(over.id)
    if (draggedId === overId) return

    const sourceTier = findColumnOfCard(columns, draggedId)
    const targetTier = (TIER_ORDER as readonly string[]).includes(overId)
      ? (overId as TierValue)
      : findColumnOfCard(columns, overId)
    if (!sourceTier || !targetTier || sourceTier === targetTier) return

    setColumns((prev) => {
      const sourceCards = [...prev[sourceTier]]
      const cardIndex = sourceCards.findIndex((c) => c.teamId === draggedId)
      if (cardIndex === -1) return prev
      const [movedCard] = sourceCards.splice(cardIndex, 1)
      const targetCards = [...prev[targetTier]]
      const overIndex = targetCards.findIndex((c) => c.teamId === overId)
      const insertAt = overIndex === -1 ? targetCards.length : overIndex
      targetCards.splice(insertAt, 0, { ...movedCard, tier: targetTier })
      return { ...prev, [sourceTier]: sourceCards, [targetTier]: targetCards }
    })
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    setIsDragging(false)
    setDraggingTeamId(null)
    if (!over) return

    const activeCardId = String(active.id)
    const overId = String(over.id)

    const sourceTierBeforeDrag = findColumnOfCard(boardData as BoardColumns ?? EMPTY_COLUMNS, activeCardId)
    const finalTier = findColumnOfCard(columns, activeCardId)
    if (!finalTier) return

    let finalColumns = columns
    if (activeCardId !== overId) {
      const overTier = (TIER_ORDER as readonly string[]).includes(overId)
        ? (overId as TierValue)
        : findColumnOfCard(columns, overId)
      if (overTier === finalTier) {
        const cards = [...columns[finalTier]]
        const oldIndex = cards.findIndex((c) => c.teamId === activeCardId)
        const newIndex = cards.findIndex((c) => c.teamId === overId)
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const [moved] = cards.splice(oldIndex, 1)
          cards.splice(newIndex, 0, moved)
          finalColumns = { ...columns, [finalTier]: cards }
          setColumns(finalColumns)
        }
      }
    }

    const destOrderedTeamIds = finalColumns[finalTier].map((c) => c.teamId)
    const sourceTier =
      sourceTierBeforeDrag && sourceTierBeforeDrag !== finalTier ? sourceTierBeforeDrag : undefined
    const sourceOrderedTeamIds = sourceTier ? finalColumns[sourceTier].map((c) => c.teamId) : undefined

    try {
      await moveCard({
        ownerId,
        destTier: finalTier,
        destOrderedTeamIds,
        sourceTier,
        sourceOrderedTeamIds,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the move")
      if (boardData) setColumns(boardData as BoardColumns)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-5">
        {TIER_ORDER.map((tier) => (
          <PickListColumn key={tier} tier={tier} cards={columns[tier]} readOnly={false} />
        ))}
      </div>
      <DragOverlay>
        {activeCard ? <PickListCardTile card={activeCard} overlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}
