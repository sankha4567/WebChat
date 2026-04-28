import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  directPairKey,
  getGroupAdminIds,
  getMembership,
  isGroupAdminOf,
  requireUser,
  userDisplayName,
} from "./utils";

// Get or create a direct conversation between two users.
// Idempotent under concurrency: a deterministic directPairKey + index lets
// the second of two racing inserts OCC-conflict and find the existing row.
export const getOrCreateDirectConversation = mutation({
  args: { otherUserId: v.id("users") },
  handler: async (ctx, args) => {
    const currentUser = await requireUser(ctx);

    if (currentUser._id === args.otherUserId) {
      throw new Error("Cannot start a direct chat with yourself");
    }

    const pairKey = directPairKey(currentUser._id, args.otherUserId);

    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_direct_pair", (q) => q.eq("directPairKey", pairKey))
      .unique();

    if (existing) return existing._id;

    // Fallback for rows created before directPairKey existed: scan the
    // current user's memberships and heal any matching legacy direct chat
    // by backfilling the key. Returns the first match so duplicates aren't
    // silently re-merged — getConversations dedupes them at read time.
    const myMemberships = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user", (q) => q.eq("userId", currentUser._id))
      .collect();

    for (const m of myMemberships) {
      const conv = await ctx.db.get(m.conversationId);
      if (!conv || conv.isGroup || conv.directPairKey) continue;

      const otherSide = await ctx.db
        .query("conversationMembers")
        .withIndex("by_conversation_and_user", (q) =>
          q.eq("conversationId", conv._id).eq("userId", args.otherUserId),
        )
        .unique();

      if (otherSide) {
        await ctx.db.patch(conv._id, { directPairKey: pairKey });
        return conv._id;
      }
    }

    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      isGroup: false,
      createdBy: currentUser._id,
      directPairKey: pairKey,
    });

    await ctx.db.insert("conversationMembers", {
      conversationId,
      userId: currentUser._id,
      joinedAt: now,
      isTyping: false,
      notifications: true,
    });

    await ctx.db.insert("conversationMembers", {
      conversationId,
      userId: args.otherUserId,
      joinedAt: now,
      isTyping: false,
      notifications: true,
    });

    return conversationId;
  },
});

// Create a group conversation
export const createGroup = mutation({
  args: {
    name: v.string(),
    memberIds: v.array(v.id("users")),
    groupImage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireUser(ctx);
    const now = Date.now();

    const conversationId = await ctx.db.insert("conversations", {
      name: args.name,
      isGroup: true,
      groupImage: args.groupImage,
      adminId: currentUser._id,
      adminIds: [currentUser._id],
      createdBy: currentUser._id,
      lastMessageTime: now,
    });

    // Add creator as member
    await ctx.db.insert("conversationMembers", {
      conversationId,
      userId: currentUser._id,
      joinedAt: now,
      isTyping: false,
      notifications: true,
    });

    // Dedupe member IDs and skip the creator if accidentally re-included.
    const uniqueMembers = Array.from(new Set(args.memberIds)).filter(
      (id) => id !== currentUser._id,
    );

    for (const memberId of uniqueMembers) {
      await ctx.db.insert("conversationMembers", {
        conversationId,
        userId: memberId,
        joinedAt: now,
        isTyping: false,
        notifications: true,
      });
    }

    const systemMessageId = await ctx.db.insert("messages", {
      conversationId,
      senderId: currentUser._id,
      content: `${userDisplayName(currentUser)} created the group "${args.name}"`,
      type: "system",
      systemAction: "group_created",
      systemGroupName: args.name,
      isEdited: false,
      deletedForEveryone: false,
      createdAt: now,
    });

    await ctx.db.patch(conversationId, {
      lastMessageId: systemMessageId,
    });

    return conversationId;
  },
});

