"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import { CheckCircle2, FlagTriangleRight } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { RequireScoutIdentity } from "@/components/require-scout-identity"
import { useScoutIdentity } from "@/lib/use-scout-identity"
import { cn } from "@/lib/utils"

export default function MatchScoutingPage() {
  return (
    <RequireScoutIdentity>
      <MatchScoutingDashboard />
    </RequireScoutIdentity>
  )
}

function matchLabel(compLevel: string, matchNumber: number) {
  const prefix = compLevel === "qm" ? "Qual" : compLevel.toUpperCase()
  return `${prefix} ${matchNumber}`
}

function MatchScoutingDashboard() {
  const { scoutId, scoutName } = useScoutIdentity()
  const items = useQuery(
    api.matchReports.dashboardForScout,
    scoutId ? { scoutId } : "skip",
  )

  if (items === undefined) {
    return null
  }

  const upcoming = items.filter((item) => !item.hasReport)
  const completed = items.filter((item) => item.hasReport)

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <div className="animate-stagger-in flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Match Scouting</h1>
        <p className="text-sm text-muted-foreground">
          {scoutName ? `${scoutName}'s assigned teams` : "Your assigned teams"} &middot;{" "}
          {completed.length}/{items.length} reports submitted
        </p>
      </div>

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          You have no assigned teams yet. Ask an admin to assign you a team on
          the Scout Assignment page.
        </p>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Upcoming
        </h2>
        {upcoming.length === 0 && (
          <p className="text-sm text-muted-foreground">No matches waiting on a report.</p>
        )}
        <div className="flex flex-col gap-2">
          {upcoming.map((item, index) => (
            <MatchCard key={`${item.match._id}-${item.team._id}`} item={item} index={index} />
          ))}
        </div>
      </div>

      {completed.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Completed
          </h2>
          <div className="flex flex-col gap-2">
            {completed.map((item, index) => (
              <MatchCard key={`${item.match._id}-${item.team._id}`} item={item} index={index} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MatchCard({
  item,
  index,
}: {
  item: {
    match: { _id: string; compLevel: string; matchNumber: number; hasBeenPlayed: boolean }
    team: { _id: string; teamNumber: number }
    alliance: string
    hasReport: boolean
    positionLabel: string | null
  }
  index: number
}) {
  const isReady = item.match.hasBeenPlayed || item.hasReport
  const content = (
    <div
      className={cn(
        "panel-depth flex min-h-16 items-center justify-between gap-3 rounded-lg border border-border p-4",
        isReady && "active:scale-[0.98]",
        !isReady && "opacity-60",
      )}
    >
      <div className="flex items-center gap-3">
        <FlagTriangleRight
          className={cn(
            "size-5 shrink-0",
            item.alliance === "red" ? "text-destructive" : "text-chart-4",
          )}
        />
        <div>
          <p className="font-medium">{matchLabel(item.match.compLevel, item.match.matchNumber)}</p>
          <p className="font-mono text-sm text-muted-foreground">
            {item.positionLabel ? (
              <>
                {item.positionLabel} &middot; scout Team {item.team.teamNumber}
              </>
            ) : (
              <>
                Team {item.team.teamNumber} &middot; {item.alliance}
              </>
            )}
          </p>
        </div>
      </div>
      {item.hasReport ? (
        <CheckCircle2 className="size-5 shrink-0 text-primary" />
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">
          {isReady ? "Ready to report" : "Not yet played"}
        </span>
      )}
    </div>
  )

  return (
    <div className="animate-stagger-in" style={{ animationDelay: `${Math.min(index, 20) * 25}ms` }}>
      {isReady ? (
        <Link href={`/match-scouting/${item.match._id}/${item.team._id}`}>{content}</Link>
      ) : (
        content
      )}
    </div>
  )
}
