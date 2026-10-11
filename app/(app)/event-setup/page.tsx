"use client"

import { useRef, useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { parseTeamsCsv, parseMatchesCsv } from "@/lib/manual-import"
import { RequireAdmin } from "@/components/require-admin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

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
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6 md:p-10">
      <div className="animate-stagger-in">
        <h1 className="text-2xl font-bold">Event Setup</h1>
        <p className="text-muted-foreground text-sm">
          Import teams and matches (qual + playoff) from The Blue Alliance.
        </p>
      </div>

      {activeEvent && (
        <div className="panel-depth animate-stagger-in rounded-lg border border-border p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            {activeEvent.name}
            {activeEvent.isManual && (
              <span className="rounded-full bg-warning px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning-foreground">
                Manual, not TBA-verified
              </span>
            )}
            {activeEvent.source === "frcapi" && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                FIRST API
              </span>
            )}
          </p>
          <p className="font-mono text-muted-foreground">
            {activeEvent.tbaEventKey} &middot;{" "}
            {activeEvent.imported ? "Imported" : "Not imported"}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
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

      <Separator />
      <FrcApiPanel activeEvent={activeEvent ?? null} />

      <Separator />
      <ManualImportPanel activeEvent={activeEvent ?? null} />

      {activeEvent && (
        <>
          <Separator />
          <MockDataControls eventId={activeEvent._id} />
        </>
      )}
    </div>
  )
}

