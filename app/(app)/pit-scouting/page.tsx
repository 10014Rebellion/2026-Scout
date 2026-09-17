"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import { CheckCircle2, Circle, Wrench } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { RequireScoutIdentity } from "@/components/require-scout-identity"

export default function PitScoutingPage() {
  return (
    <RequireScoutIdentity>
      <PitScoutingGrid />
    </RequireScoutIdentity>
  )
}

function PitScoutingGrid() {
  const activeEvent = useQuery(api.events.getActiveEvent)
  const statuses = useQuery(
    api.pitReports.listStatusForEvent,
    activeEvent ? { eventId: activeEvent._id } : "skip",
  )

  if (activeEvent === undefined) {
    return null
  }

  if (activeEvent === null) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center">
        <Wrench className="size-8 text-muted-foreground" />
        <h1 className="text-xl font-bold">No active event</h1>
        <p className="text-sm text-muted-foreground">
          Ask an admin to import an event on the Event Setup page before pit
          scouting can start.
        </p>
      </div>
    )
  }

  const scoutedCount = statuses?.filter((s) => s.isScouted).length ?? 0

  return (
    <div className="flex flex-col gap-4 p-4 md:p-8">
      <div className="animate-stagger-in flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Pit Scouting</h1>
        <p className="text-sm text-muted-foreground">
          {activeEvent.name} &middot; {scoutedCount}/{statuses?.length ?? 0} teams scouted
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {statuses?.map((status, index) => (
          <Link
            key={status.teamId}
            href={`/pit-scouting/${status.teamId}`}
            className="animate-stagger-in panel-depth flex min-h-28 flex-col justify-between gap-2 rounded-lg border border-border p-4 transition-transform active:scale-95"
            style={{ animationDelay: `${Math.min(index, 20) * 25}ms` }}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-2xl font-bold">{status.teamNumber}</span>
              {status.isScouted ? (
                <CheckCircle2 className="size-5 shrink-0 text-primary" />
              ) : (
                <Circle className="size-5 shrink-0 text-muted-foreground/40" />
              )}
            </div>
            <span className="line-clamp-2 text-sm text-muted-foreground">
              {status.nickname}
            </span>
          </Link>
        ))}
      </div>

      {statuses?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No teams imported for this event yet.
        </p>
      )}
    </div>
  )
}
