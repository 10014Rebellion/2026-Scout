"use client"

import { useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { RequireAdmin } from "@/components/require-admin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

export default function EventSetupPage() {
  return (
    <RequireAdmin>
      <EventSetupForm />
    </RequireAdmin>
  )
}

function EventSetupForm() {
  const activeEvent = useQuery(api.events.getActiveEvent)
  const importEvent = useAction(api.tbaImport.importEvent)
  const [tbaEventKey, setTbaEventKey] = useState("")
  const [isImporting, setIsImporting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setIsImporting(true)
    try {
      const result = await importEvent({ tbaEventKey: tbaEventKey.trim() })
      toast.success(
        `Imported ${result.teamCount} teams and ${result.matchCount} matches (qual + playoff)`,
      )
      setTbaEventKey("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed")
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-6 md:p-10">
      <div className="animate-stagger-in">
        <h1 className="text-2xl font-bold">Event Setup</h1>
        <p className="text-muted-foreground text-sm">
          Import teams and matches (qual + playoff) from The Blue Alliance.
        </p>
      </div>

      {activeEvent && (
        <div className="panel-depth animate-stagger-in rounded-lg border border-border p-4 text-sm">
          <p className="font-medium">{activeEvent.name}</p>
          <p className="font-mono text-muted-foreground">
            {activeEvent.tbaEventKey} &middot;{" "}
            {activeEvent.imported ? "Imported" : "Not imported"}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="tbaEventKey">TBA event key</Label>
          <Input
            id="tbaEventKey"
            placeholder="e.g. 2026nvlv"
            value={tbaEventKey}
            onChange={(event) => setTbaEventKey(event.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={isImporting || tbaEventKey.trim().length === 0}>
          {isImporting ? "Importing..." : "Import event"}
        </Button>
      </form>

      {activeEvent && (
        <>
          <Separator />
          <MockDataControls eventId={activeEvent._id} />
        </>
      )}
    </div>
  )
}

function MockDataControls({ eventId }: { eventId: Id<"events"> }) {
  const status = useQuery(api.mockData.statusForEvent, { eventId })
  const generate = useMutation(api.mockData.generateForActiveEvent)
  const clear = useMutation(api.mockData.clearForEvent)
  const [isBusy, setIsBusy] = useState(false)

  async function handleGenerate() {
    setIsBusy(true)
    try {
      const result = await generate({ eventId })
      toast.success(
        result.seeded > 0
          ? `Seeded mock pit + match reports for ${result.seeded} team(s)`
          : "No teams seeded -- every team already has a report, or no matches are imported yet",
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate mock data")
    } finally {
      setIsBusy(false)
    }
  }

  async function handleClear() {
    setIsBusy(true)
    try {
      const result = await clear({ eventId })
      toast.success(`Removed ${result.deleted} mock report(s)`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to clear mock data")
    } finally {
      setIsBusy(false)
    }
  }

  const hasMockData = status && (status.mockPitReports > 0 || status.mockMatchReports > 0)

  return (
    <div className="animate-stagger-in flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold">Test data</h2>
        <p className="text-xs text-muted-foreground">
          Seeds one pit report and one match report each for up to 10 teams in the
          active event, so you can test the full workflow without real scouting
          data. Clearly labeled as test data everywhere it shows up, and never
          overwrites a real report.
        </p>
      </div>
      {status && (
        <p className="font-mono text-xs text-muted-foreground">
          Currently seeded: {status.mockPitReports} pit report(s), {status.mockMatchReports} match report(s)
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={handleGenerate} disabled={isBusy}>
          Generate mock test data
        </Button>
        <Button type="button" variant="outline" onClick={handleClear} disabled={isBusy || !hasMockData}>
          Clear mock test data
        </Button>
      </div>
    </div>
  )
}
