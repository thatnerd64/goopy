export type OidcClaims = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  groups?: unknown;
};

function parseList(raw: string | undefined, lowerCase = false): string[] {
  return (raw ?? "")
    .replace(/^["']|["']$/g, "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => (lowerCase ? value.toLowerCase() : value));
}

function allowLists() {
  return {
    emails: parseList(process.env.OIDC_ALLOWED_EMAILS, true),
    subs: parseList(process.env.OIDC_ALLOWED_SUBS),
    groups: parseList(process.env.OIDC_ALLOWED_GROUPS),
  };
}

export function oidcAllowListConfigured(): boolean {
  const { emails, subs, groups } = allowLists();
  return emails.length + subs.length + groups.length > 0;
}

/**
 * Every OIDC account gets full access, so who may log in is restricted with
 * OIDC_ALLOWED_EMAILS, OIDC_ALLOWED_SUBS and/or OIDC_ALLOWED_GROUPS (comma
 * separated; matching any of them is enough). Without any list, every account
 * the provider accepts is allowed (a warning is logged at startup).
 */
export function isOidcUserAllowed(claims: OidcClaims): boolean {
  const { emails, subs, groups } = allowLists();
  if (emails.length + subs.length + groups.length === 0) return true;

  if (subs.includes(claims.sub)) return true;

  // An unverified email could be anybody's
  if (
    claims.email &&
    claims.email_verified !== false &&
    emails.includes(claims.email.toLowerCase())
  ) {
    return true;
  }

  const userGroups = Array.isArray(claims.groups)
    ? claims.groups.filter(
        (group): group is string => typeof group === "string",
      )
    : [];
  return userGroups.some((group) => groups.includes(group));
}
