import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

// Shared fixture: creates a direct conversation between Alice and Bob with
// a system identity for each. Other tests build on this.
async function seedDirectChat() {
  const t = convexTest(schema);

  const aliceId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: "alice-clerk",
      email: "alice@example.com",
      username: "alice",
      firstName: "Alice",
      lastName: "Doe",
      isOnline: false,
      lastSeen: 0,
    }),
  );
  const bobId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: "bob-clerk",
      email: "bob@example.com",
      username: "bob",
      firstName: "Bob",
      lastName: "Loblaw",
      isOnline: false,
      lastSeen: 0,
    }),
  );

  const asAlice = t.withIdentity({ subject: "alice-clerk" });
  const asBob = t.withIdentity({ subject: "bob-clerk" });

  const conversationId = await asAlice.mutation(
    api.conversations.getOrCreateDirectConversation,
    { otherUserId: bobId },
  );

  return { t, aliceId, bobId, asAlice, asBob, conversationId };
}

async function seedGroupChat() {
  const t = convexTest(schema);
  const aliceId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: "alice-clerk",
      email: "alice@example.com",
      username: "alice",
      firstName: "Alice",
      lastName: "Doe",
      isOnline: false,
      lastSeen: 0,
    }),
  );
  const bobId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: "bob-clerk",
      email: "bob@example.com",
      username: "bob",
      firstName: "Bob",
      lastName: "Loblaw",
      isOnline: false,
      lastSeen: 0,
    }),
  );
  const charlieId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: "charlie-clerk",
      email: "charlie@example.com",
      username: "charlie",
      firstName: "Charlie",
      lastName: "Smith",
      isOnline: false,
      lastSeen: 0,
    }),
  );
  const asAlice = t.withIdentity({ subject: "alice-clerk" });
  const asBob = t.withIdentity({ subject: "bob-clerk" });
  const asCharlie = t.withIdentity({ subject: "charlie-clerk" });

  const conversationId = await asAlice.mutation(api.conversations.createGroup, {
    name: "G",
    memberIds: [bobId, charlieId],
  });

  return {
    t,
    aliceId,
    bobId,
    charlieId,
    asAlice,
    asBob,
    asCharlie,
    conversationId,
  };
}

describe("sendMessage", () => {
  test("inserts a message and updates the conversation's lastMessage", async () => {
    const { t, asAlice, conversationId } = await seedDirectChat();

    const messageId = await asAlice.mutation(api.messages.sendMessage, {
      conversationId,
      type: "text",
      content: "hello bob",
    });

    const message = await t.run((ctx) => ctx.db.get(messageId));
    expect(message?.content).toBe("hello bob");

    const conv = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conv?.lastMessageId).toBe(messageId);
    expect(typeof conv?.lastMessageTime).toBe("number");
  });

  test("rejects when the caller's membership has leftAt set", async () => {
    const { t, bobId, asAlice, asBob, conversationId } = await seedDirectChat();

    // Force-soft-remove Bob from this 1:1 to simulate a "removed" state.
    // (Direct chats don't natively remove, so we patch the row directly.)
    await t.run(async (ctx) => {
      const m = await ctx.db
        .query("conversationMembers")
        .withIndex("by_conversation_and_user", (q) =>
          q.eq("conversationId", conversationId).eq("userId", bobId),
        )
        .unique();
      if (m) await ctx.db.patch(m._id, { leftAt: Date.now() });
    });

    await expect(
      asBob.mutation(api.messages.sendMessage, {
        conversationId,
        type: "text",
        content: "still here",
      }),
    ).rejects.toThrow(/no longer in this conversation/);

    // Alice (still active) should still be able to send.
    await expect(
      asAlice.mutation(api.messages.sendMessage, {
        conversationId,
        type: "text",
        content: "ok",
      }),
    ).resolves.toBeDefined();
  });

  test("rejects a replyToId from a different conversation", async () => {
    const { t, asAlice, asBob, bobId, conversationId } = await seedDirectChat();

    // Create a second conversation Alice is *not* in: a group between Bob+Charlie.
    const charlieId = await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "charlie-clerk",
        email: "charlie@example.com",
        username: "charlie",
        firstName: "Charlie",
        lastName: "Smith",
        isOnline: false,
        lastSeen: 0,
      }),
    );
    const otherConvoId = await asBob.mutation(api.conversations.createGroup, {
      name: "Other",
      memberIds: [charlieId],
    });
    const otherMsgId = await asBob.mutation(api.messages.sendMessage, {
      conversationId: otherConvoId,
      type: "text",
      content: "from other",
    });

    await expect(
      asAlice.mutation(api.messages.sendMessage, {
        conversationId,
        type: "text",
        content: "reply",
        replyToId: otherMsgId,
      }),
    ).rejects.toThrow(/Invalid reply target/);

    // Suppress unused-var warnings on bobId — it's used implicitly via asBob.
    void bobId;
  });
});

