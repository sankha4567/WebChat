import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

describe("claimSvixId", () => {
  test("returns false on first claim, true on retry of the same svix id", async () => {
    const t = convexTest(schema);

    const first = await t.mutation(internal.webhooks.claimSvixId, {
      svixId: "msg_abc123",
    });
    expect(first).toBe(false);

    const second = await t.mutation(internal.webhooks.claimSvixId, {
      svixId: "msg_abc123",
    });
    expect(second).toBe(true);
  });

  test("treats different svix ids independently", async () => {
    const t = convexTest(schema);
    expect(
      await t.mutation(internal.webhooks.claimSvixId, { svixId: "evt_a" }),
    ).toBe(false);
    expect(
      await t.mutation(internal.webhooks.claimSvixId, { svixId: "evt_b" }),
    ).toBe(false);
  });
});
