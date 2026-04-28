import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { getOptionalUser, requireUser } from "./utils";

// Create or update user from Clerk webhook
export const upsertUser = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    username: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (existingUser) {
      await ctx.db.patch(existingUser._id, {
        email: args.email,
        username: args.username,
        firstName: args.firstName,
        lastName: args.lastName,
        imageUrl: args.imageUrl,
      });
      return existingUser._id;
    }

    return await ctx.db.insert("users", {
      ...args,
      isOnline: false,
      lastSeen: Date.now(),
    });
  },
});

// Delete user
export const deleteUser = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (user) {
      await ctx.db.delete(user._id);
    }
  },
});

// Get current user
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await getOptionalUser(ctx);
  },
});

// Get user by ID
export const getUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

// Search users
export const searchUsers = query({
  args: { searchQuery: v.string() },
  handler: async (ctx, args) => {
    const currentUser = await getOptionalUser(ctx);
    if (!currentUser) return [];

    const trimmed = args.searchQuery.trim();

    // Empty query: return a small recent slice instead of scanning the whole table.
    if (trimmed === "") {
      const users = await ctx.db.query("users").take(20);
      return users.filter((u) => u._id !== currentUser._id);
    }

    const results = await ctx.db
      .query("users")
      .withSearchIndex("search_users", (q) => q.search("username", trimmed))
      .take(20);

    return results.filter((u) => u._id !== currentUser._id);
  },
});

// Update online status. The Clerk webhook is the single writer for the
// users table — if no row exists yet, the webhook hasn't landed, so this
// is a no-op rather than racing to insert a stub user.
export const updateOnlineStatus = mutation({
  args: { isOnline: v.boolean() },
  handler: async (ctx, args) => {
    const user = await getOptionalUser(ctx);
    if (!user) return;

    await ctx.db.patch(user._id, {
      isOnline: args.isOnline,
      lastSeen: Date.now(),
    });
  },
});

// Has the Clerk webhook synced this user yet? The client can poll this on
// first load to know when it's safe to subscribe to user-dependent queries.
export const isCurrentUserSynced = query({
  args: {},
  handler: async (ctx) => {
    const user = await getOptionalUser(ctx);
    return user !== null;
  },
});

// Update app-side profile fields (status/bio). Name/avatar/email come from
// Clerk and are kept in sync via the webhook — those should be edited there.
export const updateProfile = mutation({
  args: {
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const updates: Partial<{ status: string }> = {};
    if (args.status !== undefined) {
      // Empty string clears the status.
      updates.status = args.status.trim().slice(0, 140);
    }
    await ctx.db.patch(user._id, updates);
  },
});
