import { query } from "./_generated/server"

// This app manages one active event at a time: the most recently
// imported event is "the" event every other screen operates against.
export const getActiveEvent = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("events").collect()
    if (events.length === 0) {
      return null
    }
    return events.reduce((latest, event) =>
      (event.importedAt ?? 0) > (latest.importedAt ?? 0) ? event : latest,
    )
  },
})
