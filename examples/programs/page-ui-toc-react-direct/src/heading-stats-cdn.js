// Compatibility adapter for earlier callers. App now shows the HTTPS import
// directly in src/main.js; this wrapper is not its default authoring path.
// Reuse the same reviewed URL and lock, never a second CDN or runtime loader.
import max from 'https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js';
import {summarizeHeadingLevels as summarizeLocal} from './heading-stats.js';

export function summarizeHeadingLevels(items) {
  return summarizeLocal(items, max);
}
