/**
 * OIDC `prompt` sent with every OAuth redirect. Clerk's Electron bridge runs OAuth in the user's
 * system browser, which keeps its own Google session. Without an explicit prompt Google silently
 * reuses whichever account is active there, so a user who signed out could never pick a different
 * account. `select_account` makes Google always show its account chooser.
 */
export const OAUTH_ACCOUNT_PROMPT = 'select_account';
