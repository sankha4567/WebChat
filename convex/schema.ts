import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Users synced from Clerk
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    username: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    isOnline: v.boolean(),
    lastSeen: v.number(),
    // App-side bio/status the user can edit (Clerk owns name/email/avatar).
    status: v.optional(v.string()),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"])
    .index("by_username", ["username"])
    .searchIndex("search_users", {
      searchField: "username",
      filterFields: ["email"],
    }),

  // Conversations (direct or group)
  conversations: defineTable({
    name: v.optional(v.string()),
    isGroup: v.boolean(),
    groupImage: v.optional(v.string()),
    // Legacy single-admin field. New writes still set this for back-compat
    // (points at the most-recently-promoted admin) but adminIds is the
    // authoritative list.
    adminId: v.optional(v.id("users")),
    adminIds: v.optional(v.array(v.id("users"))),
    createdBy: v.id("users"),
    lastMessageId: v.optional(v.id("messages")),
    lastMessageTime: v.optional(v.number()),
    // Sorted "userIdA:userIdB" key for direct chats; lets us dedupe under
    // concurrent getOrCreateDirectConversation calls. Undefined for groups.
    directPairKey: v.optional(v.string()),
  })
    .index("by_last_message_time", ["lastMessageTime"])
    .index("by_direct_pair", ["directPairKey"]),

  // Conversation participants
  conversationMembers: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    joinedAt: v.number(),
    lastReadMessageId: v.optional(v.id("messages")),
    lastReadTime: v.optional(v.number()),
    isTyping: v.boolean(),
    notifications: v.boolean(),
    // Set when the user leaves or is removed. The row stays so the user
    // can still see the chat (read-only) up to leftAt — including the
    // "X removed you" system message inserted in the same transaction.
    leftAt: v.optional(v.number()),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_user", ["userId"])
    .index("by_conversation_and_user", ["conversationId", "userId"]),

  // Messages
  messages: defineTable({
    conversationId: v.id("conversations"),
    senderId: v.id("users"),
    content: v.optional(v.string()),
    type: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("file"),
      v.literal("voice"),
      v.literal("system"),
      // "reaction" rows are hidden from the chat thread but surface as the
      // conversation's last-message preview ("X reacted ❤️ to: 'hi'").
      v.literal("reaction")
    ),
    fileUrl: v.optional(v.string()),
    fileStorageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    fileMimeType: v.optional(v.string()),
    voiceDuration: v.optional(v.number()),
    replyToId: v.optional(v.id("messages")),
    isEdited: v.boolean(),
    editedAt: v.optional(v.number()),
    deletedForEveryone: v.boolean(),
    createdAt: v.number(),
    // For type === "reaction": which emoji and which message it reacted to.
    reactionEmoji: v.optional(v.string()),
    reactionTargetId: v.optional(v.id("messages")),
    // For type === "system": structured data so the client can render
    // "You added X" vs "John added X" per viewer. `content` still holds a
    // pre-formatted fallback for legacy rows.
    systemAction: v.optional(
      v.union(
        v.literal("group_created"),
        v.literal("member_added"),
        v.literal("member_removed"),
        v.literal("member_left"),
      ),
    ),
    systemTargetId: v.optional(v.id("users")),
    // Frozen snapshot of the target's display name at action time so the
    // history reads correctly even if that user later changes their name.
    systemTargetName: v.optional(v.string()),
    systemGroupName: v.optional(v.string()),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_and_time", ["conversationId", "createdAt"])
    .searchIndex("search_messages", {
      searchField: "content",
      filterFields: ["conversationId"],
    }),

  // Deleted messages (for "delete for me")
  deletedMessages: defineTable({
    messageId: v.id("messages"),
    userId: v.id("users"),
    deletedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_message_and_user", ["messageId", "userId"]),

  // Message reactions
  reactions: defineTable({
    messageId: v.id("messages"),
    userId: v.id("users"),
    emoji: v.string(),
    createdAt: v.number(),
  })
    .index("by_message", ["messageId"])
    .index("by_message_and_user", ["messageId", "userId"])
    .index("by_message_user_emoji", ["messageId", "userId", "emoji"]),

  // Message read receipts
  readReceipts: defineTable({
    messageId: v.id("messages"),
    userId: v.id("users"),
    readAt: v.number(),
  })
    .index("by_message", ["messageId"])
    .index("by_message_and_user", ["messageId", "userId"]),

  // "Heard" receipts for voice messages — tracked separately from reads so
  // the sender can see when recipient(s) actually listened (mic turns blue).
  voicePlays: defineTable({
    messageId: v.id("messages"),
    userId: v.id("users"),
    playedAt: v.number(),
  })
    .index("by_message", ["messageId"])
    .index("by_message_and_user", ["messageId", "userId"]),

  // Processed Clerk webhook IDs for idempotency on retries
  webhookEvents: defineTable({
    svixId: v.string(),
    processedAt: v.number(),
  }).index("by_svix_id", ["svixId"]),
});