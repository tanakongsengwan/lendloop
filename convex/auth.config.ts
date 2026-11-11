import type { AuthConfig } from "convex/server";

// Set CLERK_JWT_ISSUER_DOMAIN in the Convex dashboard (Settings -> Environment
// Variables). It is the "Issuer" of the Clerk JWT template named "convex".
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
