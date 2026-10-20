# OpenDesk Browser Analytics R1.0 — deployment and metrics

R1.1 平台 DAU、扩展打开、最新已知安装覆盖的产品口径及 PostHog 最小配置见 [METRICS-R1.1.md](./METRICS-R1.1.md)。R1.0 细粒度 Prompt 事件仍保留兼容，但不作为首期平台 DAU 的分子。


## Status and trust boundary

Code committed to main does not mean the service is deployed. The browser config at src/analytics/config.js has an EMPTY ingestion URL on purpose; no analytics transmission occurs until a real HTTPS endpoint is provisioned, published privacy disclosure is reviewed and the user opts in inside the existing Options page.

Data flow: Prompt Shortcuts verified storage/DOM/clipboard result or Host lifecycle → single trusted MV3 analytics sidecar → bounded chrome.storage.local outbox → HTTPS /v1/events → Cloudflare Worker allowlist validation/rate limits → D1 unique event_id + leased delivery outbox → PostHog /batch/ → restricted administrator analysis.

The Worker returns 202 after durable D1 insertion, NOT after PostHog processing. Reusing an eventId across an HTTP retry is deduplicated by D1. D1 conditional leases prevent concurrent senders from dispatching the same event at the same moment; delivery to PostHog is still at least once across a crash after upstream acceptance and before the D1 sent marker. Keep the same UUID and interpret vendor-level delayed dedup and event freshness accordingly.

## Provision (not done automatically)

1. Create separate development and production PostHog projects, select the correct region and restrict administrator access. Disable autocapture, browser pageviews, session recordings, identification, automatic person profiles and unrelated analytics integrations. This Worker only uses server-side capture and asks PostHog not to create person profiles.
2. Create an isolated Cloudflare Workers + D1 database in the intended region. Apply services/analytics/schema.sql to the new D1 database. Copy services/analytics/wrangler.example.toml to deployment configuration (not tracked). Replace database ID, POSTHOG_HOST and the actual Worker custom domain/route.
3. Set Worker secrets POSTHOG_PROJECT_TOKEN and RATE_SALT. The project token belongs ONLY on the server, not in the shipped browser extension. Protect Cloudflare/worker credentials and dashboard separately. Set request/log redaction and automated retention in the cloud account.
4. Deploy Worker, inspect GET /health (200 means configuration looks present; not proof of delivery), send a consented test event in the isolated development environment, confirm its eventId in D1 and then PostHog, and test 5xx recovery, duplicate replay and data deletion.
5. Review browser Options opt-in language, Chrome Web Store Privacy Practices and external privacy policy before distributing an enabled production build. Set the verified production HTTPS /v1/events URL in src/analytics/config.js and build the actual extension; its source is disabled by default. Ensure test and production projects NEVER share a database or PostHog project.

The Worker is an anonymous public ingestion endpoint. Its IP-bucket rate limit (80 events/minute) and strict schema reduce abuse, but an installId is not authentication, a verified human user or a billing identifier. Events in the operational console are lower-bound opt-in observations subject to spoofing. Do not claim this is a trustworthy total store-install count.

## Strict payload

Version: 1. Maximum POST size: 16 KiB; maximum 10 events/request; timestamp within 7 days in past and 5 minutes ahead. Every event: random eventId, random installId, fixed event enum, installed toolId, timestamp, allowlisted source/channel and optional fixed failure reason. No arbitrary metadata. The reporter is not allowed to add prompt text, conversation, site URL, page title, cookies, token, files, note body or full error message.

Events:

| Event | Meaning | Authority |
|---|---|---|
| tool.installed / tool.uninstalled | Actual persisted installed registry transition | Trusted SW listener |
| tool.enabled / tool.disabled | Actual persisted enabled-store transition | Trusted SW listener |
| tool.opened | Trusted Side Panel mounted an installed enabled tool (not business success) | Trusted Side Panel |
| prompt.saved | Single changed prompt item after verified storage commit | Trusted Side Panel storage dispatcher |
| prompt.inserted | Expected complete text read back from the real editor | Bundled trusted page adapter |
| prompt.copied | Clipboard success acknowledged in sandbox; lower trust | Own tool report |
| prompt.fallback_copied | Editor insertion did not succeed, clipboard write promise resolved | Bundled trusted page adapter |
| prompt.failed | No successful final page action; bounded reason | Bundled trusted page adapter |

Tool reported successes cannot claim platform lifecycle or another tool. A page adapter is audited extension source, but the server cannot cryptographically prove a web-page operation. Future external third-party tool business events require their own allowlist and explicit trust class; this version has no generic third-party reporting API.

## Privacy, opt-out and storage

Telemetry is completely OFF unless an actual configured HTTPS URL and explicit user consent both exist. On opt-out the MV3 collector aborts in-flight attempts where possible, clears local queued events, and discards the installId. Re-consenting generates a new random installId. Browser extension business operations are not blocked by telemetry failures.

Local queue: max 250 events, 7 day event age, five-minute Chrome alarm, retry exponential backoff up to six hours. Old events may be dropped deliberately after prolonged outage. D1: pending rows deleted after 7 days and sent receipts after 35 days; active per-minute hashed-IP buckets expire. PostHog retention must be configured separately and documented (e.g. 90 days if appropriate). Avoid writing incoming client IP into logs; rate limiting derives a short-lived salted digest, not a durable device fingerprint. No personally identifying login correlation is collected.

A past receipt already accepted in D1 or PostHog is NOT erased merely by opt-out. To satisfy a data-erasure request, an administrator must delete the installId in D1 and PostHog and identify its historical IDs as permitted by the actual privacy policy. The product currently has no verified self-service remote deletion API; this remains a release readiness blocker if required by applicable law or policy. Treat installId as pseudonymous, not inherently anonymous.

## Admin analysis definitions (PostHog saved Insights, funnels, cohorts)

- Active participating installations: unique distinct_id with events in the reporting window; DAU/WAU/MAU = distinct installId for 1/7/30 calendar days. This is NOT actual people, current opt-in count, or store-wide install count.
- Extension utilization: event count for tool.opened by tool_id vs successful events by tool_id; tools with no successful event instrumentation must not be called successful.
- Prompt usage channels: count confirmed prompt.inserted, prompt.fallback_copied, and lower-confidence prompt.copied SEPARATELY. Never count fallback as an inserted event.
- Page button failure fraction: prompt.failed / (prompt.inserted + prompt.fallback_copied + prompt.failed), only within the page-button operation family and eligible instrumentation.
- Conversion and D7/D30 cohort retention: require actual eligible first-touch cohort membership and enough elapsed days. Show NOT_ENOUGH_DATA otherwise.
- For uninstall/updates, count actual Host persisted-state transitions. No total installed number from these opt-in events; compare only against independent Chrome Web Store aggregate if desired, clearly labeled.

Do not configure a tracking SDK on the user's web page or build a local React analytics dashboard. Restrict saved analyses to administrators in the existing PostHog console.

## Development acceptance

Run Node 22: node --test tests/environment/analytics-r10*.test.mjs

The integration test runs a real loopback HTTP collection endpoint, a SQLite database executing the actual D1 schema, an HTTP PostHog-shaped sink and MV3-like persistent browser state. It proves the local data-path behavior but is NOT live Cloudflare/real PostHog/installed Mac Chrome evidence. Use CI evidence and label each environment independently. Native Chrome, live cloud configuration, Chrome Web Store policy review and production monitoring remain blocked/unverified until executed.
