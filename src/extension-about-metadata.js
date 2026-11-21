const unsafeLinkText = /[\s\p{Cc}\p{Cf}\\]/u;

export function readExtensionAboutLink(value) {
  if (typeof value !== 'string' || value.length > 2048 ||
      !/^https:\/\/[^/]/i.test(value) || unsafeLinkText.test(value)) return null;
  try {
    // The URL parser normalizes an empty credentials marker away.
    if (value.slice(8).split(/[/?#]/, 1)[0].includes('@')) return null;
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
        url.href.length > 2048) return null;
    return url;
  } catch {
    return null;
  }
}

export function readExtensionAboutFields(value) {
  const result = {};
  const author = typeof value?.author === 'string' ? value.author.trim() : '';
  if (author && author.length <= 160 && !/[\p{Cc}\p{Cf}]/u.test(author)) result.author = author;
  for (const key of ['homepage', 'supportUrl']) {
    const link = readExtensionAboutLink(value?.[key]);
    if (link) result[key] = link.href;
  }
  return result;
}
