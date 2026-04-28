import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import {
  getOptionalUser,
  isGroupAdminOf,
  requireMembership,
  requireUser,
} from "./utils";
import { QueryCtx } from "./_generated/server";

// Cache repeated db.get(userId) lookups inside a single query handler.
function makeUserCache(ctx: QueryCtx) {
  const cache = new Map<Id<"users">, Doc<"users"> | null>();
  return async (id: Id<"users">) => {
    if (cache.has(id)) return cache.get(id)!;
    const user = await ctx.db.get(id);
    cache.set(id, user);
    return user;
  };
}

// Send a message
export const sendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.optional(v.string()),
    type: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("file"),
      v.literal("voice"),
    ),
    fileStorageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    fileMimeType: v.optional(v.string()),
    voiceDuration: v.optional(v.number()),
    replyToId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireUser(ctx);
    const membership = await requireMembership(
      ctx,
      args.conversationId,
      currentUser._id,
    );
    if (membership.leftAt) {
      throw new Error("You're no longer in this conversation");
    }

    // Validate the reply target belongs to the same conversation — otherwise
    // a stale replyTo from a prior chat could leak into this one.
    if (args.replyToId) {
      const replyTarget = await ctx.db.get(args.replyToId);
      if (!replyTarget || replyTarget.conversationId !== args.conversationId) {
        throw new Error("Invalid reply target");
      }
    }

    let fileUrl: string | undefined;
    if (args.fileStorageId) {
      fileUrl = (await ctx.storage.getUrl(args.fileStorageId)) ?? undefined;
    }

    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderId: currentUser._id,
      content: args.content,
      type: args.type,
      fileUrl,
      fileStorageId: args.fileStorageId,
      fileName: args.fileName,
      fileSize: args.fileSize,
      fileMimeType: args.fileMimeType,
      voiceDuration: args.voiceDuration,
      replyToId: args.replyToId,
      isEdited: false,
      deletedForEveryone: false,
      createdAt: now,
    });

    await ctx.db.patch(args.conversationId, {
      lastMessageId: messageId,
      lastMessageTime: now,
    });

    await ctx.db.patch(membership._id, {
      lastReadMessageId: messageId,
      lastReadTime: now,
      isTyping: false,
    });

    return messageId;
  },
});