function FrcApiPanel({
  activeEvent,
}: {
  activeEvent: { _id: Id<"events">; tbaEventKey: string; source?: "tba" | "frcapi" } | null
}) {
  const importEvent = useAction(api.frcApi.importEvent)
  const syncScores = useAction(api.frcApi.syncEventScores)
  const syncRankings = useAction(api.frcApi.syncEventRankings)

  const [season, setSeason] = useState(String(new Date().getFullYear()))
  const [eventCode, setEventCode] = useState("")
  const [isImporting, setIsImporting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  // frcapi-<season>-<CODE> -- parse the code back out so sync actions (keyed
  // by event code, not eventId) work on reload without asking the admin to
  // retype it.
  const activeFrcCode =
    activeEvent?.source === "frcapi" ? activeEvent.tbaEventKey.split("-").slice(2).join("-") : null
  const activeFrcSeason =
    activeEvent?.source === "frcapi" ? Number(activeEvent.tbaEventKey.split("-")[1]) : null

  async function handleImport(event: React.FormEvent) {
    event.preventDefault()
    setIsImporting(true)
    try {
      const result = await importEvent({ season: Number(season), eventCode: eventCode.trim() })
      toast.success(`Imported ${result.teamCount} teams and ${result.matchCount} qualification matches`)
      setEventCode("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed")
    } finally {
      setIsImporting(false)
    }
  }

  async function handleSyncScores() {
    if (!activeFrcCode || !activeFrcSeason) return
    setIsSyncing(true)
    try {
      const result = await syncScores({ season: activeFrcSeason, eventCode: activeFrcCode })
      toast.success(`Synced scores for ${result.matchesSynced} played match(es)`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Score sync failed")
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleSyncRankings() {
    if (!activeFrcCode || !activeFrcSeason) return
    setIsSyncing(true)
    try {
      const result = await syncRankings({
        eventId: activeEvent!._id,
        season: activeFrcSeason,
        eventCode: activeFrcCode,
      })
      toast.success(`Updated rankings for ${result.updated} team(s)`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ranking sync failed")
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <details className="animate-stagger-in flex flex-col gap-4 rounded-lg border border-border p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        Import from FIRST API (TBA alternative)
      </summary>
      <p className="-mt-2 text-xs text-muted-foreground">
        Uses the official FIRST FRC Events API instead of TBA. This API is noticeably
        slower (can take a few minutes per request) &mdash; expect the buttons below to
        sit on &ldquo;Importing&hellip;&rdquo;/&ldquo;Syncing&hellip;&rdquo; for a
        while, that&rsquo;s normal.
      </p>

      <form onSubmit={handleImport} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="frcSeason">Season</Label>
          <Input
            id="frcSeason"
            className="w-24"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="frcEventCode">Event code</Label>
          <Input
            id="frcEventCode"
            placeholder="e.g. ALHU"
            value={eventCode}
            onChange={(e) => setEventCode(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={isImporting || eventCode.trim().length === 0}>
          {isImporting ? "Importing..." : "Import event"}
        </Button>
      </form>

      {activeFrcCode && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Active event is FIRST-API-sourced ({activeFrcCode}, {activeFrcSeason}).
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleSyncScores} disabled={isSyncing}>
              {isSyncing ? "Syncing..." : "Sync FIRST API scores"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleSyncRankings} disabled={isSyncing}>
              {isSyncing ? "Syncing..." : "Sync FIRST API rankings"}
            </Button>
          </div>
        </div>
      )}
    </details>
  )
}

function ManualImportPanel({
  activeEvent,
}: {
  activeEvent: { _id: Id<"events">; name: string; isManual?: boolean } | null
}) {
  const createManualEvent = useMutation(api.manualImport.createManualEvent)
  const [name, setName] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setIsCreating(true)
    try {
      await createManualEvent({ name: name.trim(), startDate, endDate })
      toast.success(`Created "${name.trim()}" -- now the active event`)
      setName("")
      setStartDate("")
      setEndDate("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create event")
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <details className="animate-stagger-in flex flex-col gap-4 rounded-lg border border-border p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        Manual import (when TBA is down)
      </summary>
      <p className="-mt-2 text-xs text-muted-foreground">
        Hand-enter a team list and qualification schedule (e.g. transcribed from a
        paper schedule) so scouting can start without TBA. Once TBA is back, reconcile
        the event below to backfill real rankings, ACE, and AI analysis without losing
        any scouting data already collected.
      </p>

      <form onSubmit={handleCreate} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="manualEventName">Event name</Label>
          <Input
            id="manualEventName"
            placeholder="e.g. Rocket City Regional"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="manualStartDate">Start</Label>
          <Input id="manualStartDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="manualEndDate">End</Label>
          <Input id="manualEndDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <Button
          type="submit"
          variant="secondary"
          disabled={isCreating || name.trim().length === 0 || !startDate || !endDate}
        >
          {isCreating ? "Creating..." : "Create manual event"}
        </Button>
      </form>

      {activeEvent && (
        <>
          <Separator />
          <CsvImportBox
            title="Import team list"
            columnsHint="teamNumber,nickname,city,stateProv,country (city/stateProv/country optional)"
            eventId={activeEvent._id}
            parse={parseTeamsCsv}
            mutationRef={api.manualImport.importManualTeams}
            buildArgs={(eventId, teams) => ({ eventId, teams })}
          />
          <CsvImportBox
            title="Import match schedule"
            columnsHint="matchNumber,red1,red2,red3,blue1,blue2,blue3,scheduledTime (scheduledTime optional)"
            eventId={activeEvent._id}
            parse={parseMatchesCsv}
            mutationRef={api.manualImport.importManualMatches}
            buildArgs={(eventId, matches) => ({ eventId, matches })}
          />
        </>
      )}

      {activeEvent?.isManual && (
        <>
          <Separator />
          <ReconcilePanel eventId={activeEvent._id} />
        </>
      )}
    </details>
  )
}

function CsvImportBox<Row>({
  title,
  columnsHint,
  eventId,
  parse,
  mutationRef,
  buildArgs,
}: {
  title: string
  columnsHint: string
  eventId: Id<"events">
  parse: (text: string) => Row[]
  mutationRef: Parameters<typeof useMutation>[0]
  buildArgs: (eventId: Id<"events">, rows: Row[]) => Record<string, unknown>
}) {
  const runImport = useMutation(mutationRef)
  const [csvText, setCsvText] = useState("")
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setCsvText(await file.text())
    event.target.value = ""
  }

  async function handleImport() {
    let rows: Row[]
    try {
      rows = parse(csvText)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't parse that CSV")
      return
    }
    if (rows.length === 0) {
      toast.error("No rows found -- check the CSV has a header row plus at least one data row")
      return
    }
    setIsImporting(true)
    try {
      const result = (await runImport(buildArgs(eventId, rows) as never)) as {
        inserted: number
        updated: number
      }
      toast.success(`${result.inserted} added, ${result.updated} updated`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed")
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="font-mono text-[11px] text-muted-foreground">{columnsHint}</p>
      </div>
      <Textarea
        placeholder="Paste CSV here, or upload a file below"
        value={csvText}
        onChange={(e) => setCsvText(e.target.value)}
        className="min-h-24 font-mono text-xs"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
          Upload .csv file
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleImport}
          disabled={isImporting || csvText.trim().length === 0}
        >
          {isImporting ? "Importing..." : "Import"}
        </Button>
      </div>
    </div>
  )
}

function ReconcilePanel({ eventId }: { eventId: Id<"events"> }) {
  const reconcile = useAction(api.manualImport.reconcileWithTba)
  const [tbaEventKey, setTbaEventKey] = useState("")
  const [isReconciling, setIsReconciling] = useState(false)

  async function handleReconcile() {
    setIsReconciling(true)
    try {
      const result = await reconcile({ eventId, tbaEventKey: tbaEventKey.trim() })
      toast.success(
        `Reconciled with TBA: ${result.teamCount} teams, ${result.matchCount} matches. Existing scouting data was preserved.`,
      )
      setTbaEventKey("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reconciliation failed")
    } finally {
      setIsReconciling(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-medium">Reconcile with TBA</h3>
        <p className="text-xs text-muted-foreground">
          TBA is back? Enter the real event key to upgrade this event in place -- fills
          in real team keys, rankings, ACE, and unlocks AI analysis, without touching
          any pit/match reports already collected.
        </p>
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="e.g. 2026nvlv"
          value={tbaEventKey}
          onChange={(e) => setTbaEventKey(e.target.value)}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={handleReconcile}
          disabled={isReconciling || tbaEventKey.trim().length === 0}
        >
          {isReconciling ? "Reconciling..." : "Reconcile"}
        </Button>
      </div>

      <ReconcileWithFrcApiPanel eventId={eventId} />
    </div>
  )
}

function ReconcileWithFrcApiPanel({ eventId }: { eventId: Id<"events"> }) {
  const reconcile = useAction(api.frcApi.reconcileWithFrcApi)
  const [season, setSeason] = useState(String(new Date().getFullYear()))
  const [eventCode, setEventCode] = useState("")
  const [isReconciling, setIsReconciling] = useState(false)

  async function handleReconcile() {
    setIsReconciling(true)
    try {
      const result = await reconcile({ eventId, season: Number(season), eventCode: eventCode.trim() })
      toast.success(
        `Reconciled with FIRST API: ${result.teamCount} teams, ${result.matchCount} matches. Existing scouting data was preserved.`,
      )
      setEventCode("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reconciliation failed")
    } finally {
      setIsReconciling(false)
    }
  }

  return (
    <div className="mt-1 flex flex-col gap-2 border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">
        Or reconcile with the official FIRST API instead (can take a few minutes):
      </p>
      <div className="flex gap-2">
        <Input className="w-20" value={season} onChange={(e) => setSeason(e.target.value)} />
        <Input
          placeholder="Event code, e.g. TXMCK1"
          value={eventCode}
          onChange={(e) => setEventCode(e.target.value)}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={handleReconcile}
          disabled={isReconciling || eventCode.trim().length === 0}
        >
          {isReconciling ? "Reconciling..." : "Reconcile"}
        </Button>
      </div>
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
