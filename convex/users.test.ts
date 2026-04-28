import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

describe("upsertUser", () => {
  test("inserts a user on first call", async () => {
    const t = convexTest(schema);

    const userId = await t.mutation(internal.users.upsertUser, {
      clerkId: "user_clerk_alice",
      email: "alice@example.com",
      username: "alice",
      firstName: "Alice",
      lastName: "Doe",
      imageUrl: "https://example.com/a.png",
    });

    const stored = await t.run((ctx) => ctx.db.get(userId));
    expect(stored).not.toBeNull();
    expect(stored?.clerkId).toBe("user_clerk_alice");
    expect(stored?.email).toBe("alice@example.com");
    expect(stored?.firstName).toBe("Alice");
    expect(stored?.isOnline).toBe(false);
  });

  test("updates an existing row when called again with the same clerkId", async () => {
    const t = convexTest(schema);

    const firstId = await t.mutation(internal.users.upsertUser, {
      clerkId: "user_clerk_bob",
      email: "bob@example.com",
      username: "bob",
    });

    const secondId = await t.mutation(internal.users.upsertUser, {
      clerkId: "user_clerk_bob",
      email: "bob+new@example.com",
      username: "bobby",
      firstName: "Bob",
      lastName: "Loblaw",
    });

    expect(secondId).toBe(firstId);

    const stored = await t.run((ctx) => ctx.db.get(firstId));
    expect(stored?.email).toBe("bob+new@example.com");
    expect(stored?.username).toBe("bobby");
    expect(stored?.firstName).toBe("Bob");
    expect(stored?.lastName).toBe("Loblaw");

    // Confirm there's still only a single row for this clerkId.
    const all = await t.run((ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", "user_clerk_bob"))
        .collect(),
    );
    expect(all.length).toBe(1);
  });
});

describe("getCurrentUser", () => {
  test("returns null when there is no auth identity", async () => {
    const t = convexTest(schema);
    const result = await t.query(api.users.getCurrentUser, {});
    expect(result).toBeNull();
  });

  test("returns null when identity has no matching users row", async () => {
    const t = convexTest(schema);
    const asGhost = t.withIdentity({ subject: "ghost-clerk-id" });
    const result = await asGhost.query(api.users.getCurrentUser, {});
    expect(result).toBeNull();
  });

  test("returns the user matching the identity's clerkId", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "alice-clerk",
        email: "alice@example.com",
        username: "alice",
        isOnline: false,
        lastSeen: 0,
      });
    });

    const asAlice = t.withIdentity({ subject: "alice-clerk" });
    const result = await asAlice.query(api.users.getCurrentUser, {});
    expect(result).not.toBeNull();
    expect(result?.username).toBe("alice");
  });
});

describe("searchUsers", () => {
  test("returns [] without identity", async () => {
    const t = convexTest(schema);
    const result = await t.query(api.users.searchUsers, { searchQuery: "" });
    expect(result).toEqual([]);
  });

  test("returns recent users (excluding the caller) on empty query", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "me",
        email: "me@example.com",
        username: "me",
        isOnline: false,
        lastSeen: 0,
      });
      await ctx.db.insert("users", {
        clerkId: "u1",
        email: "u1@example.com",
        username: "user_one",
        isOnline: false,
        lastSeen: 0,
      });
      await ctx.db.insert("users", {
        clerkId: "u2",
        email: "u2@example.com",
        username: "user_two",
        isOnline: false,
        lastSeen: 0,
      });
    });

    const asMe = t.withIdentity({ subject: "me" });
    const result = await asMe.query(api.users.searchUsers, { searchQuery: "" });
    expect(result.length).toBe(2);
    expect(result.every((u) => u.clerkId !== "me")).toBe(true);
  });
});

describe("updateOnlineStatus", () => {
  // Regression: the old version of this mutation tried to insert a stub user
  // when no row existed yet, racing the Clerk webhook. The fix made it a
  // no-op pre-sync — this test pins that behavior.
  test("is a no-op when the caller has no users row yet", async () => {
    const t = convexTest(schema);
    const asUnsynced = t.withIdentity({ subject: "no-row-yet" });

    // Convex serializes void returns to null over the wire — accept either.
    await expect(
      asUnsynced.mutation(api.users.updateOnlineStatus, { isOnline: true }),
    ).resolves.toBeNull();

    // No users row should have been created.
    const all = await t.run((ctx) => ctx.db.query("users").collect());
    expect(all.length).toBe(0);
  });

  test("updates isOnline + lastSeen when the user exists", async () => {
    const t = convexTest(schema);

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        clerkId: "alice-clerk",
        email: "alice@example.com",
        username: "alice",
        isOnline: false,
        lastSeen: 0,
      }),
    );

    const asAlice = t.withIdentity({ subject: "alice-clerk" });
    await asAlice.mutation(api.users.updateOnlineStatus, { isOnline: true });

    const stored = await t.run((ctx) => ctx.db.get(userId));
    expect(stored?.isOnline).toBe(true);
    expect((stored?.lastSeen ?? 0)).toBeGreaterThan(0);
  });
});
