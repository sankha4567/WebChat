import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// Records a svix-id as processed and returns true if it was already there.
// Convex serializes mutations on overlapping read/write sets, so two
// concurrent claims of the same svix-id will OCC-conflict and the loser
// will retry, then see the row.
export const claimSvixId = internalMutation({
  args: { svixId: v.string() },
  handler: async (ctx, { svixId }) => {
    const existing = await ctx.db
      .query("webhookEvents")
      .withIndex("by_svix_id", (q) => q.eq("svixId", svixId))
      .unique();

    if (existing) return true;

    await ctx.db.insert("webhookEvents", {
      svixId,
      processedAt: Date.now(),
    });
    return false;
  },
});
