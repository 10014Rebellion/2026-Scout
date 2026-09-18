"use client"

import { useMemo, useState } from "react"
import { useQuery } from "convex/react"
import { CheckCircle2, CircleDashed, Download, Users } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { cn } from "@/lib/utils"
import { TIER_ORDER, TIER_LABELS, type PickListCard, type TierValue } from "@/components/pick-list/types"
import { TeamDetailDialog } from "@/components/team-detail-dialog"
import { Button } from "@/components/ui/button"

const TIER_BADGE_CLASS: Record<TierValue, string> = {
  Tier1: "bg-sidebar-primary/15 text-sidebar-primary",
  Tier2: "bg-primary/10 text-primary",
  Tier3: "bg-muted text-muted-foreground",
  DoNotPick: "bg-destructive/10 text-destructive",
  Uncategorized: "bg-muted text-muted-foreground",
}

export default function TeamsPage() {
  const activeEvent = useQuery(api.events.getActiveEvent)
  const board = useQuery(
    api.pickListEntries.boardForOwner,
    activeEvent ? { eventId: activeEvent._id, ownerId: "primary" } : "skip",
  )
  const matchReportCounts = useQuery(
    api.matchReports.countsForEvent,
    activeEvent ? { eventId: activeEvent._id } : "skip",
  )
  const [selectedTeamId, setSelectedTeamId] = useState<Id<"teams"> | null>(null)

  const allTeams = useMemo(() => {
    if (!board) return []
    return TIER_ORDER.flatMap((tier) => board[tier]).sort((a, b) => a.teamNumber - b.teamNumber)
  }, [board])

  const selectedTier = allTeams.find((t) => t.teamId === selectedTeamId)?.tier ?? "Uncategorized"

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 md:p-10">
      <div className="animate-stagger-in flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Users className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">Team List</h1>
            <p className="text-sm text-muted-foreground">
              Every team at the active event. Tap a team for pit, match, and AI analysis history.
            </p>
          </div>
        </div>
        {activeEvent && (
          <Button
            variant="outline"
            size="sm"
            render={
              <a href="/api/export">
                <Download className="size-4" />
                Export CSV
              </a>
            }
          />
        )}
      </div>

      {!activeEvent && (
        <div className="panel-depth animate-stagger-in rounded-lg border border-border p-4 text-sm text-muted-foreground">
          No active event yet. Import one from Event Setup first.
        </div>
      )}

      {activeEvent && board === undefined && (
        <p className="text-sm text-muted-foreground">Loading...</p>
      )}

      {activeEvent && allTeams.length === 0 && board !== undefined && (
        <p className="text-sm text-muted-foreground">No teams imported for this event yet.</p>
      )}

      <div className="animate-stagger-in grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {allTeams.map((card) => (
          <TeamCard
            key={card.teamId}
            card={card}
            matchReportCount={matchReportCounts?.[card.teamId] ?? 0}
            onClick={() => setSelectedTeamId(card.teamId)}
          />
        ))}
      </div>

      {selectedTeamId && (
        <TeamDetailDialog
          teamId={selectedTeamId}
          tier={selectedTier}
          onClose={() => setSelectedTeamId(null)}
        />
      )}
    </div>
  )
}

function TeamCard({
  card,
  matchReportCount,
  onClick,
}: {
  card: PickListCard
  matchReportCount: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="panel-depth flex flex-col gap-2 rounded-lg border border-border p-3 text-left transition-transform hover:-translate-y-0.5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-lg font-bold">{card.teamNumber}</span>
        {card.pitScouted ? (
          <CheckCircle2 className="size-4 shrink-0 text-muted-foreground" aria-label="Pit scouted" />
        ) : (
          <CircleDashed className="size-4 shrink-0 text-muted-foreground/50" aria-label="Not pit scouted" />
        )}
      </div>
      <p className="line-clamp-1 text-sm text-muted-foreground" title={card.nickname}>
        {card.nickname}
      </p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {matchReportCount} match {matchReportCount === 1 ? "report" : "reports"}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold",
            TIER_BADGE_CLASS[card.tier],
          )}
        >
          {TIER_LABELS[card.tier]}
        </span>
      </div>
    </button>
  )
}