// Get all conversations for current user with unread counts
export const getConversations = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await requireUser(ctx);

    const memberships = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user", (q) => q.eq("userId", currentUser._id))
      .collect();

    const conversations = await Promise.all(
      memberships.map(async (membership) => {
        const conversation = await ctx.db.get(membership.conversationId);
        if (!conversation) return null;

        const allMembers = await ctx.db
          .query("conversationMembers")
          .withIndex("by_conversation", (q) =>
            q.eq("conversationId", conversation._id),
          )
          .collect();

        const activeMembers = allMembers.filter((m) => !m.leftAt);

        const memberUsers = await Promise.all(
          activeMembers.map(async (m) => {
            const user = await ctx.db.get(m.userId);
            return user ? { ...user, isTyping: m.isTyping } : null;
          }),
        );

        let lastMessage = null;
        if (conversation.lastMessageId) {
          const lm = await ctx.db.get(conversation.lastMessageId);
          if (lm) {
            const sender = await ctx.db.get(lm.senderId);
            lastMessage = { ...lm, sender };
          }
        }

        const lastReadTime = membership.lastReadTime || 0;
        const unreadMessages = await ctx.db
          .query("messages")
          .withIndex("by_conversation_and_time", (q) =>
            q
              .eq("conversationId", conversation._id)
              .gt("createdAt", lastReadTime),
          )
          .filter((q) =>
            q.and(
              q.neq(q.field("senderId"), currentUser._id),
              q.eq(q.field("deletedForEveryone"), false),
            ),
          )
          .collect();

        const typingUsers = memberUsers.filter(
          (m): m is NonNullable<typeof m> =>
            m !== null && m._id !== currentUser._id && m.isTyping,
        );

        const otherUser = !conversation.isGroup
          ? memberUsers.find((m) => m && m._id !== currentUser._id) || null
          : null;

        return {
          ...conversation,
          members: memberUsers.filter((m): m is NonNullable<typeof m> => m !== null),
          otherUser,
          lastMessage,
          unreadCount: unreadMessages.length,
          typingUsers,
          membership,
        };
      }),
    );

    const live = conversations.filter(
      (c): c is NonNullable<typeof c> => c !== null,
    );

    // Hide broken/legacy direct chats where the other party no longer
    // resolves (deleted user, old self-chat, stub data).
    const visible = live.filter((c) => c.isGroup || c.otherUser);

    // Dedupe direct chats by counterparty: pre-fix data and concurrent
    // races could leave multiple direct rows for the same pair. Keep the
    // most-recently-active one.
    const directByOther = new Map<string, (typeof visible)[number]>();
    const groups: typeof visible = [];
    for (const c of visible) {
      if (c.isGroup) {
        groups.push(c);
        continue;
      }
      const key = c.otherUser?._id;
      if (!key) continue;
      const existing = directByOther.get(key);
      const cTime = c.lastMessageTime || 0;
      const eTime = existing?.lastMessageTime || 0;
      if (!existing || cTime > eTime) directByOther.set(key, c);
    }

    return [...groups, ...directByOther.values()].sort(
      (a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0),
    );
  },
});

// Get single conversation details
export const getConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const currentUser = await requireUser(ctx);

    const membership = await getMembership(
      ctx,
      args.conversationId,
      currentUser._id,
    );
    if (!membership) return null;

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) return null;

    const allMembers = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversation._id),
      )
      .collect();

    // Hide soft-removed members from the visible roster.
    const activeMembers = allMembers.filter((m) => !m.leftAt);

    const memberUsers = await Promise.all(
      activeMembers.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        return user ? { ...user, isTyping: m.isTyping, membership: m } : null;
      }),
    );

    const otherUser = !conversation.isGroup
      ? memberUsers.find((m) => m && m._id !== currentUser._id) || null
      : null;

    const typingUsers = memberUsers.filter(
      (m): m is NonNullable<typeof m> =>
        m !== null && m._id !== currentUser._id && m.isTyping,
    );

    return {
      ...conversation,
      members: memberUsers.filter((m): m is NonNullable<typeof m> => m !== null),
      otherUser,
      typingUsers,
      currentMembership: membership,
      // Read-only flag for the chat view: when true the composer is hidden
      // and the user only sees messages up to membership.leftAt.
      viewerLeft: !!membership.leftAt,
    };
  },
});