describe("getMessages with leftAt cap", () => {
  test("a removed user only sees messages with createdAt <= their leftAt", async () => {
    const { t, asAlice, asBob, bobId, conversationId } = await seedGroupChat();

    // Pre-removal messages — should be visible to Bob.
    await asAlice.mutation(api.messages.sendMessage, {
      conversationId,
      type: "text",
      content: "before-1",
    });
    await asBob.mutation(api.messages.sendMessage, {
      conversationId,
      type: "text",
      content: "before-2",
    });

    // Remove Bob.
    await asAlice.mutation(api.conversations.removeGroupMember, {
      conversationId,
      userId: bobId,
    });

    // Post-removal message — should be hidden from Bob.
    await asAlice.mutation(api.messages.sendMessage, {
      conversationId,
      type: "text",
      content: "after",
    });

    const seenByBob = await asBob.query(api.messages.getMessages, {
      conversationId,
    });
    const contents = seenByBob
      .filter((m) => m.type === "text")
      .map((m) => m.content);
    expect(contents).toContain("before-1");
    expect(contents).toContain("before-2");
    expect(contents).not.toContain("after");

    // Sanity: there should also be a "X removed Y" system message.
    const sys = seenByBob.find(
      (m) => m.type === "system" && m.systemAction === "member_removed",
    );
    expect(sys).toBeDefined();

    // Suppress unused-var warning.
    void t;
  });
});

describe("addReaction toggle", () => {
  test("first call inserts a reactions row + a hidden 'reaction' message; second call toggles off without re-emitting", async () => {
    const { t, asAlice, asBob, conversationId } = await seedDirectChat();

    const messageId = await asAlice.mutation(api.messages.sendMessage, {
      conversationId,
      type: "text",
      content: "first",
    });

    await asBob.mutation(api.messages.addReaction, {
      messageId,
      emoji: "❤️",
    });

    const reactionsAfterFirst = await t.run((ctx) =>
      ctx.db
        .query("reactions")
        .withIndex("by_message", (q) => q.eq("messageId", messageId))
        .collect(),
    );
    expect(reactionsAfterFirst.length).toBe(1);

    const reactionMessages = await t.run(async (ctx) => {
      const all = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", conversationId),
        )
        .collect();
      return all.filter((m) => m.type === "reaction");
    });
    expect(reactionMessages.length).toBe(1);
    expect(reactionMessages[0].reactionEmoji).toBe("❤️");
    expect(reactionMessages[0].reactionTargetId).toBe(messageId);

    // Toggle off.
    await asBob.mutation(api.messages.addReaction, {
      messageId,
      emoji: "❤️",
    });

    const reactionsAfterToggle = await t.run((ctx) =>
      ctx.db
        .query("reactions")
        .withIndex("by_message", (q) => q.eq("messageId", messageId))
        .collect(),
    );
    expect(reactionsAfterToggle.length).toBe(0);

    // No new "reaction"-type message was emitted on toggle-off.
    const reactionMessagesAfterToggle = await t.run(async (ctx) => {
      const all = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", conversationId),
        )
        .collect();
      return all.filter((m) => m.type === "reaction");
    });
    expect(reactionMessagesAfterToggle.length).toBe(1);
  });
});

describe("markVoiceAsPlayed", () => {
  test("no-op when the caller is the sender", async () => {
    const { t, aliceId, asAlice, conversationId } = await seedDirectChat();

    const voiceMsgId = await asAlice.mutation(api.messages.sendMessage, {
      conversationId,
      type: "voice",
      voiceDuration: 3,
    });

    await asAlice.mutation(api.messages.markVoiceAsPlayed, {
      messageId: voiceMsgId,
    });

    const plays = await t.run((ctx) =>
      ctx.db
        .query("voicePlays")
        .withIndex("by_message", (q) => q.eq("messageId", voiceMsgId))
        .collect(),
    );
    expect(plays.length).toBe(0);

    void aliceId;
  });

  test("idempotent for a recipient — only one row regardless of clicks", async () => {
    const { t, asAlice, asBob, conversationId } = await seedDirectChat();

    const voiceMsgId = await asAlice.mutation(api.messages.sendMessage, {
      conversationId,
      type: "voice",
      voiceDuration: 5,
    });

    await asBob.mutation(api.messages.markVoiceAsPlayed, {
      messageId: voiceMsgId,
    });
    await asBob.mutation(api.messages.markVoiceAsPlayed, {
      messageId: voiceMsgId,
    });

    const plays = await t.run((ctx) =>
      ctx.db
        .query("voicePlays")
        .withIndex("by_message", (q) => q.eq("messageId", voiceMsgId))
        .collect(),
    );
    expect(plays.length).toBe(1);
  });
});

