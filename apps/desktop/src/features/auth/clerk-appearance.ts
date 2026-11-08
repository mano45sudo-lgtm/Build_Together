/**
 * Clerk theming and OAuth options for the auth screens (ADR-0006).
 *
 * Clerk's prebuilt UI computes its own shade scales from these values, so they must be literal colors
 * rather than `var(--…)` references. Every hex below mirrors a token in `src/styles/index.css`; change
 * the token and this file together. Control heights, borders and focus rings live in the `#auth-form`
 * rules in `src/styles/index.css`, because Clerk's own rules override `appearance` for those.
 */

/**
 * OIDC `prompt` sent with every OAuth redirect. Clerk's Electron bridge runs OAuth in the user's
 * system browser, which keeps its own Google session. Without an explicit prompt Google silently
 * reuses whichever account is active there, so a user who signed out can never pick a different
 * account. `select_account` makes Google always show its account chooser.
 */
export const OAUTH_ACCOUNT_PROMPT = 'select_account';

const TOKENS = {
  surface1: '#111111',
  surface2: '#171717',
  surface3: '#1c1c1c',
  borderDefault: '#262626',
  primary: '#fafafa',
  secondary: '#a1a1aa',
  muted: '#71717a',
  accentForeground: '#090909',
  danger: '#f87171',
  success: '#4ade80',
  warning: '#fbbf24',
} as const;

const CONTROL_RADIUS = '0.375rem'; // --radius-md

export const clerkAppearance = {
  variables: {
    colorPrimary: TOKENS.primary,
    colorPrimaryForeground: TOKENS.accentForeground,
    colorBackground: TOKENS.surface1,
    colorForeground: TOKENS.primary,
    colorMutedForeground: TOKENS.secondary,
    colorMuted: TOKENS.surface2,
    colorInput: TOKENS.surface2,
    colorInputForeground: TOKENS.primary,
    colorBorder: TOKENS.borderDefault,
    colorRing: TOKENS.secondary,
    colorNeutral: TOKENS.primary,
    colorDanger: TOKENS.danger,
    colorSuccess: TOKENS.success,
    colorWarning: TOKENS.warning,
    colorShadow: '#000000',
    borderRadius: CONTROL_RADIUS,
    fontSize: '0.875rem',
    fontFamily:
      "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  elements: {
    // The surrounding AuthLayout owns the card, heading and mode switch; Clerk renders only the form.
    rootBox: { width: '100%', maxWidth: '100%', minWidth: '0' },
    cardBox: { width: '100%', maxWidth: '100%', minWidth: '0', boxShadow: 'none', border: 'none' },
    card: {
      width: '100%',
      maxWidth: '100%',
      padding: '0',
      gap: '1.25rem',
      background: 'transparent',
      boxShadow: 'none',
      border: 'none',
    },
    header: { display: 'none' },
    footer: { display: 'none' },

    socialButtons: { gap: '0.5rem' },
    socialButtonsBlockButtonText: { fontSize: '0.875rem', fontWeight: 500, color: TOKENS.primary },

    dividerRow: { margin: '0.25rem 0' },
    dividerLine: { backgroundColor: TOKENS.borderDefault },
    dividerText: { color: TOKENS.muted, fontSize: '0.75rem' },

    formFieldRow: { gap: '0.375rem' },
    formFieldLabel: { color: TOKENS.primary, fontSize: '0.8125rem', fontWeight: 500 },
    formFieldAction: { color: TOKENS.secondary, fontWeight: 500 },
    formFieldInputShowPasswordButton: { color: TOKENS.muted, '&:hover': { color: TOKENS.primary } },
    formFieldErrorText: { color: TOKENS.danger },
    lastAuthenticationStrategyBadge: {
      height: '1.125rem',
      padding: '0 0.375rem',
      borderRadius: '0.25rem',
      backgroundColor: TOKENS.surface3,
      border: 'none',
      boxShadow: 'none',
      color: TOKENS.secondary,
      fontSize: '0.6875rem',
      fontWeight: 500,
    },

    buttonArrowIcon: { display: 'none' },

    // Verification / secondary steps
    identityPreview: {
      backgroundColor: TOKENS.surface2,
      border: 'none',
      boxShadow: `inset 0 0 0 1px ${TOKENS.borderDefault}`,
    },
    identityPreviewEditButton: { color: TOKENS.secondary },
    otpCodeFieldInput: {
      backgroundColor: TOKENS.surface2,
      borderColor: TOKENS.borderDefault,
      color: TOKENS.primary,
    },
    formResendCodeLink: { color: TOKENS.primary },
    backLink: { color: TOKENS.secondary },
    alert: {
      backgroundColor: TOKENS.surface2,
      border: 'none',
      boxShadow: `inset 0 0 0 1px ${TOKENS.borderDefault}`,
    },
    alertText: { color: TOKENS.primary },
  },
} as const;
