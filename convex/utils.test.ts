import { describe, expect, it } from "vitest";
import type { Id } from "./_generated/dataModel";
import {
  directPairKey,
  getGroupAdminIds,
  isGroupAdminOf,
  userDisplayName,
} from "./utils";

// String IDs cast through `unknown` since these helpers don't actually
// touch the database — they only sort/compare ids structurally.
const id = (s: string) => s as unknown as Id<"users">;

describe("directPairKey", () => {
  it("returns the same key regardless of argument order", () => {
    const a = id("user_a");
    const b = id("user_b");
    expect(directPairKey(a, b)).toBe(directPairKey(b, a));
  });

  it("uses a stable sorted join", () => {
    expect(directPairKey(id("zzz"), id("aaa"))).toBe("aaa:zzz");
  });

  it("handles identical ids (degenerate case)", () => {
    expect(directPairKey(id("x"), id("x"))).toBe("x:x");
  });
});

describe("userDisplayName", () => {
  it("returns 'First Last' when both names exist", () => {
    expect(
      userDisplayName({
        firstName: "Alice",
        lastName: "Doe",
        username: "alice123",
      }),
    ).toBe("Alice Doe");
  });

  it("returns just the first name when last name is missing", () => {
    expect(
      userDisplayName({ firstName: "Alice", username: "alice123" }),
    ).toBe("Alice");
  });

  it("falls back to username when no first or last name is set", () => {
    expect(userDisplayName({ username: "alice123" })).toBe("alice123");
  });

  it("falls back to username when only lastName is set", () => {
    // Mirrors the source precedence: needs *both* first and last to use them.
    expect(
      userDisplayName({ lastName: "Doe", username: "alice123" }),
    ).toBe("alice123");
  });
});

describe("getGroupAdminIds", () => {
  it("returns adminIds when the array is populated", () => {
    const ids = [id("a"), id("b")];
    expect(getGroupAdminIds({ adminIds: ids })).toEqual(ids);
  });

  it("falls back to legacy single adminId when adminIds is empty", () => {
    expect(getGroupAdminIds({ adminIds: [], adminId: id("legacy") })).toEqual([
      id("legacy"),
    ]);
  });

  it("falls back to legacy adminId when adminIds is missing", () => {
    expect(getGroupAdminIds({ adminId: id("legacy") })).toEqual([id("legacy")]);
  });

  it("returns an empty array when neither field is set", () => {
    expect(getGroupAdminIds({})).toEqual([]);
  });
});

describe("isGroupAdminOf", () => {
  it("returns true when the user is in adminIds", () => {
    expect(
      isGroupAdminOf({ adminIds: [id("a"), id("b")] }, id("a")),
    ).toBe(true);
  });

  it("returns false when the user is not in adminIds", () => {
    expect(
      isGroupAdminOf({ adminIds: [id("a"), id("b")] }, id("c")),
    ).toBe(false);
  });

  it("respects the legacy adminId fallback", () => {
    expect(isGroupAdminOf({ adminId: id("legacy") }, id("legacy"))).toBe(true);
    expect(isGroupAdminOf({ adminId: id("legacy") }, id("other"))).toBe(false);
  });

  it("returns false when there are no admins at all", () => {
    expect(isGroupAdminOf({}, id("anyone"))).toBe(false);
  });
});