// Update typing status
export const updateTypingStatus = mutation({
  args: {
    conversationId: v.id("conversations"),
    isTyping: v.boolean(),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireUser(ctx);
    const membership = await getMembership(
      ctx,
      args.conversationId,
      currentUser._id,
    );
    if (membership) {
      await ctx.db.patch(membership._id, { isTyping: args.isTyping });
    }
  },
});

// Mark conversation as read
export const markAsRead = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const currentUser = await requireUser(ctx);
    const membership = await getMembership(
      ctx,
      args.conversationId,
      currentUser._id,
    );
    if (!membership) return;

    const conversation = await ctx.db.get(args.conversationId);
    await ctx.db.patch(membership._id, {
      lastReadMessageId: conversation?.lastMessageId,
      lastReadTime: Date.now(),
    });
  },
});

// Add member to group. Any existing group member can invite — admin-only
// actions (remove, promote, rename) remain restricted.
export const addGroupMember = mutation({
  args: {
    conversationId: v.id("conversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireUser(ctx);

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || !conversation.isGroup) {
      throw new Error("Not a group conversation");
    }

    // The caller must be a member of this group.
    const myMembership = await getMembership(
      ctx,
      args.conversationId,
      currentUser._id,
    );
    if (!myMembership) throw new Error("Not a member of this group");

    const existingMembership = await getMembership(
      ctx,
      args.conversationId,
      args.userId,
    );
    if (existingMembership && !existingMembership.leftAt) {
      throw new Error("User is already a member");
    }

    const newUser = await ctx.db.get(args.userId);
    if (!newUser) throw new Error("User not found");

    const now = Date.now();

    if (existingMembership && existingMembership.leftAt) {
      // Re-add: clear the leftAt marker and bump joinedAt so analytics on
      // join-time reflect the most recent join.
      await ctx.db.patch(existingMembership._id, {
        leftAt: undefined,
        joinedAt: now,
        isTyping: false,
      });
    } else {
      await ctx.db.insert("conversationMembers", {
        conversationId: args.conversationId,
        userId: args.userId,
        joinedAt: now,
        isTyping: false,
        notifications: true,
      });
    }

    const systemMessageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderId: currentUser._id,
      content: `${userDisplayName(currentUser)} added ${userDisplayName(newUser)}`,
      type: "system",
      systemAction: "member_added",
      systemTargetId: args.userId,
      systemTargetName: userDisplayName(newUser),
      isEdited: false,
      deletedForEveryone: false,
      createdAt: now,
    });

    await ctx.db.patch(args.conversationId, {
      lastMessageId: systemMessageId,
      lastMessageTime: now,
    });
  },
});

