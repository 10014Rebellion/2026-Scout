"use client"

import { useState } from "react"
import { useAction, useQuery } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { RequireAdmin } from "@/components/require-admin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

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
        `Imported ${result.teamCount} teams and ${result.matchCount} qualification matches`,
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
          Import teams and qualification matches from The Blue Alliance.
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
    </div>
  )
}