describe("clearConversationForMe", () => {
  test("inserts a deletedMessages row for every existing message and is idempotent", async () => {
    const { t, aliceId, asAlice, asBob, conversationId } = await seedDirectChat();

    await asAlice.mutation(api.messages.sendMessage, {
      conversationId,
      type: "text",
      content: "1",
    });
    await asBob.mutation(api.messages.sendMessage, {
      conversationId,
      type: "text",
      content: "2",
    });
    await asAlice.mutation(api.messages.sendMessage, {
      conversationId,
      type: "text",
      content: "3",
    });

    await asAlice.mutation(api.messages.clearConversationForMe, {
      conversationId,
    });

    const aliceDeletes = await t.run((ctx) =>
      ctx.db
        .query("deletedMessages")
        .withIndex("by_user", (q) => q.eq("userId", aliceId))
        .collect(),
    );
    // 3 messages → 3 hide entries.
    expect(aliceDeletes.length).toBe(3);

    // Second call is a no-op (no duplicates).
    await asAlice.mutation(api.messages.clearConversationForMe, {
      conversationId,
    });
    const aliceDeletesAgain = await t.run((ctx) =>
      ctx.db
        .query("deletedMessages")
        .withIndex("by_user", (q) => q.eq("userId", aliceId))
        .collect(),
    );
    expect(aliceDeletesAgain.length).toBe(3);

    // Bob's view is unaffected.
    const bobMessages = await asBob.query(api.messages.getMessages, {
      conversationId,
    });
    const bobTextCount = bobMessages.filter((m) => m.type === "text").length;
    expect(bobTextCount).toBe(3);
  });
});

describe("deleteMessageForEveryone", () => {
  test("sender can delete their own message and reactions/receipts cascade", async () => {
    const { t, asAlice, asBob, conversationId } = await seedDirectChat();

    const messageId = await asAlice.mutation(api.messages.sendMessage, {
      conversationId,
      type: "text",
      content: "deleteme",
    });

    await asBob.mutation(api.messages.addReaction, {
      messageId,
      emoji: "👍",
    });
    await asBob.mutation(api.messages.markMessageAsRead, { messageId });

    await asAlice.mutation(api.messages.deleteMessageForEveryone, {
      messageId,
    });

    const stored = await t.run((ctx) => ctx.db.get(messageId));
    expect(stored?.deletedForEveryone).toBe(true);
    expect(stored?.content).toBeUndefined();

    const reactions = await t.run((ctx) =>
      ctx.db
        .query("reactions")
        .withIndex("by_message", (q) => q.eq("messageId", messageId))
        .collect(),
    );
    expect(reactions.length).toBe(0);

    const receipts = await t.run((ctx) =>
      ctx.db
        .query("readReceipts")
        .withIndex("by_message", (q) => q.eq("messageId", messageId))
        .collect(),
    );
    expect(receipts.length).toBe(0);
  });

  test("group admin can delete someone else's message", async () => {
    const { asAlice, asBob, conversationId } = await seedGroupChat();

    const bobMsgId = await asBob.mutation(api.messages.sendMessage, {
      conversationId,
      type: "text",
      content: "from bob",
    });

    // Alice is the group admin (creator) — should succeed.
    await expect(
      asAlice.mutation(api.messages.deleteMessageForEveryone, {
        messageId: bobMsgId,
      }),
    ).resolves.toBeNull();
  });

  test("non-sender non-admin cannot delete for everyone", async () => {
    const { asBob, asCharlie, conversationId } = await seedGroupChat();

    const bobMsgId = await asBob.mutation(api.messages.sendMessage, {
      conversationId,
      type: "text",
      content: "from bob",
    });

    await expect(
      asCharlie.mutation(api.messages.deleteMessageForEveryone, {
        messageId: bobMsgId,
      }),
    ).rejects.toThrow(/sender or group admin/i);
  });
});

// Sanity: ids are runtime strings.
test("Convex ids are strings at runtime (sanity check)", async () => {
  const { conversationId } = await seedDirectChat();
  const asString: string = conversationId as unknown as string;
  expect(typeof asString).toBe("string");
});
