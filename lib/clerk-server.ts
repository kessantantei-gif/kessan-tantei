import {
  auth as clerkAuth,
  clerkClient,
  currentUser as clerkCurrentUser,
} from "@clerk/nextjs/server";
import { headers } from "next/headers";

const SEARCH_CRAWLER_HEADER = "x-kessan-search-crawler";

async function isSearchCrawlerRequest() {
  try {
    return (await headers()).get(SEARCH_CRAWLER_HEADER) === "1";
  } catch {
    return false;
  }
}

function signedOutAuthResult() {
  return {
    userId: null,
    sessionId: null,
    orgId: null,
    orgRole: null,
    orgSlug: null,
    orgPermissions: [],
    sessionClaims: null,
    actor: null,
    tokenType: null,
    isAuthenticated: false,
    has: () => false,
    getToken: async () => null,
    redirectToSignIn: () => {
      throw new Error("Search crawlers cannot start an authentication flow");
    },
    protect: () => {
      throw new Error("Search crawlers cannot access protected resources");
    },
  };
}

export async function auth(...args: Parameters<typeof clerkAuth>) {
  if (await isSearchCrawlerRequest()) {
    return signedOutAuthResult() as unknown as Awaited<ReturnType<typeof clerkAuth>>;
  }

  return clerkAuth(...args);
}

export async function currentUser(...args: Parameters<typeof clerkCurrentUser>) {
  if (await isSearchCrawlerRequest()) return null;
  return clerkCurrentUser(...args);
}

export { clerkClient };
