"use client"

import { useMemo, useState } from "react"
import { useAction, useQuery } from "convex/react"
import { toast } from "sonner"
import { CheckCircle2, CircleDashed, Download, RefreshCw, Users } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Doc, Id } from "@/convex/_generated/dataModel"
import { cn } from "@/lib/utils"
import { useRole } from "@/lib/use-role"
import { formatRecord } from "@/lib/format-team-status"
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
  const role = useRole()
  const activeEvent = useQuery(api.events.getActiveEvent)
  const board = useQuery(
    api.pickListEntries.boardForOwner,
    activeEvent ? { eventId: activeEvent._id, ownerId: "primary" } : "skip",
  )
  const teams = useQuery(
    api.teams.listByEvent,
    activeEvent ? { eventId: activeEvent._id } : "skip",
  )
  const matchReportCounts = useQuery(
    api.matchReports.countsForEvent,
    activeEvent ? { eventId: activeEvent._id } : "skip",
  )
  const [selectedTeamId, setSelectedTeamId] = useState<Id<"teams"> | null>(null)

  const cardsByTeamId = useMemo(() => {
    if (!board) return new Map<string, PickListCard>()
    const map = new Map<string, PickListCard>()
    for (const tier of TIER_ORDER) {
      for (const card of board[tier]) map.set(card.teamId, card)
    }
    return map
  }, [board])

  const allTeams = useMemo(() => {
    if (!teams) return []
    return [...teams].sort((a, b) => a.teamNumber - b.teamNumber)
  }, [teams])

  const selectedTier = selectedTeamId ? cardsByTeamId.get(selectedTeamId)?.tier ?? "Uncategorized" : "Uncategorized"
  const isLoading = activeEvent !== undefined && activeEvent !== null && (teams === undefined || board === undefined)

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

      {activeEvent && role === "admin" && <AdminSyncControls eventId={activeEvent._id} />}

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {activeEvent && allTeams.length === 0 && !isLoading && (
        <p className="text-sm text-muted-foreground">No teams imported for this event yet.</p>
      )}

      <div className="animate-stagger-in grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {allTeams.map((team) => (
          <TeamCard
            key={team._id}
            team={team}
            card={cardsByTeamId.get(team._id) ?? null}
            matchReportCount={matchReportCounts?.[team._id] ?? 0}
            onClick={() => setSelectedTeamId(team._id)}
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

function AdminSyncControls({ eventId }: { eventId: Id<"events"> }) {
  const syncRankings = useAction(api.tbaImport.syncEventRankings)
  const syncPreviousEvent = useAction(api.tbaPreviousEvent.syncPreviousEventInfo)
  const [isSyncingRankings, setIsSyncingRankings] = useState(false)
  const [isSyncingPrevious, setIsSyncingPrevious] = useState(false)

  async function handleSyncRankings() {
    setIsSyncingRankings(true)
    try {
      const result = await syncRankings({ eventId })
      toast.success(`Updated rankings for ${result.updated} team(s)`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ranking sync failed")
    } finally {
      setIsSyncingRankings(false)
    }
  }

  async function handleSyncPreviousEvent() {
    setIsSyncingPrevious(true)
    try {
      const result = await syncPreviousEvent({ eventId })
      toast.success(
        `Found a prior competition for ${result.withPreviousEvent} of ${result.updated} team(s)` +
          (result.failed > 0 ? ` (${result.failed} lookup failure(s))` : ""),
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Previous-event sync failed")
    } finally {
      setIsSyncingPrevious(false)
    }
  }

  return (
    <div className="animate-stagger-in flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={handleSyncRankings} disabled={isSyncingRankings}>
        <RefreshCw className={cn("size-3.5", isSyncingRankings && "animate-spin")} />
        {isSyncingRankings ? "Syncing rankings..." : "Sync current rankings"}
      </Button>
      <Button variant="outline" size="sm" onClick={handleSyncPreviousEvent} disabled={isSyncingPrevious}>
        <RefreshCw className={cn("size-3.5", isSyncingPrevious && "animate-spin")} />
        {isSyncingPrevious ? "Syncing prior events..." : "Sync previous-event data"}
      </Button>
    </div>
  )
}

function TeamCard({
  team,
  card,
  matchReportCount,
  onClick,
}: {
  team: Doc<"teams">
  card: PickListCard | null
  matchReportCount: number
  onClick: () => void
}) {
  const tier = card?.tier ?? "Uncategorized"
  const location = [team.city, team.stateProv].filter(Boolean).join(", ")
  const currentRecord = formatRecord(
    team.qualWins !== undefined
      ? { wins: team.qualWins, losses: team.qualLosses ?? 0, ties: team.qualTies ?? 0 }
      : null,
  )
  const prev = team.previousEvent

  return (
    <button
      type="button"
      onClick={onClick}
      className="panel-depth flex flex-col gap-1.5 rounded-lg border border-border p-3 text-left transition-transform hover:-translate-y-0.5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 font-mono text-lg font-bold">
          {team.teamNumber}
          {card?.hasMockData && (
            <span className="rounded-full bg-warning px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase leading-none tracking-wide text-warning-foreground">
              Test
            </span>
          )}
        </span>
        {card?.pitScouted ? (
          <CheckCircle2 className="size-4 shrink-0 text-muted-foreground" aria-label="Pit scouted" />
        ) : (
          <CircleDashed className="size-4 shrink-0 text-muted-foreground/50" aria-label="Not pit scouted" />
        )}
      </div>
      <p className="line-clamp-1 text-sm text-muted-foreground" title={team.nickname}>
        {team.nickname}
      </p>
      {location && <p className="line-clamp-1 text-[0.7rem] text-muted-foreground/70">{location}</p>}

      <div className="mt-0.5 flex items-center gap-3 text-xs">
        <div className="flex flex-col">
          <span className="font-mono font-semibold text-foreground">
            {team.qualRank !== undefined ? `#${team.qualRank}${team.qualNumTeams ? `/${team.qualNumTeams}` : ""}` : "—"}
          </span>
          <span className="text-[0.65rem] text-muted-foreground">rank</span>
        </div>
        <div className="flex flex-col">
          <span className="font-mono font-semibold text-foreground">{currentRecord ?? "—"}</span>
          <span className="text-[0.65rem] text-muted-foreground">record</span>
        </div>
      </div>

      <p className="line-clamp-1 text-[0.7rem] text-muted-foreground/80">
        {prev
          ? `Prev: ${prev.name}${prev.qualRank !== undefined ? ` — Rank ${prev.qualRank}${prev.qualNumTeams ? `/${prev.qualNumTeams}` : ""}` : ""}`
          : team.previousEventCheckedAt !== undefined
            ? "No prior event this season"
            : "Prior event: not yet checked"}
      </p>

      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {matchReportCount} match {matchReportCount === 1 ? "report" : "reports"}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold",
            TIER_BADGE_CLASS[tier],
          )}
        >
          {TIER_LABELS[tier]}
        </span>
      </div>
    </button>
  )
}
