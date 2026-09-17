"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { useRole } from "@/lib/use-role"
import { useScoutIdentity } from "@/lib/use-scout-identity"
import { useUiStore } from "@/lib/store/ui-store"
import { RequireScoutIdentity } from "@/components/require-scout-identity"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PickListBoard } from "@/components/pick-list/pick-list-board"
import { MergeTool } from "@/components/pick-list/merge-tool"
import { AllianceSimulator } from "@/components/pick-list/alliance-simulator"

export default function PickListPage() {
  const activeEvent = useQuery(api.events.getActiveEvent)
  const role = useRole()
  const pickListView = useUiStore((s) => s.pickListView)
  const setPickListView = useUiStore((s) => s.setPickListView)

  if (activeEvent === undefined || role === undefined) {
    return null
  }

  if (activeEvent === null) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Import an event first on the Event Setup page.
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-10">
      <div className="animate-stagger-in flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pick List</h1>
          <p className="text-sm text-muted-foreground">
            Drag teams between tiers to build your alliance-selection ranking.
          </p>
        </div>
        <MergeTool eventId={activeEvent._id} />
      </div>

      <Tabs
        value={pickListView}
        onValueChange={(value) => setPickListView(value as "primary" | "mine")}
        className="animate-stagger-in"
      >
        <TabsList>
          <TabsTrigger value="primary">Primary</TabsTrigger>
          <TabsTrigger value="mine">My list</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="animate-stagger-in">
        {pickListView === "primary" ? (
          <PickListBoard
            eventId={activeEvent._id}
            ownerId="primary"
            readOnly={role !== "admin"}
          />
        ) : (
          <RequireScoutIdentity>
            <MyListBoard eventId={activeEvent._id} />
          </RequireScoutIdentity>
        )}
      </div>

      <AllianceSimulator eventId={activeEvent._id} />
    </div>
  )
}

function MyListBoard({ eventId }: { eventId: Id<"events"> }) {
  const { scoutId } = useScoutIdentity()
  if (!scoutId) return null
  return <PickListBoard eventId={eventId} ownerId={scoutId} readOnly={false} />
}
