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
    adminId: v.optional(v.id("users")),
    createdBy: v.id("users"),
    lastMessageId: v.optional(v.id("messages")),
    lastMessageTime: v.optional(v.number()),
  }).index("by_last_message_time", ["lastMessageTime"]),

  // Conversation participants
  conversationMembers: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    joinedAt: v.number(),
    lastReadMessageId: v.optional(v.id("messages")),
    lastReadTime: v.optional(v.number()),
    isTyping: v.boolean(),
    notifications: v.boolean(),
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
      v.literal("system")
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
    .index("by_message_and_user", ["messageId", "userId"]),

  // Message read receipts
  readReceipts: defineTable({
    messageId: v.id("messages"),
    userId: v.id("users"),
    readAt: v.number(),
  })
    .index("by_message", ["messageId"])
    .index("by_message_and_user", ["messageId", "userId"]),
});