import { v } from "convex/values"
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
  internalAction,
  ActionCtx,
} from "./_generated/server"
import { internal } from "./_generated/api"
import { Doc, Id } from "./_generated/dataModel"
import { requireAdmin } from "./auth"
import type { TbaAllianceBreakdown } from "./tbaScoreSync"

// gemini-3.5-flash-lite. The full "Flash" models (3.5/3.6/3.7/3.8) are
// capped at a free-tier 20 requests/DAY (confirmed live: 2026-09-17,
// exceeded exactly this limit mid-run against a real event). The "Flash
// Lite" variants get a far more generous free-tier quota -- 500
// requests/day, 15 requests/minute (confirmed via the account's own
// aistudio.google.com/rate-limit page) -- which a real competition day
// (~70-100 matches x 2 calls) comfortably fits inside, where the full
// model's 20/day would not. generateContent is used here rather than the
// newer Interactions API (GA'd June 2026, now Google's documented default
// entry point) -- generateContent is explicitly still fully supported for
// one-shot, stateless calls like this one, and its structured-output
// request/response shape is well-documented and stable, whereas the
// Interactions API's exact JSON contract could not be confirmed from
// available docs at the time this was written.
const GEMINI_MODEL = "gemini-3.5-flash-lite"
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

// The Flash Lite free tier is 15 requests/minute; each queue item (one
// match) makes 2 calls (red + blue), so a 10s gap keeps steady-state
// throughput at ~12/min, leaving headroom under the limit.
const MATCH_DELAY_MS = 10_000
const BASE_BACKOFF_MS = 5_000
const MAX_BACKOFF_MS = 5 * 60 * 1000

class GeminiRateLimitError extends Error {}

type Confidence = "low" | "medium" | "high"

interface GeminiTeamEstimate {
  teamNumber: number
  estimatedAutoFuelPoints: number
  estimatedTeleopFuelPoints: number
  confidence: Confidence
  reasoning: string
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    teams: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          teamNumber: { type: "INTEGER" },
          estimatedAutoFuelPoints: { type: "NUMBER" },
          estimatedTeleopFuelPoints: { type: "NUMBER" },
          confidence: { type: "STRING", enum: ["low", "medium", "high"] },
          reasoning: { type: "STRING" },
        },
        required: [
          "teamNumber",
          "estimatedAutoFuelPoints",
          "estimatedTeleopFuelPoints",
          "confidence",
          "reasoning",
        ],
      },
    },
  },
  required: ["teams"],
}

function mapClimbLevel(raw: unknown): "none" | "level1" | "level2" | "level3" {
  switch (raw) {
    case "Level1":
      return "level1"
    case "Level2":
      return "level2"
    case "Level3":
      return "level3"
    default:
      return "none"
  }
}

interface TeamPromptInput {
  teamNumber: number
  nickname: string
  reportCount: number
  avgSliders: Record<string, number> | null
  notes: string[]
}

// FUEL is only known at the alliance level, so this is deliberately framed
// as a "split this real total plausibly across 3 robots using relative
// scout signal" problem -- never as "compute the exact per-robot number".
// An even 3-way split would look confident and be silently wrong; asking
// for a confidence label per team is the honest alternative.
function buildPrompt(params: {
  matchNumber: number
  compLevel: string
  allianceColor: "red" | "blue"
  allianceAutoFuelCount: number
  allianceAutoFuelPoints: number
  allianceTeleopFuelCount: number
  allianceTeleopFuelPoints: number
  teams: TeamPromptInput[]
}) {
  const teamBlocks = params.teams
    .map((team) => {
      const scoutSignal =
        team.reportCount === 0
          ? "No human scout match reports exist for this team in this match. Treat this team's split with lower confidence."
          : `Averaged across ${team.reportCount} scout report(s), 1-5 scale: ${JSON.stringify(team.avgSliders)}.`
      const noteText = team.notes.length > 0 ? `Scout notes: ${team.notes.join(" | ")}` : "No freeform scout notes."
      return `Team ${team.teamNumber} (${team.nickname}): ${scoutSignal} ${noteText}`
    })
    .join("\n")

  return `You are helping an FRC (FIRST Robotics Competition) scouting team reconstruct approximate per-robot FUEL scoring for the 2026 REBUILT game, for one alliance in one qualification match.

Ground truth you MUST treat as fixed and correct (this is the alliance's REAL scored total from the official field system, not an estimate):
- Auto FUEL: ${params.allianceAutoFuelCount} balls scored, worth ${params.allianceAutoFuelPoints} points, shared across all 3 robots on the ${params.allianceColor} alliance.
- Teleop FUEL: ${params.allianceTeleopFuelCount} balls scored, worth ${params.allianceTeleopFuelPoints} points, shared across all 3 robots on the ${params.allianceColor} alliance.

Match ${params.compLevel}${params.matchNumber}, ${params.allianceColor} alliance, 3 robots:
${teamBlocks}

Task: estimate how much of the alliance's real auto and teleop FUEL points each of these 3 robots plausibly contributed, using the relative scout ratings/notes above as your only signal for how to split the real total (higher teleopScoring/autoScoring ratings relative to alliance-mates suggest a larger share; higher defense rating suggests a smaller offensive share). Your per-robot point estimates for this alliance should roughly sum to the real alliance totals given above -- do not ignore the real totals in favor of an unconstrained guess, but also do not split evenly by default; use the scouting signal to differentiate the 3 robots.

Assign "confidence" per team based on how much and how consistent the scouting signal is for that team: "high" only when reports are present and consistent, "medium" when reports exist but are thin or inconsistent, "low" when reports are sparse/missing or contradictory. Write "reasoning" as 1-2 plain sentences a human scout lead would understand, referencing the specific signal you used.

Do not mention or estimate TOWER climb -- that is tracked exactly elsewhere and is not part of this task.

Return JSON matching the provided schema with exactly one entry per team number listed above.`
}

