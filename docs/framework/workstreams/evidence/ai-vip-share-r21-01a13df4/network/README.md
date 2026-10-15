# R2.1 controlled native network fixture

Owner: network executor, 2026-10-15. Writes only `tests/framework/ai-vip-share-r21-network.mjs` and this evidence directory. Shared policy, helpers, dist, Git state and other profiles are read-only.

Claim: real isolated CFT routes AI hosts through source-compiled SOCKS5/HTTPS PAC, leaves other hosts direct, fails closed when the relay disappears, and releases its proxy setting with `chrome.proxy.settings.clear` from trusted native fixture input.

Run: `node tests/framework/ai-vip-share-r21-network.mjs`. Each run creates a fresh evidence subdirectory and mock-keychain profile. Dynamic loopback ports only. No previous R2.1 native network PASS available for reuse.

Evidence layer: RAW_CHROME_PAC_FIXTURE. Fixture sender is its own minimal extension. OpenDesk tool install, public Managed Proxy SDK (unavailable in R11), provider activation/grant, Native ack, daily development connection, production candidate, F3 and ZIP: NOT_TESTED. No product identities or receipts are simulated.

Environment restriction: test-only host resolver mappings to loopback and a generated certificate SPKI exception are passed solely to this profile. Relays permit only controlled hostnames and the local origin port; no external AI/provider traffic or production proxy validation is claimed. Do not interpret local TLS/PAC evidence as public DNS, provider credentials, or production certificate evidence.

First run `2026-10-15T05-20-52-528Z-99d625`: 40 PASS / 2 FAIL, all three core claims passed for both relay schemes. The two additional post-clear requests incorrectly assumed restoring `system` would mean direct access. Read-only `scutil --proxy` and original netlog show inherited HTTP/HTTPS/SOCKS at `127.0.0.1:7897`; netlog confirms the post-clear requests used that system proxy and timed out. These attempts were outside the controlled relay; they are retained as failures, not product failures or controlled-origin PASS. No system proxy configuration was changed. Corrected driver does not make an external post-clear request: it asserts exact baseline restoration and relinquished extension control. Post-clear network routing outside the fixture remains NOT_TESTED.

## Accepted controlled fixture result

Run [`2026-10-15T05-22-15-214Z-f049bc/report.json`](2026-10-15T05-22-15-214Z-f049bc/report.json): **40/40 PASS**, Chrome **155.0.8059.39**, actual fixture extension ID `ahkdnnchihidgcbjcgbijphkdhincdnc`, owned CFT PID `71031` (closed). The fixture is loaded from this run's `fixture/`, not any OpenDesk dist.

- SOCKS5 and HTTPS each: 5 AI apex hosts + 5 subdomains proved proxied by matching relay upstream local port to origin remote port; ordinary host + 6 misleading/suffix hosts proved direct. Path/query references to AI domains on the ordinary host remain direct.
- Both relays stopped with their live tunnels destroyed; actual browser navigation returned `net::ERR_PROXY_CONNECTION_FAILED`. No origin request with either offline nonce appeared, and neither PAC has an AI `DIRECT` fallback.
- Four actual native keyboard button events had `isTrusted=true`, active user activation and the exact fixture sender ID. Both STOP events call `chrome.proxy.settings.clear({scope:'regular'})`, restore `{mode:'system'}` and return `controllable_by_this_extension`. Netlog confirms the return to the original system proxy; no global DIRECT setting is installed.
- 34 controlled document requests plus 34 automatic favicons appear in origin logs; 40 relay CONNECTs cover the 20 proxied document requests and their favicons. This is traffic accounting, not a product completion percentage.
- Verified cleanup: launcher exited 0, owned CFT gone, fresh profile removed, all owned sockets closed, ephemeral private key removed. Other CFT PIDs `34706`, `43356`, `66752` remained running. No shared helper, policy, dist, Git index/HEAD or system proxy configuration was written.

Input binding: copied `policy.js` SHA-256 `aa5a3113252534a4811de82b7959817aa327527659e5073db88fab0a5859803f`, unchanged before/after execution and final evidence verification. SOCKS5 PAC SHA-256 `74efcc5de5b4eddb31080b59c83a0732ae31a5a3d773b342a523063b35b20bf3`; HTTPS PAC SHA-256 `994f28b7cfc3c2ea2c572469e8c32526f79d1e2cb2b090a4e22f0f21fcf8a9e7`. Dynamic ports cause PAC hashes to differ on reproduction. The report binds every fixture file's bytes/hash, launcher source/arguments, native helper, actual process, certificate/SPKI, generated PAC and Chrome version. [`artifacts.json`](2026-10-15T05-22-15-214Z-f049bc/artifacts.json) verifies all 25 run artifacts; final independent hash check passed.

Raw evidence: [`relay.jsonl`](2026-10-15T05-22-15-214Z-f049bc/relay.jsonl), [`origin.jsonl`](2026-10-15T05-22-15-214Z-f049bc/origin.jsonl), [`fixture-events.jsonl`](2026-10-15T05-22-15-214Z-f049bc/fixture-events.jsonl), [`chrome-netlog.json`](2026-10-15T05-22-15-214Z-f049bc/chrome-netlog.json). The original failed run is retained unchanged. Public SDK, OpenDesk installation, provider/grant, Native ack, production/F3/ZIP and post-clear external network remain NOT_TESTED.
