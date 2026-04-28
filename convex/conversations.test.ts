import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

// Test fixture: seed two users (alice + bob) and return their docs/identities.
async function seedAliceAndBob(t: ReturnType<typeof convexTest>) {
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
  return {
    aliceId,
    bobId,
    asAlice: t.withIdentity({ subject: "alice-clerk" }),
    asBob: t.withIdentity({ subject: "bob-clerk" }),
  };
}

async function seedUser(
  t: ReturnType<typeof convexTest>,
  clerkId: string,
  username: string,
) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId,
      email: `${username}@example.com`,
      username,
      firstName: username,
      lastName: "Test",
      isOnline: false,
      lastSeen: 0,
    }),
  );
  return { userId, identity: t.withIdentity({ subject: clerkId }) };
}

describe("getOrCreateDirectConversation", () => {
  test("creates a new direct conversation and returns the same id on repeat", async () => {
    const t = convexTest(schema);
    const { aliceId, bobId, asAlice } = await seedAliceAndBob(t);

    const id1 = await asAlice.mutation(
      api.conversations.getOrCreateDirectConversation,
      { otherUserId: bobId },
    );
    const id2 = await asAlice.mutation(
      api.conversations.getOrCreateDirectConversation,
      { otherUserId: bobId },
    );
    expect(id2).toBe(id1);

    // Both members were inserted.
    const members = await t.run((ctx) =>
      ctx.db
        .query("conversationMembers")
        .withIndex("by_conversation", (q) => q.eq("conversationId", id1))
        .collect(),
    );
    expect(members.length).toBe(2);
    const memberIds = members.map((m) => m.userId).sort();
    expect(memberIds).toEqual([aliceId, bobId].sort());
  });

  test("rejects a self-chat", async () => {
    const t = convexTest(schema);
    const { aliceId, asAlice } = await seedAliceAndBob(t);

    await expect(
      asAlice.mutation(api.conversations.getOrCreateDirectConversation, {
        otherUserId: aliceId,
      }),
    ).rejects.toThrow(/yourself/);
  });
});

describe("createGroup", () => {
  test("creates a group with adminIds set to the creator and a system message", async () => {
    const t = convexTest(schema);
    const { aliceId, bobId, asAlice } = await seedAliceAndBob(t);

    const conversationId = await asAlice.mutation(api.conversations.createGroup, {
      name: "Hangout",
      memberIds: [bobId],
    });

    const conv = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conv?.isGroup).toBe(true);
    expect(conv?.name).toBe("Hangout");
    expect(conv?.adminIds).toEqual([aliceId]);
    expect(conv?.adminId).toBe(aliceId);

    // Creator + invited bob = 2 members.
    const members = await t.run((ctx) =>
      ctx.db
        .query("conversationMembers")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", conversationId),
        )
        .collect(),
    );
    expect(members.length).toBe(2);

    // System "group_created" message + lastMessage pointer set.
    const msgs = await t.run((ctx) =>
      ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", conversationId),
        )
        .collect(),
    );
    expect(msgs.length).toBe(1);
    expect(msgs[0].type).toBe("system");
    expect(msgs[0].systemAction).toBe("group_created");
    expect(conv?.lastMessageId).toBe(msgs[0]._id);
  });
});

describe("addGroupMember", () => {
  test("admin can add a new member; throws on duplicate active membership", async () => {
    const t = convexTest(schema);
    const { bobId, asAlice } = await seedAliceAndBob(t);
    const { userId: charlieId } = await seedUser(t, "charlie-clerk", "charlie");

    const conversationId = await asAlice.mutation(api.conversations.createGroup, {
      name: "G",
      memberIds: [bobId],
    });

    await asAlice.mutation(api.conversations.addGroupMember, {
      conversationId,
      userId: charlieId,
    });

    const memCount = await t.run(async (ctx) => {
      const all = await ctx.db
        .query("conversationMembers")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", conversationId),
        )
        .collect();
      return all.filter((m) => !m.leftAt).length;
    });
    expect(memCount).toBe(3);

    await expect(
      asAlice.mutation(api.conversations.addGroupMember, {
        conversationId,
        userId: charlieId,
      }),
    ).rejects.toThrow(/already a member/);
  });

  test("re-adding a soft-removed member clears their leftAt", async () => {
    const t = convexTest(schema);
    const { bobId, asAlice } = await seedAliceAndBob(t);

    const conversationId = await asAlice.mutation(api.conversations.createGroup, {
      name: "G",
      memberIds: [bobId],
    });

    await asAlice.mutation(api.conversations.removeGroupMember, {
      conversationId,
      userId: bobId,
    });

    const beforeReadd = await t.run(async (ctx) => {
      return await ctx.db
        .query("conversationMembers")
        .withIndex("by_conversation_and_user", (q) =>
          q.eq("conversationId", conversationId).eq("userId", bobId),
        )
        .unique();
    });
    expect(beforeReadd?.leftAt).toBeTypeOf("number");

    await asAlice.mutation(api.conversations.addGroupMember, {
      conversationId,
      userId: bobId,
    });

    const afterReadd = await t.run(async (ctx) => {
      return await ctx.db
        .query("conversationMembers")
        .withIndex("by_conversation_and_user", (q) =>
          q.eq("conversationId", conversationId).eq("userId", bobId),
        )
        .unique();
    });
    expect(afterReadd?.leftAt).toBeUndefined();
    // Same row was patched, not re-inserted.
    expect(afterReadd?._id).toBe(beforeReadd?._id);
  });
});