// Get messages for a conversation
export const getMessages = query({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
    before: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const currentUser = await getOptionalUser(ctx);
    if (!currentUser) return [];

    const membership = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_and_user", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("userId", currentUser._id),
      )
      .unique();
    if (!membership) return [];

    const deletedForMe = await ctx.db
      .query("deletedMessages")
      .withIndex("by_user", (q) => q.eq("userId", currentUser._id))
      .collect();
    const deletedMessageIds = new Set(deletedForMe.map((d) => d.messageId));

    // Soft-removed users see messages only up through their leftAt instant
    // (which includes the "X removed you" / "You left" system notice).
    const messagesQuery = ctx.db
      .query("messages")
      .withIndex("by_conversation_and_time", (q) => {
        const base = q.eq("conversationId", args.conversationId);
        if (
          membership.leftAt !== undefined &&
          args.before !== undefined &&
          args.before <= membership.leftAt
        ) {
          // Pagination cursor is tighter than leftAt — strict < before.
          return base.lt("createdAt", args.before);
        }
        if (membership.leftAt !== undefined) {
          return base.lte("createdAt", membership.leftAt);
        }
        if (args.before !== undefined) {
          return base.lt("createdAt", args.before);
        }
        return base;
      })
      .order("desc");

    const messages = await messagesQuery.take(args.limit || 50);
    const getUser = makeUserCache(ctx);

    // Precompute recipient info once so own-message ticks are cheap:
    //   - 1 gray tick   when no recipient is online (sent)
    //   - 2 gray ticks  when at least one recipient is online but not yet read
    //   - 2 blue ticks  when every recipient has read past the message time
    const allMembers = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();
    const otherMembers = allMembers.filter(
      (m) => m.userId !== currentUser._id,
    );
    const otherUserDocs = await Promise.all(
      otherMembers.map((m) => getUser(m.userId)),
    );
    const anyRecipientOnline = otherUserDocs.some((u) => u?.isOnline === true);

    // Batch-fetch voicePlays for every voice message in the page. One Set
    // of player userIds per message lets us answer both:
    //   - own messages: have all recipients heard it? (playedByRecipient)
    //   - incoming messages: have I heard it? (playedByMe)
    const allVoiceIds = messages
      .filter((m) => m.type === "voice")
      .map((m) => m._id);
    const playsPerMessage = new Map<Id<"messages">, Set<Id<"users">>>();
    await Promise.all(
      allVoiceIds.map(async (id) => {
        const plays = await ctx.db
          .query("voicePlays")
          .withIndex("by_message", (q) => q.eq("messageId", id))
          .collect();
        playsPerMessage.set(id, new Set(plays.map((p) => p.userId)));
      }),
    );

    const enrichedMessages = await Promise.all(
      messages.map(async (message) => {
        if (deletedMessageIds.has(message._id)) return null;
        // Reaction rows are surfaced only as the conversation's last-message
        // preview in the sidebar; never as bubbles in the chat thread.
        if (message.type === "reaction") return null;

        const sender = await getUser(message.senderId);

        const reactions = await ctx.db
          .query("reactions")
          .withIndex("by_message", (q) => q.eq("messageId", message._id))
          .collect();

        const reactionUsers = await Promise.all(
          reactions.map(async (r) => ({ ...r, user: await getUser(r.userId) })),
        );

        const groupedReactions = reactionUsers.reduce(
          (acc, r) => {
            if (!acc[r.emoji]) {
              acc[r.emoji] = { emoji: r.emoji, users: [], count: 0 };
            }
            acc[r.emoji].users.push(r.user);
            acc[r.emoji].count++;
            return acc;
          },
          {} as Record<
            string,
            {
              emoji: string;
              users: (typeof reactionUsers)[0]["user"][];
              count: number;
            }
          >,
        );

        let replyTo = null;
        if (message.replyToId) {
          const replyMessage = await ctx.db.get(message.replyToId);
          if (replyMessage) {
            const replySender = await getUser(replyMessage.senderId);
            replyTo = { ...replyMessage, sender: replySender };
          }
        }

        const readReceipts = await ctx.db
          .query("readReceipts")
          .withIndex("by_message", (q) => q.eq("messageId", message._id))
          .collect();

        const isOwn = message.senderId === currentUser._id;
        // Read state is derived from each member's lastReadTime (cheap and
        // already maintained by markAsRead). readReceipts.length stays in
        // the payload for older callers but isn't used for own-tick logic.
        const readByAll =
          isOwn && otherMembers.length > 0
            ? otherMembers.every(
                (m) => (m.lastReadTime ?? 0) >= message.createdAt,
              )
            : false;

        // Voice-played state for the sender's own voice messages — true only
        // when *every* recipient has a voicePlays entry.
        let playedByRecipient = false;
        // Mirror flag for the receiver side — true if the current user has
        // already heard this incoming voice message. Persists across reloads
        // so the dot stays blue.
        let playedByMe = false;
        if (message.type === "voice") {
          const players = playsPerMessage.get(message._id) ?? new Set();
          if (isOwn && otherMembers.length > 0) {
            playedByRecipient = otherMembers.every((m) =>
              players.has(m.userId),
            );
          } else if (!isOwn) {
            playedByMe = players.has(currentUser._id);
          }
        }

        // Used by the client to render "you" in system-message templates
        // ("X added you" / "You removed Y" etc).
        const systemTargetIsMe =
          message.type === "system" &&
          message.systemTargetId === currentUser._id;

        return {
          ...message,
          sender,
          reactions: Object.values(groupedReactions),
          replyTo,
          readBy: readReceipts.length,
          readByAll,
          anyRecipientOnline,
          playedByRecipient,
          playedByMe,
          systemTargetIsMe,
          isOwn,
        };
      }),
    );

    return enrichedMessages
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .reverse();
  },
});

// Edit a message
export const editMessage = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireUser(ctx);
    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");
    if (message.senderId !== currentUser._id) {
      throw new Error("Can only edit your own messages");
    }
    if (message.deletedForEveryone) {
      throw new Error("Cannot edit a deleted message");
    }
    if (message.type !== "text") {
      throw new Error("Can only edit text messages");
    }

    await ctx.db.patch(args.messageId, {
      content: args.content,
      isEdited: true,
      editedAt: Date.now(),
    });
  },
});

