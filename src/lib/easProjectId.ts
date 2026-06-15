import Constants from 'expo-constants';

/** EAS project UUID — required for Expo push tokens on dev/preview/production builds. */
export function getEasProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  if (extra?.eas?.projectId) return extra.eas.projectId;

  const easConfig = (Constants as { easConfig?: { projectId?: string } }).easConfig;
  if (easConfig?.projectId) return easConfig.projectId;

  const manifest2 = Constants.manifest2 as
    | { extra?: { expoClient?: { extra?: { eas?: { projectId?: string } } } } }
    | undefined;
  const fromManifest2 = manifest2?.extra?.expoClient?.extra?.eas?.projectId;
  if (fromManifest2) return fromManifest2;

  const legacy = Constants.expoConfig?.extra?.eas?.projectId;
  if (legacy) return legacy;

  return null;
}