describe("removeGroupMember", () => {
  test("soft-removes by setting leftAt; row is preserved", async () => {
    const t = convexTest(schema);
    const { bobId, asAlice } = await seedAliceAndBob(t);

    const conversationId = await asAlice.mutation(api.conversations.createGroup, {
      name: "G",
      memberIds: [bobId],
    });

    await asAlice.mutation(api.conversations.removeGroupMember, {
      conversationId,
      userId: bobId,
    });

    const m = await t.run((ctx) =>
      ctx.db
        .query("conversationMembers")
        .withIndex("by_conversation_and_user", (q) =>
          q.eq("conversationId", conversationId).eq("userId", bobId),
        )
        .unique(),
    );
    expect(m).not.toBeNull();
    expect(m?.leftAt).toBeTypeOf("number");
  });

  test("rejects last-admin self-leave", async () => {
    const t = convexTest(schema);
    const { aliceId, bobId, asAlice } = await seedAliceAndBob(t);

    const conversationId = await asAlice.mutation(api.conversations.createGroup, {
      name: "G",
      memberIds: [bobId],
    });

    await expect(
      asAlice.mutation(api.conversations.removeGroupMember, {
        conversationId,
        userId: aliceId,
      }),
    ).rejects.toThrow(/only admin/i);
  });

  test("removing an admin cascades — they're stripped from adminIds", async () => {
    const t = convexTest(schema);
    const { bobId, asAlice } = await seedAliceAndBob(t);

    const conversationId = await asAlice.mutation(api.conversations.createGroup, {
      name: "G",
      memberIds: [bobId],
    });

    // Promote bob so we have two admins.
    await asAlice.mutation(api.conversations.promoteToAdmin, {
      conversationId,
      userId: bobId,
    });

    // Alice removes Bob.
    await asAlice.mutation(api.conversations.removeGroupMember, {
      conversationId,
      userId: bobId,
    });

    const conv = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conv?.adminIds?.includes(bobId)).toBe(false);
  });
});

describe("promoteToAdmin", () => {
  test("appends to adminIds; idempotent if already an admin", async () => {
    const t = convexTest(schema);
    const { aliceId, bobId, asAlice } = await seedAliceAndBob(t);

    const conversationId = await asAlice.mutation(api.conversations.createGroup, {
      name: "G",
      memberIds: [bobId],
    });

    await asAlice.mutation(api.conversations.promoteToAdmin, {
      conversationId,
      userId: bobId,
    });

    let conv = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conv?.adminIds).toEqual([aliceId, bobId]);

    // Idempotent: a second promote doesn't double up.
    await asAlice.mutation(api.conversations.promoteToAdmin, {
      conversationId,
      userId: bobId,
    });
    conv = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conv?.adminIds).toEqual([aliceId, bobId]);
  });
});

describe("demoteFromAdmin", () => {
  test("removes from adminIds when there's more than one admin", async () => {
    const t = convexTest(schema);
    const { aliceId, bobId, asAlice } = await seedAliceAndBob(t);

    const conversationId = await asAlice.mutation(api.conversations.createGroup, {
      name: "G",
      memberIds: [bobId],
    });

    await asAlice.mutation(api.conversations.promoteToAdmin, {
      conversationId,
      userId: bobId,
    });

    await asAlice.mutation(api.conversations.demoteFromAdmin, {
      conversationId,
      userId: bobId,
    });

    const conv = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conv?.adminIds).toEqual([aliceId]);
  });

  test("rejects when only one admin would remain... wait, sorry, when only one admin exists", async () => {
    const t = convexTest(schema);
    const { aliceId, bobId, asAlice } = await seedAliceAndBob(t);

    const conversationId = await asAlice.mutation(api.conversations.createGroup, {
      name: "G",
      memberIds: [bobId],
    });

    await expect(
      asAlice.mutation(api.conversations.demoteFromAdmin, {
        conversationId,
        userId: aliceId,
      }),
    ).rejects.toThrow(/last admin/);
  });
});

// Helper: sanity-check that an Id value is a non-empty string. The actual
// type comes from generated dataModel — runtime they are strings.
function assertId(id: Id<"conversations">) {
  expect(typeof id).toBe("string");
  expect((id as unknown as string).length).toBeGreaterThan(0);
}

describe("getOrCreateDirectConversation idempotency (cross-check)", () => {
  test("calling from either side returns the same conversation", async () => {
    const t = convexTest(schema);
    const { bobId, aliceId, asAlice, asBob } = await seedAliceAndBob(t);

    const fromAlice = await asAlice.mutation(
      api.conversations.getOrCreateDirectConversation,
      { otherUserId: bobId },
    );
    const fromBob = await asBob.mutation(
      api.conversations.getOrCreateDirectConversation,
      { otherUserId: aliceId },
    );
    assertId(fromAlice);
    expect(fromBob).toBe(fromAlice);
  });
});
