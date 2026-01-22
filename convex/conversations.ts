import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get or create a direct conversation between two users
export const getOrCreateDirectConversation = mutation({
  args: { otherUserId: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) throw new Error("User not found");

    // Find existing direct conversation
    const myMemberships = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user", (q) => q.eq("userId", currentUser._id))
      .collect();

    for (const membership of myMemberships) {
      const conversation = await ctx.db.get(membership.conversationId);
      if (!conversation || conversation.isGroup) continue;

      const otherMembership = await ctx.db
        .query("conversationMembers")
        .withIndex("by_conversation_and_user", (q) =>
          q
            .eq("conversationId", conversation._id)
            .eq("userId", args.otherUserId)
        )
        .unique();

      if (otherMembership) {
        return conversation._id;
      }
    }

    // Create new conversation
    const conversationId = await ctx.db.insert("conversations", {
      isGroup: false,
      createdBy: currentUser._id,
    });

    // Add both users as members
    const now = Date.now();
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) throw new Error("User not found");

    const conversationId = await ctx.db.insert("conversations", {
      name: args.name,
      isGroup: true,
      groupImage: args.groupImage,
      adminId: currentUser._id,
      createdBy: currentUser._id,
    });

    const now = Date.now();

    // Add creator as member
    await ctx.db.insert("conversationMembers", {
      conversationId,
      userId: currentUser._id,
      joinedAt: now,
      isTyping: false,
      notifications: true,
    });

    // Add other members
    for (const memberId of args.memberIds) {
      await ctx.db.insert("conversationMembers", {
        conversationId,
        userId: memberId,
        joinedAt: now,
        isTyping: false,
        notifications: true,
      });
    }

    // Create system message
    await ctx.db.insert("messages", {
      conversationId,
      senderId: currentUser._id,
      content: `${currentUser.username} created the group "${args.name}"`,
      type: "system",
      isEdited: false,
      deletedForEveryone: false,
      createdAt: now,
    });

    return conversationId;
  },
});

// Get all conversations for current user with unread counts
export const getConversations = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) return [];

    const memberships = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user", (q) => q.eq("userId", currentUser._id))
      .collect();

    const conversations = await Promise.all(
      memberships.map(async (membership) => {
        const conversation = await ctx.db.get(membership.conversationId);
        if (!conversation) return null;

        // Get other members
        const allMembers = await ctx.db
          .query("conversationMembers")
          .withIndex("by_conversation", (q) =>
            q.eq("conversationId", conversation._id)
          )
          .collect();

        const memberUsers = await Promise.all(
          allMembers.map(async (m) => {
            const user = await ctx.db.get(m.userId);
            return user ? { ...user, isTyping: m.isTyping } : null;
          })
        );

        // Get last message
        let lastMessage = null;
        if (conversation.lastMessageId) {
          lastMessage = await ctx.db.get(conversation.lastMessageId);
          if (lastMessage) {
            const sender = await ctx.db.get(lastMessage.senderId);
            lastMessage = { ...lastMessage, sender };
          }
        }

        // Calculate unread count
        const lastReadTime = membership.lastReadTime || 0;
        const unreadMessages = await ctx.db
          .query("messages")
          .withIndex("by_conversation_and_time", (q) =>
            q
              .eq("conversationId", conversation._id)
              .gt("createdAt", lastReadTime)
          )
          .filter((q) =>
            q.and(
              q.neq(q.field("senderId"), currentUser._id),
              q.eq(q.field("deletedForEveryone"), false)
            )
          )
          .collect();

        // Get typing users (excluding current user)
        const typingUsers = memberUsers.filter(
          (m) => m && m._id !== currentUser._id && m.isTyping
        );

        // For direct chats, get the other user
        const otherUser = !conversation.isGroup
          ? memberUsers.find((m) => m && m._id !== currentUser._id)
          : null;

        return {
          ...conversation,
          members: memberUsers.filter(Boolean),
          otherUser,
          lastMessage,
          unreadCount: unreadMessages.length,
          typingUsers,
          membership,
        };
      })
    );

    return conversations
      .filter(Boolean)
      .sort((a, b) => (b?.lastMessageTime || 0) - (a?.lastMessageTime || 0));
  },
});

