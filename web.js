// Free, account-free web lookups for the optional AI assistant. Only the search words the user approved are sent.
const strip = h => String(h || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const okUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && !/(^|\.)duckduckgo\.com$/.test(x.hostname) ? x.href : null; } catch { return null; } };
function parseDDG(html) {
  const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, hits = []; let m;
  while ((m = re.exec(html))) hits.push({ href: m[1].replace(/&amp;/g, '&'), title: strip(m[2]), start: m.index, end: re.lastIndex });
  return hits.map((h, i) => {
    let u = h.href; if (u.startsWith('//')) u = 'https:' + u;
    try { const x = new URL(u); if (x.searchParams.get('uddg')) u = x.searchParams.get('uddg'); } catch {}
    const seg = html.slice(h.end, i + 1 < hits.length ? hits[i + 1].start : undefined), s = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(seg);
    return { title: h.title, url: okUrl(u), snippet: s ? strip(s[1]) : '', source: 'web' };
  }).filter(r => r.url && r.title);
}
function parseWiki(j) {
  return ((j && j.query && j.query.search) || []).map(r => ({ title: r.title, url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(r.title.replace(/ /g, '_')), snippet: strip(r.snippet), source: 'Wikipedia' }));
}
function parseArxiv(xml) {
  const out = []; const re = /<entry>([\s\S]*?)<\/entry>/g; let m;
  while ((m = re.exec(xml))) { const g = t => { const x = new RegExp('<' + t + '[^>]*>([\\s\\S]*?)</' + t + '>').exec(m[1]); return x ? strip(x[1]) : ''; };
    const id = okUrl(g('id')); if (id) out.push({ title: g('title'), url: id, snippet: g('summary').slice(0, 400), source: 'arXiv' }); }
  return out;
}
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
async function get(url, json) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 15000);
  try { const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: json ? 'application/json' : '*/*' }, signal: ac.signal, redirect: 'follow' });
    if (!r.ok) throw new Error('HTTP ' + r.status); const b = await r.text(); return b.slice(0, 2e6); } finally { clearTimeout(t); }
}
async function search(src, q) {
  q = String(q || '').slice(0, 200).trim(); if (!q) return [];
  const e = encodeURIComponent(q);
  if (src === 'ddg') return parseDDG(await get('https://html.duckduckgo.com/html/?kl=wt-wt&q=' + e)).slice(0, 6);
  if (src === 'wiki') return parseWiki(JSON.parse(await get('https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=4&format=json&srsearch=' + e, true)));
  if (src === 'arxiv') return parseArxiv(await get('https://export.arxiv.org/api/query?max_results=4&search_query=all:' + e)).slice(0, 4);
  throw new Error('Unknown source');
}
module.exports = { search, parseDDG, parseWiki, parseArxiv };
