"use client"

import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { cn } from "@/lib/utils"
import { RequireAdmin } from "@/components/require-admin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function ScoutAssignmentPage() {
  return (
    <RequireAdmin>
      <ScoutAssignmentContent />
    </RequireAdmin>
  )
}

function ScoutAssignmentContent() {
  const activeEvent = useQuery(api.events.getActiveEvent)
  const scouts = useQuery(api.scouts.list)
  const assignments = useQuery(
    api.scoutAssignments.listForEvent,
    activeEvent ? { eventId: activeEvent._id } : "skip",
  )
  const positionAssignments = useQuery(
    api.scoutPositionAssignments.listForEvent,
    activeEvent ? { eventId: activeEvent._id } : "skip",
  )
  const addScout = useMutation(api.scouts.add)
  const removeScout = useMutation(api.scouts.remove)
  const rebalance = useMutation(api.scoutAssignments.rebalance)
  const reassignTeam = useMutation(api.scoutAssignments.reassignTeam)
  const assignPosition = useMutation(api.scoutPositionAssignments.assignPosition)

  const [newScoutName, setNewScoutName] = useState("")
  const [isRebalancing, setIsRebalancing] = useState(false)

  // Base UI's Select shows a raw value string when closed unless given a
  // value->label map up front (it can't read SelectItem children, which
  // are unmounted while the popup is closed).
  const scoutLabels = Object.fromEntries(
    (scouts ?? []).map((scout) => [scout._id, scout.name]),
  )

  async function handleAddScout(event: React.FormEvent) {
    event.preventDefault()
    if (newScoutName.trim().length === 0) return
    await addScout({ name: newScoutName.trim() })
    setNewScoutName("")
  }

  async function handleRebalance() {
    if (!activeEvent) return
    setIsRebalancing(true)
    try {
      await rebalance({ eventId: activeEvent._id })
      toast.success("Assignments rebalanced")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rebalance failed")
    } finally {
      setIsRebalancing(false)
    }
  }

  if (!activeEvent) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Import an event first on the Event Setup page.
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6 md:p-10">
      <div className="animate-stagger-in">
        <h1 className="text-2xl font-bold">Scout Assignment</h1>
        <p className="text-sm text-muted-foreground">
          Each scout permanently owns a set of teams and watches every
          qualification match those teams play.
        </p>
      </div>

      <div className="panel-depth animate-stagger-in flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="text-sm font-medium">Scouts</h2>
        <form onSubmit={handleAddScout} className="flex gap-2">
          <Input
            placeholder="Scout name"
            value={newScoutName}
            onChange={(event) => setNewScoutName(event.target.value)}
          />
          <Button type="submit" disabled={newScoutName.trim().length === 0}>
            Add
          </Button>
        </form>
        <div className="flex flex-wrap gap-2">
          {scouts?.map((scout) => (
            <span
              key={scout._id}
              className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
            >
              {scout.name}
              <button
                type="button"
                aria-label={`Remove ${scout.name}`}
                className="text-muted-foreground hover:text-foreground"
                onClick={() => removeScout({ scoutId: scout._id })}
              >
                &times;
              </button>
            </span>
          ))}
          {scouts?.length === 0 && (
            <p className="text-sm text-muted-foreground">No scouts yet.</p>
          )}
        </div>
      </div>

      <div className="panel-depth animate-stagger-in flex flex-col gap-3 rounded-lg border border-border p-4">
        <div>
          <h2 className="text-sm font-medium">Position assignments (classical scouting)</h2>
          <p className="text-xs text-muted-foreground">
            An alternative to assigning specific teams: a scout permanently owns a field
            position (e.g. Red 2) for the whole event, and gets told which team occupies
            that seat fresh for each match. Use this instead of team assignments, or leave
            unused if you&rsquo;re assigning by team.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {positionAssignments?.map((row) => (
            <div
              key={`${row.alliance}-${row.position}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <span
                className={cn(
                  "font-mono text-sm font-medium",
                  row.alliance === "red" ? "text-destructive" : "text-primary",
                )}
              >
                {row.label}
              </span>
              <Select
                items={scoutLabels}
                value={row.scoutId ?? undefined}
                onValueChange={(scoutId) =>
                  assignPosition({
                    eventId: activeEvent._id,
                    alliance: row.alliance,
                    position: row.position,
                    scoutId: scoutId as Id<"scouts">,
                  })
                }
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  {scouts?.map((scout) => (
                    <SelectItem key={scout._id} value={scout._id}>
                      {scout.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      <Button
        onClick={handleRebalance}
        disabled={isRebalancing || !scouts || scouts.length === 0}
        variant="secondary"
      >
        {isRebalancing ? "Rebalancing..." : "Rebalance all teams evenly"}
      </Button>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Team assignments</h2>
        {assignments?.map((row) => (
          <div
            key={row.team._id}
            className="panel-depth flex items-center justify-between gap-3 rounded-lg border border-border p-3"
          >
            <div>
              <p className="font-mono text-sm font-medium">{row.team.teamNumber}</p>
              <p className="text-xs text-muted-foreground">{row.team.nickname}</p>
            </div>
            <Select
              items={scoutLabels}
              value={row.scoutId ?? undefined}
              onValueChange={(scoutId) =>
                reassignTeam({
                  teamId: row.team._id,
                  scoutId: scoutId as Id<"scouts">,
                })
              }
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                {scouts?.map((scout) => (
                  <SelectItem key={scout._id} value={scout._id}>
                    {scout.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  )
}