// Remove member from group. Self-removal allowed unless caller is the
// last admin (must promote someone else first). Removing others requires
// the caller to be a current admin. Admin status is automatically dropped
// from the removed user's adminIds entry.
export const removeGroupMember = mutation({
  args: {
    conversationId: v.id("conversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireUser(ctx);

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || !conversation.isGroup) {
      throw new Error("Not a group conversation");
    }

    const isSelfRemoval = args.userId === currentUser._id;
    const callerIsAdmin = isGroupAdminOf(conversation, currentUser._id);
    const targetIsAdmin = isGroupAdminOf(conversation, args.userId);

    if (!isSelfRemoval && !callerIsAdmin) {
      throw new Error("Only an admin can remove other members");
    }

    const admins = getGroupAdminIds(conversation);
    if (isSelfRemoval && targetIsAdmin && admins.length === 1) {
      throw new Error(
        "You're the only admin. Promote another member before leaving.",
      );
    }

    const membership = await getMembership(
      ctx,
      args.conversationId,
      args.userId,
    );
    if (!membership || membership.leftAt) return;

    // Soft-remove: keep the membership row so the user can still view the
    // chat up to this moment, including the "X removed you" notice that
    // we're about to write.
    const leftAt = Date.now();
    await ctx.db.patch(membership._id, {
      leftAt,
      isTyping: false,
    });

    // Cascade: removed admin loses their admin status.
    if (targetIsAdmin) {
      const newAdmins = admins.filter((id) => id !== args.userId);
      await ctx.db.patch(args.conversationId, {
        adminIds: newAdmins,
        adminId:
          conversation.adminId === args.userId
            ? newAdmins[0]
            : conversation.adminId,
      });
    }

    const removedUser = await ctx.db.get(args.userId);
    const removedName = removedUser
      ? userDisplayName(removedUser)
      : "user";
    const content = isSelfRemoval
      ? `${userDisplayName(currentUser)} left the group`
      : `${userDisplayName(currentUser)} removed ${removedName}`;

    // Use leftAt for the system message timestamp too, so getMessages'
    // "createdAt <= leftAt" cap reliably includes the notice.
    const systemMessageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderId: currentUser._id,
      content,
      type: "system",
      systemAction: isSelfRemoval ? "member_left" : "member_removed",
      systemTargetId: isSelfRemoval ? undefined : args.userId,
      systemTargetName: isSelfRemoval ? undefined : removedName,
      isEdited: false,
      deletedForEveryone: false,
      createdAt: leftAt,
    });

    await ctx.db.patch(args.conversationId, {
      lastMessageId: systemMessageId,
      lastMessageTime: leftAt,
    });
  },
});

// Promote a member to admin. Any current admin can do this; idempotent
// if the target is already an admin.
export const promoteToAdmin = mutation({
  args: {
    conversationId: v.id("conversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireUser(ctx);

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || !conversation.isGroup) {
      throw new Error("Not a group conversation");
    }
    if (!isGroupAdminOf(conversation, currentUser._id)) {
      throw new Error("Only an admin can promote members");
    }

    const targetMembership = await getMembership(
      ctx,
      args.conversationId,
      args.userId,
    );
    if (!targetMembership) {
      throw new Error("User must be a group member");
    }

    const admins = getGroupAdminIds(conversation);
    if (admins.some((id) => id === args.userId)) return; // already admin

    const newAdmins = [...admins, args.userId];
    await ctx.db.patch(args.conversationId, {
      adminIds: newAdmins,
      // Keep legacy adminId pointed at *some* admin so older clients still
      // resolve a non-empty admin.
      adminId: conversation.adminId ?? args.userId,
    });
  },
});

// Demote an admin back to a regular member. Cannot demote the last admin
// — the group always needs at least one.
export const demoteFromAdmin = mutation({
  args: {
    conversationId: v.id("conversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireUser(ctx);

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || !conversation.isGroup) {
      throw new Error("Not a group conversation");
    }
    if (!isGroupAdminOf(conversation, currentUser._id)) {
      throw new Error("Only an admin can demote members");
    }

    const admins = getGroupAdminIds(conversation);
    if (admins.length <= 1) {
      throw new Error("Cannot demote the last admin");
    }
    if (!admins.some((id) => id === args.userId)) return; // already not admin

    const newAdmins = admins.filter((id) => id !== args.userId);
    await ctx.db.patch(args.conversationId, {
      adminIds: newAdmins,
      adminId:
        conversation.adminId === args.userId
          ? newAdmins[0]
          : conversation.adminId,
    });
  },
});

// Update group details. Any admin can edit name/image.
export const updateGroup = mutation({
  args: {
    conversationId: v.id("conversations"),
    name: v.optional(v.string()),
    groupImage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireUser(ctx);

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || !conversation.isGroup) {
      throw new Error("Not a group conversation");
    }
    if (!isGroupAdminOf(conversation, currentUser._id)) {
      throw new Error("Only an admin can update the group");
    }

    const updates: Partial<{ name: string; groupImage: string }> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.groupImage !== undefined) updates.groupImage = args.groupImage;

    await ctx.db.patch(args.conversationId, updates);
  },
});
