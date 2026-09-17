import { convexAuth, getAuthUserId } from "@convex-dev/auth/server"
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import { internalMutation, query, QueryCtx, MutationCtx } from "./_generated/server"

const ROLES = v.union(v.literal("admin"), v.literal("scout"))

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    ConvexCredentials({
      id: "pin",
      authorize: async (credentials, ctx) => {
        const role = credentials.role
        const pin = credentials.pin
        if (role !== "admin" && role !== "scout") {
          throw new Error("Invalid role")
        }
        if (typeof pin !== "string" || pin.length === 0) {
          throw new Error("PIN is required")
        }
        const expectedPin =
          role === "admin" ? process.env.ADMIN_PIN : process.env.SCOUT_PIN
        if (!expectedPin) {
          throw new Error(`${role.toUpperCase()}_PIN is not configured`)
        }
        if (pin !== expectedPin) {
          throw new Error("Incorrect PIN")
        }
        const userId = await ctx.runMutation(
          internal.auth.getOrCreateRoleUser,
          { role },
        )
        return { userId }
      },
    }),
  ],
})

// One shared `users` row per role -- there's no per-person Convex Auth
// identity in the PIN model. Individual attribution happens client-side
// via a scout name picker, not via this table.
export const getOrCreateRoleUser = internalMutation({
  args: { role: ROLES },
  handler: async (ctx, { role }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", role))
      .unique()
    if (existing) {
      return existing._id
    }
    return await ctx.db.insert("users", { role })
  },
})

export async function getCurrentUserRole(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx)
  if (!userId) {
    return null
  }
  const user = await ctx.db.get(userId)
  return user?.role ?? null
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const role = await getCurrentUserRole(ctx)
  if (role !== "admin") {
    throw new Error("Admin access required")
  }
}

// Exposed to the client for UI gating (e.g. hiding admin-only nav items)
// and to actions (which lack `ctx.db`) via `ctx.runQuery`.
export const currentRole = query({
  args: {},
  handler: async (ctx) => getCurrentUserRole(ctx),
})
