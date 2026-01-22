import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    return user;
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) return [];

    if (args.searchQuery.trim() === "") {
      const users = await ctx.db.query("users").collect();
      return users.filter((u) => u._id !== currentUser._id).slice(0, 20);
    }

    const results = await ctx.db
      .query("users")
      .withSearchIndex("search_users", (q) =>
        q.search("username", args.searchQuery)
      )
      .collect();

    return results.filter((u) => u._id !== currentUser._id);
  },
});

// Update online status
export const updateOnlineStatus = mutation({
  args: { isOnline: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    let user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    // Create user if they don't exist yet (webhook might not have fired)
    if (!user) {
      // Create minimal user record - webhook will update with full details later
      const email = (identity as any).email || `user-${identity.subject.slice(0, 8)}@temp.com`;
      const username = (identity as any).username || `user-${identity.subject.slice(0, 8)}`;
      
      const userId = await ctx.db.insert("users", {
        clerkId: identity.subject,
        email: email,
        username: username,
        firstName: (identity as any).firstName || undefined,
        lastName: (identity as any).lastName || undefined,
        imageUrl: (identity as any).pictureUrl || undefined,
        isOnline: args.isOnline,
        lastSeen: Date.now(),
      });
      
      // User created, status already set in insert
      return;
    }

    // Update existing user's online status
    await ctx.db.patch(user._id, {
      isOnline: args.isOnline,
      lastSeen: Date.now(),
    });
  },
});