async function callGemini(prompt: string): Promise<GeminiTeamEstimate[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured")
  }

  const res = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  })

  if (res.status === 429) {
    const body = await res.text().catch(() => "")
    console.error(`Gemini 429 body: ${body.slice(0, 500)}`)
    throw new GeminiRateLimitError(`Gemini rate limit (429): ${body.slice(0, 300)}`)
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Gemini request failed (${res.status} ${res.statusText}): ${body.slice(0, 300)}`)
  }

  const data: unknown = await res.json()
  const text: unknown = (data as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] })
    ?.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof text !== "string") {
    throw new Error("Gemini response did not include candidate text")
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("Gemini response text was not valid JSON")
  }

  const teams = (parsed as { teams?: unknown }).teams
  if (!Array.isArray(teams)) {
    throw new Error("Gemini response JSON was missing a teams array")
  }

  return teams.map((entry) => {
    const team = entry as Record<string, unknown>
    if (
      typeof team.teamNumber !== "number" ||
      typeof team.estimatedAutoFuelPoints !== "number" ||
      typeof team.estimatedTeleopFuelPoints !== "number" ||
      (team.confidence !== "low" && team.confidence !== "medium" && team.confidence !== "high") ||
      typeof team.reasoning !== "string"
    ) {
      throw new Error("Gemini response entry was missing a required field")
    }
    return team as unknown as GeminiTeamEstimate
  })
}

function averageSliders(reports: Doc<"matchReports">[]): Record<string, number> | null {
  if (reports.length === 0) {
    return null
  }
  const keys = Object.keys(reports[0].sliders) as (keyof Doc<"matchReports">["sliders"])[]
  const sums: Record<string, number> = {}
  for (const key of keys) {
    sums[key] = reports.reduce((total, report) => total + report.sliders[key], 0) / reports.length
  }
  return sums
}

async function processAlliance(ctx: ActionCtx, match: Doc<"matches">, color: "red" | "blue") {
  const teamNumbers = color === "red" ? match.redTeamNumbers : match.blueTeamNumbers
  const breakdown = (match.tbaScoreBreakdown as { red?: TbaAllianceBreakdown; blue?: TbaAllianceBreakdown } | null)?.[
    color
  ]
  if (!breakdown) {
    throw new Error(`Match ${match.tbaMatchKey} has no synced ${color} score_breakdown`)
  }

  const teams = await ctx.runQuery(internal.aiAnalysis.getTeamsByNumbers, {
    eventId: match.eventId,
    teamNumbers,
  })
  if (teams.length !== teamNumbers.length) {
    throw new Error(`Could not resolve all ${color} teams for match ${match.tbaMatchKey}`)
  }

  const reports = await ctx.runQuery(internal.aiAnalysis.getMatchReportsForTeams, {
    matchId: match._id,
    teamIds: teams.map((t) => t._id),
  })

  const promptTeams: TeamPromptInput[] = teams.map((team) => {
    const teamReports = reports.filter((r) => r.teamId === team._id)
    return {
      teamNumber: team.teamNumber,
      nickname: team.nickname,
      reportCount: teamReports.length,
      avgSliders: averageSliders(teamReports),
      notes: teamReports.map((r) => r.notes).filter((n): n is string => Boolean(n)).slice(0, 3),
    }
  })

  const prompt = buildPrompt({
    matchNumber: match.matchNumber,
    compLevel: match.compLevel,
    allianceColor: color,
    allianceAutoFuelCount: breakdown.hubScore.autoCount,
    allianceAutoFuelPoints: breakdown.hubScore.autoPoints,
    allianceTeleopFuelCount: breakdown.hubScore.teleopCount,
    allianceTeleopFuelPoints: breakdown.hubScore.teleopPoints,
    teams: promptTeams,
  })

  const estimates = await callGemini(prompt)

  const climbByRobotIndex = [
    breakdown.endGameTowerRobot1,
    breakdown.endGameTowerRobot2,
    breakdown.endGameTowerRobot3,
  ]

  for (let i = 0; i < teams.length; i++) {
    const team = teams[i]
    const estimate = estimates.find((e) => e.teamNumber === team.teamNumber)
    if (!estimate) {
      throw new Error(`Gemini response for match ${match.tbaMatchKey} was missing team ${team.teamNumber}`)
    }
    await ctx.runMutation(internal.aiAnalysis.upsertAnalysisAndSummary, {
      teamId: team._id,
      matchId: match._id,
      estimatedAutoFuelPoints: estimate.estimatedAutoFuelPoints,
      estimatedTeleopFuelPoints: estimate.estimatedTeleopFuelPoints,
      confidence: estimate.confidence,
      reasoning: estimate.reasoning,
      // Copied verbatim from TBA -- never AI-estimated.
      tbaClimbLevel: mapClimbLevel(climbByRobotIndex[i]),
      modelVersion: GEMINI_MODEL,
    })
  }
}

export const getTeamsByNumbers = internalQuery({
  args: { eventId: v.id("events"), teamNumbers: v.array(v.number()) },
  handler: async (ctx, { eventId, teamNumbers }) => {
    const found = [] as Doc<"teams">[]
    for (const teamNumber of teamNumbers) {
      const team = await ctx.db
        .query("teams")
        .withIndex("by_event_teamNumber", (q) => q.eq("eventId", eventId).eq("teamNumber", teamNumber))
        .unique()
      if (team) {
        found.push(team)
      }
    }
    return found
  },
})

export const getMatchReportsForTeams = internalQuery({
  args: { matchId: v.id("matches"), teamIds: v.array(v.id("teams")) },
  handler: async (ctx, { matchId, teamIds }) => {
    const teamIdSet = new Set<string>(teamIds)
    const reports = await ctx.db
      .query("matchReports")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect()
    return reports.filter((r) => teamIdSet.has(r.teamId))
  },
})

export const getMatchDoc = internalQuery({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => ctx.db.get(matchId),
})

export const getJob = internalQuery({
  args: { runId: v.id("aiAnalysisJobs") },
  handler: async (ctx, { runId }) => ctx.db.get(runId),
})

export const getNextQueuedItem = internalQuery({
  args: { runId: v.id("aiAnalysisJobs") },
  handler: async (ctx, { runId }) =>
    ctx.db
      .query("aiAnalysisQueue")
      .withIndex("by_run_status", (q) => q.eq("runId", runId).eq("status", "queued"))
      .first(),
})

export const patchJob = internalMutation({
  args: {
    runId: v.id("aiAnalysisJobs"),
    status: v.optional(
      v.union(v.literal("running"), v.literal("paused_backoff"), v.literal("completed"), v.literal("failed")),
    ),
    processedMatchesDelta: v.optional(v.number()),
    windowStartedAt: v.optional(v.number()),
    currentBackoffUntil: v.optional(v.number()),
    consecutive429s: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, { runId, processedMatchesDelta, ...rest }) => {
    const job = await ctx.db.get(runId)
    if (!job) {
      return
    }
    await ctx.db.patch(runId, {
      ...rest,
      ...(processedMatchesDelta ? { processedMatches: job.processedMatches + processedMatchesDelta } : {}),
    })
  },
})

export const markQueueItem = internalMutation({
  args: {
    queueId: v.id("aiAnalysisQueue"),
    status: v.union(v.literal("queued"), v.literal("done"), v.literal("error")),
  },
  handler: async (ctx, { queueId, status }) => {
    const item = await ctx.db.get(queueId)
    if (!item) {
      return
    }
    await ctx.db.patch(queueId, { status, attempts: item.attempts + 1 })
  },
})

export const upsertAnalysisAndSummary = internalMutation({
  args: {
    teamId: v.id("teams"),
    matchId: v.id("matches"),
    estimatedAutoFuelPoints: v.number(),
    estimatedTeleopFuelPoints: v.number(),
    confidence: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    reasoning: v.string(),
    tbaClimbLevel: v.union(v.literal("none"), v.literal("level1"), v.literal("level2"), v.literal("level3")),
    modelVersion: v.string(),
  },
  handler: async (ctx, args) => {
    const existingAnalysis = await ctx.db
      .query("aiTeamAnalysis")
      .withIndex("by_match_team", (q) => q.eq("matchId", args.matchId).eq("teamId", args.teamId))
      .unique()

    const now = Date.now()
    if (existingAnalysis) {
      await ctx.db.patch(existingAnalysis._id, {
        estimatedAutoFuelPoints: args.estimatedAutoFuelPoints,
        estimatedTeleopFuelPoints: args.estimatedTeleopFuelPoints,
        confidence: args.confidence,
        reasoning: args.reasoning,
        tbaClimbLevel: args.tbaClimbLevel,
        modelVersion: args.modelVersion,
        generatedAt: now,
      })
    } else {
      await ctx.db.insert("aiTeamAnalysis", { ...args, generatedAt: now })
    }

    const summary = await ctx.db
      .query("aiTeamSeasonSummary")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .unique()

    // Incremental running average (not a full recompute): a re-run that
    // overwrites an already-analyzed match replaces that match's
    // contribution in place, everything else just folds the new value in.
    if (!summary) {
      await ctx.db.insert("aiTeamSeasonSummary", {
        teamId: args.teamId,
        matchesAnalyzed: 1,
        avgAutoFuelPoints: args.estimatedAutoFuelPoints,
        avgTeleopFuelPoints: args.estimatedTeleopFuelPoints,
        updatedAt: now,
      })
    } else if (existingAnalysis) {
      const n = summary.matchesAnalyzed
      await ctx.db.patch(summary._id, {
        avgAutoFuelPoints:
          summary.avgAutoFuelPoints + (args.estimatedAutoFuelPoints - existingAnalysis.estimatedAutoFuelPoints) / n,
        avgTeleopFuelPoints:
          summary.avgTeleopFuelPoints +
          (args.estimatedTeleopFuelPoints - existingAnalysis.estimatedTeleopFuelPoints) / n,
        updatedAt: now,
      })
    } else {
      const n = summary.matchesAnalyzed + 1
      await ctx.db.patch(summary._id, {
        matchesAnalyzed: n,
        avgAutoFuelPoints: summary.avgAutoFuelPoints + (args.estimatedAutoFuelPoints - summary.avgAutoFuelPoints) / n,
        avgTeleopFuelPoints:
          summary.avgTeleopFuelPoints + (args.estimatedTeleopFuelPoints - summary.avgTeleopFuelPoints) / n,
        updatedAt: now,
      })
    }
  },
})

export const startAnalysisRun = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }): Promise<Id<"aiAnalysisJobs">> => {
    await requireAdmin(ctx)

    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured")
    }

    const existingRuns = await ctx.db
      .query("aiAnalysisJobs")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()
    if (existingRuns.some((r) => r.status === "running" || r.status === "paused_backoff")) {
      throw new Error("An analysis run is already in progress for this event")
    }

    const matches = await ctx.db
      .query("matches")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()
    const readyMatches = matches.filter((m) => m.hasBeenPlayed && m.tbaScoreBreakdown)
    if (readyMatches.length === 0) {
      throw new Error("No played matches with synced TBA scores found -- run the TBA score sync first")
    }

    const now = Date.now()
    const runId = await ctx.db.insert("aiAnalysisJobs", {
      eventId,
      status: "running",
      totalMatches: readyMatches.length,
      processedMatches: 0,
      windowStartedAt: now,
      consecutive429s: 0,
      startedAt: now,
    })

    for (const match of readyMatches) {
      await ctx.db.insert("aiAnalysisQueue", {
        runId,
        matchId: match._id,
        status: "queued",
        attempts: 0,
      })
    }

    await ctx.scheduler.runAfter(0, internal.aiAnalysis.processNextQueueItem, { runId })

    return runId
  },
})

export const processNextQueueItem = internalAction({
  args: { runId: v.id("aiAnalysisJobs") },
  handler: async (ctx, { runId }) => {
    const job = await ctx.runQuery(internal.aiAnalysis.getJob, { runId })
    if (!job || job.status === "completed" || job.status === "failed") {
      return
    }

    const now = Date.now()
    if (job.currentBackoffUntil && now < job.currentBackoffUntil) {
      await ctx.scheduler.runAfter(job.currentBackoffUntil - now, internal.aiAnalysis.processNextQueueItem, {
        runId,
      })
      return
    }

    const nextItem = await ctx.runQuery(internal.aiAnalysis.getNextQueuedItem, { runId })
    if (!nextItem) {
      await ctx.runMutation(internal.aiAnalysis.patchJob, {
        runId,
        status: "completed",
        completedAt: Date.now(),
      })
      return
    }

    const match = await ctx.runQuery(internal.aiAnalysis.getMatchDoc, { matchId: nextItem.matchId })
    if (!match || !match.tbaScoreBreakdown) {
      await ctx.runMutation(internal.aiAnalysis.markQueueItem, { queueId: nextItem._id, status: "error" })
      await ctx.runMutation(internal.aiAnalysis.patchJob, { runId, status: "running", processedMatchesDelta: 1 })
      await ctx.scheduler.runAfter(0, internal.aiAnalysis.processNextQueueItem, { runId })
      return
    }

    let rateLimited = false
    for (const color of ["red", "blue"] as const) {
      try {
        await processAlliance(ctx, match, color)
      } catch (error) {
        if (error instanceof GeminiRateLimitError) {
          rateLimited = true
          break
        }
        console.error(`aiAnalysis: ${color} alliance failed for match ${match.tbaMatchKey}:`, error)
      }
    }

    if (rateLimited) {
      const consecutive429s = job.consecutive429s + 1
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** (consecutive429s - 1), MAX_BACKOFF_MS)
      const jitter = Math.floor(Math.random() * 1000)
      const backoffMs = backoff + jitter
      await ctx.runMutation(internal.aiAnalysis.patchJob, {
        runId,
        status: "paused_backoff",
        currentBackoffUntil: Date.now() + backoffMs,
        consecutive429s,
      })
      await ctx.scheduler.runAfter(backoffMs, internal.aiAnalysis.processNextQueueItem, { runId })
      return
    }

    await ctx.runMutation(internal.aiAnalysis.markQueueItem, { queueId: nextItem._id, status: "done" })
    await ctx.runMutation(internal.aiAnalysis.patchJob, {
      runId,
      status: "running",
      processedMatchesDelta: 1,
      consecutive429s: 0,
      windowStartedAt: Date.now(),
    })
    await ctx.scheduler.runAfter(MATCH_DELAY_MS, internal.aiAnalysis.processNextQueueItem, { runId })
  },
})

export const getJobForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const runs = await ctx.db
      .query("aiAnalysisJobs")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()
    if (runs.length === 0) {
      return null
    }
    return runs.reduce((latest, run) => (run.startedAt > latest.startedAt ? run : latest))
  },
})

export const listTeamSummaries = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()
    teams.sort((a, b) => a.teamNumber - b.teamNumber)

    const results = []
    for (const team of teams) {
      const summary = await ctx.db
        .query("aiTeamSeasonSummary")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .unique()

      const analyses = await ctx.db
        .query("aiTeamAnalysis")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .collect()

      const counts: Record<Confidence, number> = { low: 0, medium: 0, high: 0 }
      for (const analysis of analyses) {
        counts[analysis.confidence] += 1
      }
      let dominantConfidence: Confidence | null = null
      if (analyses.length > 0) {
        dominantConfidence = (["high", "medium", "low"] as Confidence[]).reduce((best, level) =>
          counts[level] > counts[best] ? level : best,
        )
      }

      results.push({
        team,
        summary: summary ?? null,
        dominantConfidence,
        matchesAnalyzed: analyses.length,
      })
    }
    return results
  },
})

export const listAnalysesForTeam = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const analyses = await ctx.db
      .query("aiTeamAnalysis")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect()

    const withMatches = await Promise.all(
      analyses.map(async (analysis) => {
        const match = await ctx.db.get(analysis.matchId)
        return { analysis, match }
      }),
    )

    withMatches.sort((a, b) => (a.match?.matchNumber ?? 0) - (b.match?.matchNumber ?? 0))
    return withMatches
  },
})
