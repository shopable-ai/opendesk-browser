// Optional real HTTPS ESM import. Opt in by changing ONE import in main.js.
// This source is downloaded only during explicit local review/locking, never
// by a running Chrome Page USER_SCRIPT or a remote <script> element.
// Upstream: D3 d3-array@3.2.4, ISC license, src/max.js (small single module).
import max from 'https://cdn.jsdelivr.net/npm/d3-array@3.2.4/src/max.js';
import {summarizeHeadingLevels as summarizeLocal} from './heading-stats.js';

export function summarizeHeadingLevels(items) {
  return summarizeLocal(items, max);
}
