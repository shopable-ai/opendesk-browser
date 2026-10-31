# Vendored Public Suffix List

`public_suffix_list.dat` is the complete, unmodified official list, including
ICANN and PRIVATE sections. No runtime download or third party parser is used.

- Source: https://publicsuffix.org/list/public_suffix_list.dat
- Retrieved: 2026-10-10
- Upstream version: 2026-10-07_07-28-19_UTC
- Upstream commit: 3929462652695bad04f0a27afb600974014a3c8b
- SHA-256: ba7d836c0ea57a8bcf9f1fcb868066a7554bed029b441ecc6204ad8494a32612
- License: Mozilla Public License 2.0; the original file header is preserved.
  The complete license is included in `MPL-2.0.txt`, obtained from
  https://www.mozilla.org/media/MPL/2.0/index.f75d2927d3c1.txt.
- Format/algorithm: https://github.com/publicsuffix/list/wiki/Format

`../domain.ts` canonicalizes every rule and host using WHATWG URL IDNA,
matches exact and wildcard rules by longest suffix, and gives exceptions
precedence. Both sections participate, so tenants on github.io remain separate.
For monitoring, unknown TLDs, suffix-only hosts, IP literals and special-use/local
names fail closed. This is domain classification, not DNS safety verification:
it cannot know whether a public name resolves to a private address. Usage never
resolves names or sends requests; discovered domains never become probe targets.

To update, download the official source into this same file, record its embedded
version/commit, retrieval date and SHA-256 here, then run the usage domain tests.
