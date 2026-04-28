import { AuthConfig } from "convex/server";

const domain = process.env.CLERK_JWT_ISSUER_DOMAIN;
if (!domain) {
  throw new Error(
    "CLERK_JWT_ISSUER_DOMAIN is not set on the Convex deployment. " +
      "Configure it in the Convex Dashboard with the issuer URL of your Clerk 'convex' JWT template.",
  );
}

export default {
  providers: [
    {
      domain,
      // Must match the JWT template name configured in Clerk.
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