// Delete message for me
export const deleteMessageForMe = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const currentUser = await requireUser(ctx);

    const existing = await ctx.db
      .query("deletedMessages")
      .withIndex("by_message_and_user", (q) =>
        q.eq("messageId", args.messageId).eq("userId", currentUser._id),
      )
      .unique();

    if (!existing) {
      await ctx.db.insert("deletedMessages", {
        messageId: args.messageId,
        userId: currentUser._id,
        deletedAt: Date.now(),
      });
    }
  },
});

// Delete message for everyone — idempotent and cascades to reactions/receipts.
// Allowed for: the message sender, OR the admin of a group conversation.
export const deleteMessageForEveryone = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const currentUser = await requireUser(ctx);

    const message = await ctx.db.get(args.messageId);
    if (!message) return;
    if (message.deletedForEveryone) return;

    const isSender = message.senderId === currentUser._id;
    if (!isSender) {
      const conv = await ctx.db.get(message.conversationId);
      const isGroupAdmin =
        conv?.isGroup === true && isGroupAdminOf(conv, currentUser._id);
      if (!isGroupAdmin) {
        throw new Error(
          "Only the sender or group admin can delete for everyone",
        );
      }
    }

    if (message.fileStorageId) {
      try {
        await ctx.storage.delete(message.fileStorageId);
      } catch {
        // Already gone — proceed with the flag flip anyway.
      }
    }

    // Cascade-delete reactions and read receipts so they don't dangle.
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .collect();
    for (const r of reactions) await ctx.db.delete(r._id);

    const receipts = await ctx.db
      .query("readReceipts")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .collect();
    for (const r of receipts) await ctx.db.delete(r._id);

    await ctx.db.patch(args.messageId, {
      deletedForEveryone: true,
      content: undefined,
      fileUrl: undefined,
      fileStorageId: undefined,
    });
  },
});

// Add reaction to message (toggle).
// Uses a 3-column index so the existence check is exact and atomic against
// concurrent identical clicks.
//
// On *new* reactions we also drop a hidden "reaction" message into the
// conversation and bump lastMessage, so the sidebar can render
// "X reacted ❤️ to: 'preview'" (WhatsApp-style). Toggling off a reaction
// does not generate a notification.
export const addReaction = mutation({
  args: {
    messageId: v.id("messages"),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireUser(ctx);

    const existing = await ctx.db
      .query("reactions")
      .withIndex("by_message_user_emoji", (q) =>
        q
          .eq("messageId", args.messageId)
          .eq("userId", currentUser._id)
          .eq("emoji", args.emoji),
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return;
    }

    const target = await ctx.db.get(args.messageId);
    if (!target) throw new Error("Message not found");

    // Reactor must be a member of the conversation. (Defense-in-depth — they
    // wouldn't see the message otherwise, but enforce server-side anyway.)
    await requireMembership(ctx, target.conversationId, currentUser._id);

    await ctx.db.insert("reactions", {
      messageId: args.messageId,
      userId: currentUser._id,
      emoji: args.emoji,
      createdAt: Date.now(),
    });

    // Build a short preview of the target message for the sidebar.
    const preview =
      target.type === "text"
        ? target.content?.slice(0, 60) || ""
        : target.type === "image"
          ? "image"
          : target.type === "file"
            ? target.fileName || "file"
            : target.type === "voice"
              ? "voice message"
              : "message";

    const now = Date.now();
    const reactionMsgId = await ctx.db.insert("messages", {
      conversationId: target.conversationId,
      senderId: currentUser._id,
      type: "reaction",
      content: preview,
      reactionEmoji: args.emoji,
      reactionTargetId: args.messageId,
      isEdited: false,
      deletedForEveryone: false,
      createdAt: now,
    });

    await ctx.db.patch(target.conversationId, {
      lastMessageId: reactionMsgId,
      lastMessageTime: now,
    });
  },
});

