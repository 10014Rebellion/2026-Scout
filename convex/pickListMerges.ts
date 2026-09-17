import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireAdmin } from "./auth"
import { Id } from "./_generated/dataModel"

const TIER_INDEX: Record<string, number> = {
  Tier1: 0,
  Tier2: 1,
  Tier3: 2,
  DoNotPick: 3,
  Uncategorized: 4,
}

const RANKED_TIERS = ["Tier1", "Tier2", "Tier3", "DoNotPick"] as const

export const latest = query({
  args: {},
  handler: async (ctx) => {
    const merges = await ctx.db.query("pickListMerges").withIndex("by_triggeredAt").order("desc").take(1)
    const merge = merges[0] ?? null
    if (!merge) return null
    const scout = await ctx.db.get(merge.triggeredBy)
    return { ...merge, triggeredByName: scout?.name ?? "Unknown" }
  },
})

// Algorithm v1-tier-weighted-mean:
// For each team, rank = tierIndex*1000 + position for every scout who
// placed it outside Uncategorized (a scout leaving a team in
// Uncategorized is treated as abstaining, not as ranking it last).
// consensusScore = mean(those ranks); teams nobody ranked sort last and
// land back in Uncategorized. Ties break by (1) more scouts having
// ranked it, (2) the single best individual rank, (3) lower team number.
//
// Tier bucketing: ranked teams are split into four roughly-even quartiles
// (Tier1..DoNotPick) by count; unranked teams go to Uncategorized. This
// is a documented judgment call, not derived from the schema.
export const runMerge = mutation({
  args: { eventId: v.id("events"), triggeredBy: v.id("scouts") },
  handler: async (ctx, { eventId, triggeredBy }) => {
    await requireAdmin(ctx)

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()
    const scouts = await ctx.db.query("scouts").collect()

    const perTeam = new Map<
      Id<"teams">,
      { ranks: number[]; teamNumber: number }
    >()
    for (const team of teams) {
      perTeam.set(team._id, { ranks: [], teamNumber: team.teamNumber })
    }

    const participatingScoutIds: Id<"scouts">[] = []

    for (const scout of scouts) {
      const entries = await ctx.db
        .query("pickListEntries")
        .withIndex("by_owner", (q) => q.eq("ownerId", scout._id))
        .collect()
      let scoutRankedAny = false
      for (const entry of entries) {
        if (entry.tier === "Uncategorized") continue
        const bucket = perTeam.get(entry.teamId)
        if (!bucket) continue
        bucket.ranks.push(TIER_INDEX[entry.tier] * 1000 + entry.position)
        scoutRankedAny = true
      }
      if (scoutRankedAny) {
        participatingScoutIds.push(scout._id)
      }
    }

    const scored = teams.map((team) => {
      const bucket = perTeam.get(team._id)!
      const numScoutsRanked = bucket.ranks.length
      const consensusScore =
        numScoutsRanked === 0
          ? Number.POSITIVE_INFINITY
          : bucket.ranks.reduce((a, b) => a + b, 0) / numScoutsRanked
      const bestRank =
        numScoutsRanked === 0 ? Number.POSITIVE_INFINITY : Math.min(...bucket.ranks)
      return { teamId: team._id, teamNumber: team.teamNumber, numScoutsRanked, consensusScore, bestRank }
    })

    scored.sort((a, b) => {
      if (a.consensusScore !== b.consensusScore) return a.consensusScore - b.consensusScore
      if (a.numScoutsRanked !== b.numScoutsRanked) return b.numScoutsRanked - a.numScoutsRanked
      if (a.bestRank !== b.bestRank) return a.bestRank - b.bestRank
      return a.teamNumber - b.teamNumber
    })

    const ranked = scored.filter((s) => s.numScoutsRanked > 0)
    const unranked = scored.filter((s) => s.numScoutsRanked === 0)

    const quartileSize = Math.ceil(ranked.length / 4) || 1
    const bucketed: Record<string, Id<"teams">[]> = {
      Tier1: [],
      Tier2: [],
      Tier3: [],
      DoNotPick: [],
      Uncategorized: unranked.map((s) => s.teamId),
    }
    ranked.forEach((s, i) => {
      const tierName = RANKED_TIERS[Math.min(3, Math.floor(i / quartileSize))]
      bucketed[tierName].push(s.teamId)
    })

    const existingPrimary = await ctx.db
      .query("pickListEntries")
      .withIndex("by_owner", (q) => q.eq("ownerId", "primary"))
      .collect()
    for (const row of existingPrimary) {
      await ctx.db.delete(row._id)
    }

    for (const tierName of Object.keys(bucketed)) {
      const teamIds = bucketed[tierName]
      for (let position = 0; position < teamIds.length; position++) {
        await ctx.db.insert("pickListEntries", {
          ownerId: "primary",
          teamId: teamIds[position],
          tier: tierName as
            | "Tier1"
            | "Tier2"
            | "Tier3"
            | "DoNotPick"
            | "Uncategorized",
          position,
        })
      }
    }

    const resultingOrder = scored.map((s) => s.teamId)

    await ctx.db.insert("pickListMerges", {
      triggeredBy,
      triggeredAt: Date.now(),
      algorithmVersion: "v1-tier-weighted-mean",
      participatingScoutIds,
      resultingOrder,
    })

    return {
      teamCount: teams.length,
      participatingScoutCount: participatingScoutIds.length,
    }
  },
})
