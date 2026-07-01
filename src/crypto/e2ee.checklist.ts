/**
 * Cross-client E2EE smoke scenarios — run manually against dev Supabase after deploy.
 * Automated envelope tests live in envelope.test.ts.
 */
export const E2EE_MANUAL_CHECKLIST = [
  'Both partners login → letters, notes, goals decrypt on mobile and web',
  'Upload photo on web → visible on mobile (encrypted storage)',
  'Doodle live sync between two mobile devices after CEK ready',
  'signal_pulse trigger fires with encrypted broadcast payload',
  'Partner reinstall → relogin → get-couple-cek returns same CEK → content decrypts',
  'Sticky note push notification has no body (unchanged)',
  'signOut clears CEK; re-login fetches fresh key',
] as const;
