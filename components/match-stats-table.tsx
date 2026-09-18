"use client"

import { useMemo, useState } from "react"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { cn } from "@/lib/utils"
import { CLIMB_LABEL, type Confidence } from "@/components/confidence-badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type AllianceFilter = "all" | "red" | "blue"
type RoundFilter = "all" | "qual" | "playoff"
type SortKey = "match" | "team" | "alliance" | "result"
type SortDir = "asc" | "desc"

const ALLIANCE_ITEMS = { all: "All alliances", red: "Red", blue: "Blue" }
const ROUND_ITEMS = { all: "All rounds", qual: "Qualification", playoff: "Playoff" }

const SLIDER_COLUMNS: { key: keyof NonNullable<MatchStatRow["sliders"]>; label: string }[] = [
  { key: "autoScoring", label: "Au" },
  { key: "teleopScoring", label: "Te" },
  { key: "defense", label: "Def" },
  { key: "reliability", label: "Rel" },
  { key: "strategy", label: "Str" },
  { key: "driverSkill", label: "Drv" },
  { key: "confidence", label: "Cf" },
]

type MatchStatRow = FunctionReturnType<typeof api.matchStats.listForEvent>[number]

function matchLabel(row: MatchStatRow) {
  if (row.compLevel === "qm") return `Q${row.matchNumber}`
  const level = row.compLevel.toUpperCase()
  return row.setNumber > 1 || row.compLevel !== "f" ? `${level}${row.setNumber}-${row.matchNumber}` : `${level}${row.matchNumber}`
}

function resultLabel(result: MatchStatRow["result"]) {
  if (result === "win") return "W"
  if (result === "loss") return "L"
  if (result === "tie") return "T"
  return "—"
}

function resultClass(result: MatchStatRow["result"]) {
  if (result === "win") return "text-primary font-semibold"
  if (result === "loss") return "text-destructive font-semibold"
  return "text-muted-foreground"
}

