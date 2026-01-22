import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Webhook } from "svix";

const http = httpRouter();

// Clerk webhook handler
http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return new Response("Webhook secret not configured", { status: 500 });
    }

    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return new Response("Missing svix headers", { status: 400 });
    }

    const body = await request.text();
    const wh = new Webhook(webhookSecret);
    let evt: {
      type: string;
      data: {
        id: string;
        email_addresses?: { email_address: string }[];
        username?: string;
        first_name?: string;
        last_name?: string;
        image_url?: string;
      };
    };

    try {
      evt = wh.verify(body, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as typeof evt;
    } catch (err) {
      console.error("Webhook verification failed:", err);
      return new Response("Invalid signature", { status: 400 });
    }

    const eventType = evt.type;
    const data = evt.data;

    if (eventType === "user.created" || eventType === "user.updated") {
      await ctx.runMutation(internal.users.upsertUser, {
        clerkId: data.id,
        email: data.email_addresses?.[0]?.email_address || "",
        username:
          data.username ||
          data.email_addresses?.[0]?.email_address?.split("@")[0] ||
          "user",
        firstName: data.first_name || undefined,
        lastName: data.last_name || undefined,
        imageUrl: data.image_url || undefined,
      });
    }

    if (eventType === "user.deleted") {
      await ctx.runMutation(internal.users.deleteUser, {
        clerkId: data.id,
      });
    }

    return new Response("OK", { status: 200 });
  }),
});

export default http;