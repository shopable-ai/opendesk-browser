function FindProxyForURL(url, host) {
  host = String(host).toLowerCase().replace(/\.$/, "");
  if (host === "chatgpt.com" || dnsDomainIs(host, ".chatgpt.com")) return "HTTPS relay.ai-network.example:61505";
  if (host === "openai.com" || dnsDomainIs(host, ".openai.com")) return "HTTPS relay.ai-network.example:61505";
  if (host === "claude.ai" || dnsDomainIs(host, ".claude.ai")) return "HTTPS relay.ai-network.example:61505";
  if (host === "gemini.google.com" || dnsDomainIs(host, ".gemini.google.com")) return "HTTPS relay.ai-network.example:61505";
  if (host === "perplexity.ai" || dnsDomainIs(host, ".perplexity.ai")) return "HTTPS relay.ai-network.example:61505";
  return "DIRECT";
}