// Remove reaction
export const removeReaction = mutation({
  args: {
    messageId: v.id("messages"),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireUser(ctx);

    const reaction = await ctx.db
      .query("reactions")
      .withIndex("by_message_user_emoji", (q) =>
        q
          .eq("messageId", args.messageId)
          .eq("userId", currentUser._id)
          .eq("emoji", args.emoji),
      )
      .unique();

    if (reaction) await ctx.db.delete(reaction._id);
  },
});

// Search messages — runs the search per conversation the user belongs to,
// using the schema's `filterFields: ["conversationId"]`. This avoids the
// previous bug where the global top-50 could be dominated by other users'
// messages, leaving the caller with zero or wrong results after filtering.
export const searchMessages = query({
  args: { searchQuery: v.string() },
  handler: async (ctx, args) => {
    const currentUser = await getOptionalUser(ctx);
    if (!currentUser) return [];

    const trimmed = args.searchQuery.trim();
    if (trimmed === "") return [];

    const memberships = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user", (q) => q.eq("userId", currentUser._id))
      .collect();

    const perConvLimit = 10;
    const totalLimit = 50;
    const getUser = makeUserCache(ctx);

    const allHits: Doc<"messages">[] = [];
    for (const m of memberships) {
      const hits = await ctx.db
        .query("messages")
        .withSearchIndex("search_messages", (q) =>
          q.search("content", trimmed).eq("conversationId", m.conversationId),
        )
        .take(perConvLimit);
      allHits.push(...hits);
    }

    allHits.sort((a, b) => b.createdAt - a.createdAt);
    const top = allHits.slice(0, totalLimit);

    return await Promise.all(
      top.map(async (message) => {
        const conversation = await ctx.db.get(message.conversationId);
        const sender = await getUser(message.senderId);

        let otherUser: Doc<"users"> | null = null;
        if (conversation && !conversation.isGroup) {
          const members = await ctx.db
            .query("conversationMembers")
            .withIndex("by_conversation", (q) =>
              q.eq("conversationId", conversation._id),
            )
            .collect();
          for (const mem of members) {
            if (mem.userId !== currentUser._id) {
              otherUser = await getUser(mem.userId);
              break;
            }
          }
        }

        return {
          ...message,
          sender,
          conversation: conversation ? { ...conversation, otherUser } : null,
        };
      }),
    );
  },
});

// Mark a voice message as played (heard) by the current user. Only
// recipients record plays — the sender re-listening to their own message
// must not flip the indicator on the other side.
export const markVoiceAsPlayed = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const currentUser = await requireUser(ctx);

    const message = await ctx.db.get(args.messageId);
    if (!message || message.type !== "voice") return;
    if (message.senderId === currentUser._id) return;

    const existing = await ctx.db
      .query("voicePlays")
      .withIndex("by_message_and_user", (q) =>
        q.eq("messageId", args.messageId).eq("userId", currentUser._id),
      )
      .unique();
    if (existing) return;

    await ctx.db.insert("voicePlays", {
      messageId: args.messageId,
      userId: currentUser._id,
      playedAt: Date.now(),
    });
  },
});

// Clear all messages from the current user's view of a conversation.
// Inserts deletedMessages rows for every existing message they haven't
// already deleted-for-me, leaving the conversation visible but empty for
// the current user. Other participants are unaffected.
export const clearConversationForMe = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const currentUser = await requireUser(ctx);

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();

    const existing = await ctx.db
      .query("deletedMessages")
      .withIndex("by_user", (q) => q.eq("userId", currentUser._id))
      .collect();
    const alreadyHidden = new Set(existing.map((d) => d.messageId));

    const now = Date.now();
    for (const m of messages) {
      if (alreadyHidden.has(m._id)) continue;
      await ctx.db.insert("deletedMessages", {
        messageId: m._id,
        userId: currentUser._id,
        deletedAt: now,
      });
    }
  },
});

// Mark message as read
export const markMessageAsRead = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const currentUser = await requireUser(ctx);

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");
    if (message.senderId === currentUser._id) return;

    const existing = await ctx.db
      .query("readReceipts")
      .withIndex("by_message_and_user", (q) =>
        q.eq("messageId", args.messageId).eq("userId", currentUser._id),
      )
      .unique();

    if (!existing) {
      await ctx.db.insert("readReceipts", {
        messageId: args.messageId,
        userId: currentUser._id,
        readAt: Date.now(),
      });
    }
  },
});