export function MatchStatsTable({ eventId }: { eventId: Id<"events"> }) {
  const rows = useQuery(api.matchStats.listForEvent, { eventId })
  const [teamFilter, setTeamFilter] = useState("")
  const [matchSearch, setMatchSearch] = useState("")
  const [allianceFilter, setAllianceFilter] = useState<AllianceFilter>("all")
  const [roundFilter, setRoundFilter] = useState<RoundFilter>("all")
  const [sortKey, setSortKey] = useState<SortKey>("match")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const filtered = useMemo(() => {
    if (!rows) return []
    const trimmedTeam = teamFilter.trim()
    const trimmedMatch = matchSearch.trim().toLowerCase().replace(/\s+/g, "")
    let result = rows.filter((row) => {
      if (trimmedTeam && !String(row.teamNumber).includes(trimmedTeam)) return false
      if (trimmedMatch && !matchLabel(row).toLowerCase().replace(/\s+/g, "").includes(trimmedMatch)) return false
      if (allianceFilter !== "all" && row.alliance !== allianceFilter) return false
      if (roundFilter === "qual" && row.compLevel !== "qm") return false
      if (roundFilter === "playoff" && row.compLevel === "qm") return false
      return true
    })

    const dir = sortDir === "asc" ? 1 : -1
    result = [...result].sort((a, b) => {
      switch (sortKey) {
        case "team":
          return (a.teamNumber - b.teamNumber) * dir
        case "alliance":
          return a.alliance.localeCompare(b.alliance) * dir
        case "result":
          return (a.result ?? "").localeCompare(b.result ?? "") * dir
        case "match":
        default:
          return 0 // rows already arrive in match order from the server
      }
    })
    if (sortKey === "match" && sortDir === "desc") result.reverse()

    return result
  }, [rows, teamFilter, matchSearch, allianceFilter, roundFilter, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  if (rows === undefined) {
    return <p className="text-sm text-muted-foreground">Loading...</p>
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No matches imported for this event yet.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search match (e.g. Q12, SF1)"
          value={matchSearch}
          onChange={(e) => setMatchSearch(e.target.value)}
          className="h-8 w-48"
        />
        <Input
          placeholder="Filter by team #"
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="h-8 w-36"
        />
        <Select
          items={ALLIANCE_ITEMS}
          value={allianceFilter}
          onValueChange={(v) => setAllianceFilter(v as AllianceFilter)}
        >
          <SelectTrigger size="sm" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All alliances</SelectItem>
            <SelectItem value="red">Red</SelectItem>
            <SelectItem value="blue">Blue</SelectItem>
          </SelectContent>
        </Select>
        <Select
          items={ROUND_ITEMS}
          value={roundFilter}
          onValueChange={(v) => setRoundFilter(v as RoundFilter)}
        >
          <SelectTrigger size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All rounds</SelectItem>
            <SelectItem value="qual">Qualification</SelectItem>
            <SelectItem value="playoff">Playoff</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} row(s)</span>
      </div>

      <div className="panel-depth overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[1100px] text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-muted-foreground">
              <SortableHeader label="Match" active={sortKey === "match"} dir={sortDir} onClick={() => toggleSort("match")} />
              <SortableHeader label="Team" active={sortKey === "team"} dir={sortDir} onClick={() => toggleSort("team")} />
              <SortableHeader label="Alliance" active={sortKey === "alliance"} dir={sortDir} onClick={() => toggleSort("alliance")} />
              <SortableHeader label="Result" active={sortKey === "result"} dir={sortDir} onClick={() => toggleSort("result")} />
              <Th>RP</Th>
              <Th>Alliance auto</Th>
              <Th>Alliance teleop</Th>
              <Th>Alliance tower</Th>
              <Th>Auto climb</Th>
              <Th>Endgame climb</Th>
              <Th>Scouted</Th>
              {SLIDER_COLUMNS.map((c) => (
                <Th key={c.key} title={c.label}>
                  {c.label}
                </Th>
              ))}
              <Th>AI auto</Th>
              <Th>AI teleop</Th>
              <Th>AI confidence</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={`${row.matchId}-${row.teamId}`}
                className="border-b border-border/60 last:border-0 hover:bg-muted/30"
              >
                <td className="px-2 py-1.5 font-mono font-medium text-foreground">{matchLabel(row)}</td>
                <td className="px-2 py-1.5 font-mono">
                  <span className="flex items-center gap-1">
                    {row.teamNumber}
                    {row.isMockScoutData && (
                      <span className="rounded-full bg-warning px-1 py-0.5 text-[0.55rem] font-semibold uppercase leading-none text-warning-foreground">
                        Test
                      </span>
                    )}
                  </span>
                </td>
                <td className={cn("px-2 py-1.5 capitalize", row.alliance === "red" ? "text-destructive" : "text-primary")}>
                  {row.alliance}
                </td>
                <td className={cn("px-2 py-1.5", resultClass(row.result))}>{resultLabel(row.result)}</td>
                <td className="px-2 py-1.5 font-mono">{row.allianceRp ?? "—"}</td>
                <td className="px-2 py-1.5 font-mono">{row.allianceAutoFuelPoints ?? "—"}</td>
                <td className="px-2 py-1.5 font-mono">{row.allianceTeleopFuelPoints ?? "—"}</td>
                <td className="px-2 py-1.5 font-mono">{row.allianceTowerPoints ?? "—"}</td>
                <td className="px-2 py-1.5">{row.autoClimb ? CLIMB_LABEL[row.autoClimb] : "—"}</td>
                <td className="px-2 py-1.5">{row.endgameClimb ? CLIMB_LABEL[row.endgameClimb] : "—"}</td>
                <td className="px-2 py-1.5">{row.scoutReportSubmitted ? "Yes" : "No"}</td>
                {SLIDER_COLUMNS.map((c) => (
                  <td key={c.key} className="px-2 py-1.5 font-mono">
                    {row.sliders ? row.sliders[c.key] : "—"}
                  </td>
                ))}
                <td className="px-2 py-1.5 font-mono">
                  {row.aiEstimate ? row.aiEstimate.estimatedAutoFuelPoints.toFixed(1) : "—"}
                </td>
                <td className="px-2 py-1.5 font-mono">
                  {row.aiEstimate ? row.aiEstimate.estimatedTeleopFuelPoints.toFixed(1) : "—"}
                </td>
                <td className="px-2 py-1.5">
                  {row.aiEstimate ? capitalize(row.aiEstimate.confidence as Confidence) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function Th({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <th title={title} className="px-2 py-1.5 font-semibold whitespace-nowrap">
      {children}
    </th>
  )
}

function SortableHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string
  active: boolean
  dir: SortDir
  onClick: () => void
}) {
  return (
    <th className="px-2 py-1.5 font-semibold whitespace-nowrap">
      <button type="button" onClick={onClick} className="flex items-center gap-1 hover:text-foreground">
        {label}
        {active && <span>{dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  )
}
