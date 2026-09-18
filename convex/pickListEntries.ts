import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireAdmin } from "./auth"
import { Doc, Id } from "./_generated/dataModel"

const TIER = v.union(
  v.literal("Tier1"),
  v.literal("Tier2"),
  v.literal("Tier3"),
  v.literal("DoNotPick"),
  v.literal("Uncategorized"),
)

const OWNER = v.union(v.id("scouts"), v.literal("primary"))

export const TIER_ORDER = [
  "Tier1",
  "Tier2",
  "Tier3",
  "DoNotPick",
  "Uncategorized",
] as const

async function requireOwnerAccess(
  ctx: Parameters<typeof requireAdmin>[0],
  ownerId: Id<"scouts"> | "primary",
) {
  // The primary list is the single admin-owned shared board; personal
  // lists have no server-verifiable owner in the shared-PIN model, so we
  // only gate the primary list here.
  if (ownerId === "primary") {
    await requireAdmin(ctx)
  }
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

// Rough win/loss signal from raw scoring fields TBA import may populate.
// These fields are optional and, as of this writing, not backfilled by the
// TBA import path -- so this legitimately returns "no signal" (null) for
// most/all matches today. That's expected: see task notes, a placeholder
// is acceptable until score data is populated by another workstream.
function matchOutcomeForTeam(
  match: Doc<"matches">,
  teamNumber: number,
): "win" | "loss" | "tie" | null {
  if (!match.hasBeenPlayed) return null
  const isRed = match.redTeamNumbers.includes(teamNumber)
  const isBlue = match.blueTeamNumbers.includes(teamNumber)
  if (!isRed && !isBlue) return null

  const redTotal =
    match.redAutoFuel !== undefined &&
    match.redTeleopFuel !== undefined &&
    match.redTowerPoints !== undefined
      ? match.redAutoFuel + match.redTeleopFuel + match.redTowerPoints
      : null
  const blueTotal =
    match.blueAutoFuel !== undefined &&
    match.blueTeleopFuel !== undefined &&
    match.blueTowerPoints !== undefined
      ? match.blueAutoFuel + match.blueTeleopFuel + match.blueTowerPoints
      : null

  if (redTotal === null || blueTotal === null) return null

  const won = isRed ? redTotal > blueTotal : blueTotal > redTotal
  const lost = isRed ? redTotal < blueTotal : blueTotal < redTotal
  if (won) return "win"
  if (lost) return "loss"
  return "tie"
}

export const boardForOwner = query({
  args: { eventId: v.id("events"), ownerId: OWNER },
  handler: async (ctx, { eventId, ownerId }) => {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()

    const entries = await ctx.db
      .query("pickListEntries")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect()
    const entryByTeam = new Map(entries.map((e) => [e.teamId, e]))

    const matches = await ctx.db
      .query("matches")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()

    const sortedTeams = [...teams].sort((a, b) => a.teamNumber - b.teamNumber)

    const cards = await Promise.all(
      sortedTeams.map(async (team, index) => {
        const entry = entryByTeam.get(team._id) ?? null

        const [pitReport, matchReports, aiSummary] = await Promise.all([
          ctx.db
            .query("pitReports")
            .withIndex("by_team", (q) => q.eq("teamId", team._id))
            .first(),
          ctx.db
            .query("matchReports")
            .withIndex("by_team", (q) => q.eq("teamId", team._id))
            .collect(),
          ctx.db
            .query("aiTeamSeasonSummary")
            .withIndex("by_team", (q) => q.eq("teamId", team._id))
            .first(),
        ])

        const avgDriverRating = average(
          matchReports.map((r) => r.sliders.driverSkill),
        )

        const hasMockData = Boolean(pitReport?.isMockData) || matchReports.some((r) => r.isMockData)

        const avgEstimatedScore = aiSummary
          ? aiSummary.avgAutoFuelPoints + aiSummary.avgTeleopFuelPoints
          : null

        const outcomes = matches
          .map((m) => matchOutcomeForTeam(m, team.teamNumber))
          .filter((o): o is "win" | "loss" | "tie" => o !== null)
        const record =
          outcomes.length === 0
            ? null
            : {
                wins: outcomes.filter((o) => o === "win").length,
                losses: outcomes.filter((o) => o === "loss").length,
                ties: outcomes.filter((o) => o === "tie").length,
              }

        return {
          teamId: team._id,
          teamNumber: team.teamNumber,
          nickname: team.nickname,
          tier: entry?.tier ?? ("Uncategorized" as const),
          // Synthetic teams (no persisted row yet) sort after every real
          // entry in their column, ordered by team number, so the board is
          // stable without requiring a seed/migration step.
          position: entry?.position ?? 1_000_000 + index,
          hasEntry: entry !== null,
          pitScouted: pitReport !== null,
          hasMockData,
          avgDriverRating,
          avgEstimatedScore,
          record,
        }
      }),
    )

    const columns: Record<(typeof TIER_ORDER)[number], typeof cards> = {
      Tier1: [],
      Tier2: [],
      Tier3: [],
      DoNotPick: [],
      Uncategorized: [],
    }
    for (const card of cards) {
      columns[card.tier].push(card)
    }
    for (const tier of TIER_ORDER) {
      columns[tier].sort((a, b) => a.position - b.position)
    }

    return columns
  },
})

// Persists a drag/drop immediately: full ordered team-id lists for the
// destination column (and, if the card moved across columns, the source
// column) are written as compact 0..n-1 positions. Upserts any team that
// didn't have a row yet, which is how lazily-created rows come into being.
export const moveCard = mutation({
  args: {
    ownerId: OWNER,
    destTier: TIER,
    destOrderedTeamIds: v.array(v.id("teams")),
    sourceTier: v.optional(TIER),
    sourceOrderedTeamIds: v.optional(v.array(v.id("teams"))),
  },
  handler: async (ctx, args) => {
    await requireOwnerAccess(ctx, args.ownerId)

    async function upsertColumn(
      tier: (typeof TIER_ORDER)[number],
      teamIds: Id<"teams">[],
    ) {
      for (let position = 0; position < teamIds.length; position++) {
        const teamId = teamIds[position]
        const existing = await ctx.db
          .query("pickListEntries")
          .withIndex("by_owner_team", (q) =>
            q.eq("ownerId", args.ownerId).eq("teamId", teamId),
          )
          .unique()
        if (existing) {
          if (existing.tier !== tier || existing.position !== position) {
            await ctx.db.patch(existing._id, { tier, position })
          }
        } else {
          await ctx.db.insert("pickListEntries", {
            ownerId: args.ownerId,
            teamId,
            tier,
            position,
          })
        }
      }
    }

    await upsertColumn(args.destTier, args.destOrderedTeamIds)
    if (args.sourceTier && args.sourceOrderedTeamIds) {
      await upsertColumn(args.sourceTier, args.sourceOrderedTeamIds)
    }
  },
})
