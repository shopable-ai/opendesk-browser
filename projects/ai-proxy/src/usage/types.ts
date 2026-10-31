export type UsageSort = 'smart' | 'visits' | 'recent';

export interface UsageSettings {
  enabled: boolean;
  enabledAt: number | null;
  topLimit: 5 | 10;
  sort: UsageSort;
  ignored: string[];
}

export interface UsageSite {
  siteKey: string;
  domain: string;
  visits7d: number;
  visits30d: number;
  activeDays7d: number;
  activeDays30d: number;
  sessions7d: number;
  sessions30d: number;
  lastVisitedAt: number;
}

export interface UsageSnapshot {
  settings: UsageSettings;
  permissionGranted: boolean;
  sites: UsageSite[];
  retentionDays: 30;
  maxSites: 200;
}
