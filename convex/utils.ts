import { Id } from "./_generated/dataModel";
import { QueryCtx, MutationCtx } from "./_generated/server";

export type AnyCtx = QueryCtx | MutationCtx;

export async function getOptionalUser(ctx: AnyCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

export async function requireUser(ctx: AnyCtx) {
  const user = await getOptionalUser(ctx);
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function getMembership(
  ctx: AnyCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">,
) {
  return await ctx.db
    .query("conversationMembers")
    .withIndex("by_conversation_and_user", (q) =>
      q.eq("conversationId", conversationId).eq("userId", userId),
    )
    .unique();
}

export async function requireMembership(
  ctx: AnyCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">,
) {
  const membership = await getMembership(ctx, conversationId, userId);
  if (!membership) throw new Error("Not a member of this conversation");
  return membership;
}

// Deterministic key for direct (1-on-1) conversations so the find-or-create
// path can be made idempotent under concurrent calls.
export function directPairKey(a: Id<"users">, b: Id<"users">): string {
  return [a, b].sort().join(":");
}

// Display name used everywhere user-facing — system messages, mentions,
// notifications. Mirrors the precedence the UI applies on the client:
// "First Last" → "First" → username.
export function userDisplayName(user: {
  firstName?: string;
  lastName?: string;
  username: string;
}): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  return user.firstName || user.username;
}

// Resolve a group's admin set, transparently handling legacy rows that
// only have the old single adminId field.
export function getGroupAdminIds(conv: {
  adminIds?: Id<"users">[];
  adminId?: Id<"users">;
}): Id<"users">[] {
  if (conv.adminIds && conv.adminIds.length > 0) return conv.adminIds;
  if (conv.adminId) return [conv.adminId];
  return [];
}

export function isGroupAdminOf(
  conv: { adminIds?: Id<"users">[]; adminId?: Id<"users"> },
  userId: Id<"users">,
): boolean {
  return getGroupAdminIds(conv).some((id) => id === userId);
}
