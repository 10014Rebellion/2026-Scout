"use client"

import { useMemo, useState } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TIER_LABELS, TIER_ORDER, type PickListCard, type TierValue } from "./types"

const TIER_SCORE: Record<TierValue, number> = {
  Tier1: 3,
  Tier2: 2,
  Tier3: 1,
  Uncategorized: 0,
  DoNotPick: -1,
}

export function AllianceSimulator({ eventId }: { eventId: Id<"events"> }) {
  const columns = useQuery(api.pickListEntries.boardForOwner, {
    eventId,
    ownerId: "primary",
  })

  const [captain1, setCaptain1] = useState<Id<"teams"> | null>(null)
  const [captain2, setCaptain2] = useState<Id<"teams"> | null>(null)

  const allTeams = useMemo(() => {
    if (!columns) return []
    return TIER_ORDER.flatMap((tier) => columns[tier]).sort(
      (a, b) => a.teamNumber - b.teamNumber,
    )
  }, [columns])

  // Base UI's Select shows a raw value string when closed unless given a
  // value->label map up front (it can't read SelectItem children, which
  // are unmounted while the popup is closed).
  const teamLabels = useMemo(
    () =>
      Object.fromEntries(
        allTeams.map((t) => [t.teamId, `${t.teamNumber} · ${t.nickname}`]),
      ),
    [allTeams],
  )

  const suggestions = useMemo(() => {
    if (!columns) return []
    const excluded = new Set(
      [captain1, captain2].filter((id): id is Id<"teams"> => Boolean(id)),
    )
    const pool: PickListCard[] = TIER_ORDER.flatMap((tier) => columns[tier]).filter(
      (c) => !excluded.has(c.teamId),
    )
    return pool
      .sort((a, b) => {
        const tierDiff = TIER_SCORE[b.tier] - TIER_SCORE[a.tier]
        if (tierDiff !== 0) return tierDiff
        const scoreA = a.avgEstimatedScore ?? -1
        const scoreB = b.avgEstimatedScore ?? -1
        if (scoreA !== scoreB) return scoreB - scoreA
        return a.teamNumber - b.teamNumber
      })
      .slice(0, 8)
  }, [columns, captain1, captain2])

  return (
    <div className="panel-depth animate-stagger-in flex flex-col gap-4 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-sm font-semibold">Alliance selection simulator</h2>
        <p className="text-xs text-muted-foreground">
          Low-stakes rehearsal: pick 1-2 captains and see who best completes
          the alliance, based on Primary list tier and AI-estimated scoring.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Captain 1</span>
          <Select items={teamLabels} value={captain1} onValueChange={(value) => setCaptain1(value)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Select team" />
            </SelectTrigger>
            <SelectContent>
              {allTeams
                .filter((t) => t.teamId !== captain2)
                .map((t) => (
                  <SelectItem key={t.teamId} value={t.teamId}>
                    {t.teamNumber} &middot; {t.nickname}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Captain 2 (optional)</span>
          <Select items={teamLabels} value={captain2} onValueChange={(value) => setCaptain2(value)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Select team" />
            </SelectTrigger>
            <SelectContent>
              {allTeams
                .filter((t) => t.teamId !== captain1)
                .map((t) => (
                  <SelectItem key={t.teamId} value={t.teamId}>
                    {t.teamNumber} &middot; {t.nickname}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {(captain1 || captain2) && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium text-muted-foreground">
            Best-fit suggestions
          </h3>
          {suggestions.length === 0 && (
            <p className="text-xs text-muted-foreground">No other teams available.</p>
          )}
          <div className="flex flex-col gap-1.5">
            {suggestions.map((s, i) => (
              <div
                key={s.teamId}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    #{i + 1}
                  </span>
                  <span className="font-mono font-semibold">{s.teamNumber}</span>
                  <span className="text-xs text-muted-foreground">{s.nickname}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-0.5">
                    {TIER_LABELS[s.tier]}
                  </span>
                  <span className="font-mono">
                    {s.avgEstimatedScore === null ? "—" : s.avgEstimatedScore.toFixed(1)} pts
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