// Get single conversation details
export const getConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) return null;

    // Check if user is member
    const membership = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_and_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", currentUser._id)
      )
      .unique();

    if (!membership) return null;

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) return null;

    // Get all members
    const allMembers = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversation._id)
      )
      .collect();

    const memberUsers = await Promise.all(
      allMembers.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        return user ? { ...user, isTyping: m.isTyping, membership: m } : null;
      })
    );

    const otherUser = !conversation.isGroup
      ? memberUsers.find((m) => m && m._id !== currentUser._id)
      : null;

    const typingUsers = memberUsers
      .filter((m) => m !== null && m._id !== currentUser._id && m.isTyping)
      .filter(Boolean); // Extra safety to ensure no nulls

    return {
      ...conversation,
      members: memberUsers.filter(Boolean),
      otherUser,
      typingUsers,
      currentMembership: membership,
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) throw new Error("User not found");

    const membership = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_and_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", currentUser._id)
      )
      .unique();

    if (membership) {
      await ctx.db.patch(membership._id, { isTyping: args.isTyping });
    }
  },
});

// Mark conversation as read
export const markAsRead = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) throw new Error("User not found");

    const membership = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_and_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", currentUser._id)
      )
      .unique();

    if (membership) {
      const conversation = await ctx.db.get(args.conversationId);
      await ctx.db.patch(membership._id, {
        lastReadMessageId: conversation?.lastMessageId,
        lastReadTime: Date.now(),
      });
    }
  },
});

// Add member to group
export const addGroupMember = mutation({
  args: {
    conversationId: v.id("conversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) throw new Error("User not found");

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || !conversation.isGroup) {
      throw new Error("Not a group conversation");
    }

    if (conversation.adminId !== currentUser._id) {
      throw new Error("Only admin can add members");
    }

    // Check if already member
    const existingMembership = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_and_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", args.userId)
      )
      .unique();

    if (existingMembership) {
      throw new Error("User is already a member");
    }

    const newUser = await ctx.db.get(args.userId);
    const now = Date.now();

    await ctx.db.insert("conversationMembers", {
      conversationId: args.conversationId,
      userId: args.userId,
      joinedAt: now,
      isTyping: false,
      notifications: true,
    });

    // Create system message
    await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderId: currentUser._id,
      content: `${currentUser.username} added ${newUser?.username}`,
      type: "system",
      isEdited: false,
      deletedForEveryone: false,
      createdAt: now,
    });
  },
});

// Remove member from group
export const removeGroupMember = mutation({
  args: {
    conversationId: v.id("conversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) throw new Error("User not found");

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || !conversation.isGroup) {
      throw new Error("Not a group conversation");
    }

    // Allow self-removal or admin removal
    if (
      args.userId !== currentUser._id &&
      conversation.adminId !== currentUser._id
    ) {
      throw new Error("Not authorized");
    }

    const membership = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_and_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", args.userId)
      )
      .unique();

    if (membership) {
      await ctx.db.delete(membership._id);

      const removedUser = await ctx.db.get(args.userId);
      const now = Date.now();

      // Create system message
      const content =
        args.userId === currentUser._id
          ? `${currentUser.username} left the group`
          : `${currentUser.username} removed ${removedUser?.username}`;

      await ctx.db.insert("messages", {
        conversationId: args.conversationId,
        senderId: currentUser._id,
        content,
        type: "system",
        isEdited: false,
        deletedForEveryone: false,
        createdAt: now,
      });
    }
  },
});

// Update group details
export const updateGroup = mutation({
  args: {
    conversationId: v.id("conversations"),
    name: v.optional(v.string()),
    groupImage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) throw new Error("User not found");

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || !conversation.isGroup) {
      throw new Error("Not a group conversation");
    }

    if (conversation.adminId !== currentUser._id) {
      throw new Error("Only admin can update group");
    }

    const updates: Partial<{ name: string; groupImage: string }> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.groupImage !== undefined) updates.groupImage = args.groupImage;

    await ctx.db.patch(args.conversationId, updates);
  },
});