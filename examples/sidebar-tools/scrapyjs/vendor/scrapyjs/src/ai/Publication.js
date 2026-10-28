'use strict';

function dateValue(text) {
  const match = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(text)
    ?? /^(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?$/.exec(text);
  if (!match) return null;
  const [, year, month, day] = match;
  const m = Number(month), y = Number(year);
  if (m < 1 || m > 12) return null;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  if (day !== undefined && (Number(day) < 1 || Number(day) > days)) return null;
  return `${year}-${month.padStart(2, '0')}${day === undefined ? '' : `-${day.padStart(2, '0')}`}`;
}

// The captured list's author / optional translator / publisher / date / price rule.
function splitPublication(raw) {
  const parts = typeof raw === 'string' ? raw.split(/\s+\/\s+/u).map(part => part.trim()) : [];
  const dates = parts.map((part, index) => ({ index, value: dateValue(part) })).filter(date => date.value);
  const date = dates[0];
  if (dates.length !== 1 || ![2, 3].includes(date.index) || parts.length !== date.index + 2 || parts.some(part => !part)) {
    throw Object.assign(new Error('Publication does not match this Douban list format'), { code: 'PUBLICATION_FORMAT' });
  }
  const values = {
    author: parts[0], translator: date.index === 3 ? parts[1] : null,
    publisher: parts[date.index - 1], publication_date: date.value,
    price: null, currency: null, publication_raw: raw,
  };
  const warnings = [];
  const price = /^(?:(USD|CNY)\s*)?(\d+(?:\.\d+)?)(元)?$/i.exec(parts[date.index + 1]);
  if (!price || (price[1]?.toUpperCase() === 'USD' && price[3])) {
    warnings.push({ field: 'price', code: 'PRICE_UNPARSEABLE' });
  } else {
    values.price = Number(price[2]);
    if (!Number.isFinite(values.price)) throw Object.assign(new Error('Publication price is not finite'), { code: 'PUBLICATION_FORMAT' });
    values.currency = price[1]?.toUpperCase() ?? (price[3] ? 'CNY' : null);
    if (!values.currency) warnings.push({ field: 'currency', code: 'CURRENCY_MISSING' });
  }
  return { values, warnings };
}

module.exports = { splitPublication };
