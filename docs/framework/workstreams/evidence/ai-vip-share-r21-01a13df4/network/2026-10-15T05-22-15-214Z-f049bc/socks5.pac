function FindProxyForURL(url, host) {
  host = String(host).toLowerCase().replace(/\.$/, "");
  if (host === "chatgpt.com" || dnsDomainIs(host, ".chatgpt.com")) return "SOCKS5 relay.ai-network.example:61506";
  if (host === "openai.com" || dnsDomainIs(host, ".openai.com")) return "SOCKS5 relay.ai-network.example:61506";
  if (host === "claude.ai" || dnsDomainIs(host, ".claude.ai")) return "SOCKS5 relay.ai-network.example:61506";
  if (host === "gemini.google.com" || dnsDomainIs(host, ".gemini.google.com")) return "SOCKS5 relay.ai-network.example:61506";
  if (host === "perplexity.ai" || dnsDomainIs(host, ".perplexity.ai")) return "SOCKS5 relay.ai-network.example:61506";
  return "DIRECT";
}