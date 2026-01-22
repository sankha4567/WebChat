import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Send a message
export const sendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.optional(v.string()),
    type: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("file"),
      v.literal("voice")
    ),
    fileStorageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    fileMimeType: v.optional(v.string()),
    voiceDuration: v.optional(v.number()),
    replyToId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) throw new Error("User not found");

    // Verify user is member of conversation
    const membership = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_and_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", currentUser._id)
      )
      .unique();

    if (!membership) throw new Error("Not a member of this conversation");

    // Get file URL if storage ID provided
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

    // Update conversation's last message
    await ctx.db.patch(args.conversationId, {
      lastMessageId: messageId,
      lastMessageTime: now,
    });

    // Update sender's read status
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) return [];

    // Verify membership
    const membership = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_and_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", currentUser._id)
      )
      .unique();

    if (!membership) return [];

    // Get deleted message IDs for this user
    const deletedForMe = await ctx.db
      .query("deletedMessages")
      .withIndex("by_user", (q) => q.eq("userId", currentUser._id))
      .collect();

    const deletedMessageIds = new Set(deletedForMe.map((d) => d.messageId));

    // Query messages
    let messagesQuery = ctx.db
      .query("messages")
      .withIndex("by_conversation_and_time", (q) => {
        return args.before
          ? q.eq("conversationId", args.conversationId).lt("createdAt", args.before)
          : q.eq("conversationId", args.conversationId);
      })
      .order("desc");

    const messages = await messagesQuery.take(args.limit || 50);

    // Enrich messages with sender info, reactions, reply-to message
    const enrichedMessages = await Promise.all(
      messages.map(async (message) => {
        // Skip if deleted for me
        if (deletedMessageIds.has(message._id)) {
          return null;
        }

        const sender = await ctx.db.get(message.senderId);

        // Get reactions
        const reactions = await ctx.db
          .query("reactions")
          .withIndex("by_message", (q) => q.eq("messageId", message._id))
          .collect();

        const reactionUsers = await Promise.all(
          reactions.map(async (r) => {
            const user = await ctx.db.get(r.userId);
            return { ...r, user };
          })
        );

        // Group reactions by emoji
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
            { emoji: string; users: (typeof reactionUsers)[0]["user"][]; count: number }
          >
        );

        // Get reply-to message if exists
        let replyTo = null;
        if (message.replyToId) {
          const replyMessage = await ctx.db.get(message.replyToId);
          if (replyMessage) {
            const replySender = await ctx.db.get(replyMessage.senderId);
            replyTo = { ...replyMessage, sender: replySender };
          }
        }

        // Get read receipts
        const readReceipts = await ctx.db
          .query("readReceipts")
          .withIndex("by_message", (q) => q.eq("messageId", message._id))
          .collect();

        return {
          ...message,
          sender,
          reactions: Object.values(groupedReactions),
          replyTo,
          readBy: readReceipts.length,
          isOwn: message.senderId === currentUser._id,
        };
      })
    );

    return enrichedMessages.filter(Boolean).reverse();
  },
});

// Edit a message
export const editMessage = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) throw new Error("User not found");

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    if (message.senderId !== currentUser._id) {
      throw new Error("Can only edit your own messages");
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) throw new Error("User not found");

    // Check if already deleted
    const existing = await ctx.db
      .query("deletedMessages")
      .withIndex("by_message_and_user", (q) =>
        q.eq("messageId", args.messageId).eq("userId", currentUser._id)
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

// Delete message for everyone
export const deleteMessageForEveryone = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) throw new Error("User not found");

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    if (message.senderId !== currentUser._id) {
      throw new Error("Can only delete your own messages for everyone");
    }

    // Delete from storage if it's a file
    if (message.fileStorageId) {
      await ctx.storage.delete(message.fileStorageId);
    }

    await ctx.db.patch(args.messageId, {
      deletedForEveryone: true,
      content: undefined,
      fileUrl: undefined,
      fileStorageId: undefined,
    });
  },
});

// Add reaction to message
export const addReaction = mutation({
  args: {
    messageId: v.id("messages"),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) throw new Error("User not found");

    // Check if already reacted with same emoji
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_message_and_user", (q) =>
        q.eq("messageId", args.messageId).eq("userId", currentUser._id)
      )
      .collect();
    
    const existing = reactions.find((r) => r.emoji === args.emoji);

    if (existing) {
      // Remove reaction (toggle)
      await ctx.db.delete(existing._id);
    } else {
      // Add reaction
      await ctx.db.insert("reactions", {
        messageId: args.messageId,
        userId: currentUser._id,
        emoji: args.emoji,
        createdAt: Date.now(),
      });
    }
  },
});

// Remove reaction
export const removeReaction = mutation({
  args: {
    messageId: v.id("messages"),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) throw new Error("User not found");

    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_message_and_user", (q) =>
        q.eq("messageId", args.messageId).eq("userId", currentUser._id)
      )
      .collect();
    
    const reaction = reactions.find((r) => r.emoji === args.emoji);

    if (reaction) {
      await ctx.db.delete(reaction._id);
    }
  },
});

// Search messages
export const searchMessages = query({
  args: { searchQuery: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) return [];

    if (args.searchQuery.trim() === "") return [];

    // Get user's conversations
    const memberships = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user", (q) => q.eq("userId", currentUser._id))
      .collect();

    const conversationIds = new Set(memberships.map((m) => m.conversationId));

    // Search messages
    const results = await ctx.db
      .query("messages")
      .withSearchIndex("search_messages", (q) =>
        q.search("content", args.searchQuery)
      )
      .take(50);

    // Filter to only user's conversations and enrich
    const filteredResults = await Promise.all(
      results
        .filter((m) => conversationIds.has(m.conversationId))
        .map(async (message) => {
          const conversation = await ctx.db.get(message.conversationId);
          const sender = await ctx.db.get(message.senderId);

          // Get other user for direct chats
          let otherUser = null;
          if (conversation && !conversation.isGroup) {
            const members = await ctx.db
              .query("conversationMembers")
              .withIndex("by_conversation", (q) =>
                q.eq("conversationId", conversation._id)
              )
              .collect();

            for (const m of members) {
              if (m.userId !== currentUser._id) {
                otherUser = await ctx.db.get(m.userId);
                break;
              }
            }
          }

          return {
            ...message,
            sender,
            conversation: conversation
              ? {
                  ...conversation,
                  otherUser,
                }
              : null,
          };
        })
    );

    return filteredResults;
  },
});

// Mark message as read
export const markMessageAsRead = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) throw new Error("User not found");

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    // Don't create read receipt for own messages
    if (message.senderId === currentUser._id) return;

    // Check if already read
    const existing = await ctx.db
      .query("readReceipts")
      .withIndex("by_message_and_user", (q) =>
        q.eq("messageId", args.messageId).eq("userId", currentUser._id)
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