// Find glossary terms in text: whole words only, optional simple plurals, optional case matching,
// and nothing inside the parts of a note that aren't prose (code, links, headings, frontmatter, tags, URLs…).

const SG_WORD = '[\\p{L}\\p{N}_]';

function sgEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A term as a pattern that matches it in any case, letter by letter ("ab" → "[aA][bB]"). */
function sgAnyCase(term) {
  return [...term]
    .map((ch) => {
      const l = ch.toLowerCase();
      const u = ch.toUpperCase();
      return l !== u && l.length === 1 && u.length === 1 ? `[${sgEscape(l)}${sgEscape(u)}]` : sgEscape(ch);
    })
    .join('');
}

/**
 * entries → { re, entryOf(text) } or null when there are no terms.
 * opts.caseSensitive (default true), opts.plurals (default true: "BAs", "AR's").
 * Entries with anyCase (written ^term in the glossary) match in any case even when caseSensitive is on;
 * text that matches a term exactly as written gets that entry first ("Socitm" before "^socitm").
 */
function buildMatcher(entries, opts = {}) {
  const cs = opts.caseSensitive !== false;
  const exact = new Map(); // term → entry, matched as written
  const loose = new Map(); // lower-case term → entry, matched in any case
  for (const e of entries || []) {
    if (!e.term) continue;
    if (cs && !e.anyCase) {
      if (!exact.has(e.term)) exact.set(e.term, e);
    } else if (!loose.has(e.term.toLowerCase())) loose.set(e.term.toLowerCase(), e);
  }
  if (!exact.size && !loose.size) return null;
  const pats = [...exact.keys()].map((t) => [t.length, sgEscape(t)]).concat([...loose.values()].map((e) => [e.term.length, cs ? sgAnyCase(e.term) : sgEscape(e.term)]));
  pats.sort((a, b) => b[0] - a[0]); // longest first, so "AIUI" wins over "AI"
  const plural = opts.plurals === false ? '()' : "(s|'s|’s)?";
  const re = new RegExp(`(?<!${SG_WORD})(${pats.map((x) => x[1]).join('|')})${plural}(?!${SG_WORD})`, cs ? 'gu' : 'giu');
  return { re, entryOf: (t) => exact.get(t) || loose.get(t.toLowerCase()) || null };
}

/**
 * Every meaning to show for a matched term (the .term of entryOf's entry), in glossary order: entries with that
 * term, plus any-case (^) entries spelt the same in other capitals. A ^ entry's match doesn't pull in an entry
 * that only matches its exact capitals, since the text may not be written that way.
 */
function sgMeanings(entries, term, caseSensitive = true) {
  const t = String(term || '').toLowerCase();
  return (entries || []).filter((e) => e.term === term || (e.term.toLowerCase() === t && (e.anyCase || !caseSensitive)));
}

/**
 * Matches in text → [{ from, to, term }] in order.
 * opts.skip: sorted [from, to] ranges to leave alone (see skipRanges)
 * opts.firstOnly: only the first match of each term (opts.seen carries that across calls)
 * opts.allowed: a Set of terms; others are ignored
 */
function findTerms(text, matcher, opts = {}) {
  const out = [];
  if (!matcher || !text) return out;
  const skip = opts.skip || [];
  const seen = opts.seen || new Set();
  const re = new RegExp(matcher.re.source, matcher.re.flags);
  let k = 0;
  let m;
  while ((m = re.exec(text))) {
    const from = m.index;
    const to = from + m[0].length;
    while (k < skip.length && skip[k][1] <= from) k++;
    if (k < skip.length && skip[k][0] < to) continue;
    const entry = matcher.entryOf(m[1]);
    if (!entry) continue;
    if (opts.allowed && !opts.allowed.has(entry.term)) continue;
    if (opts.firstOnly) {
      if (seen.has(entry.term)) continue;
      seen.add(entry.term);
    }
    out.push({ from, to, term: entry.term });
  }
  return out;
}

// inline parts of Markdown that aren't prose
const SG_SKIP_INLINE = [
  /``[^\n]*?``|`[^`\n]+`/g, // inline code
  /%%[\s\S]*?%%/g, // Obsidian comments
  /<!--[\s\S]*?-->/g, // HTML comments
  /!?\[\[[^\]\n]*\]\]/g, // wikilinks and embeds (index 3: see SG_LINK_SKIPS)
  /!?\[[^\]\n]*\]\([^)\n]*\)/g, // Markdown links and images (index 4)
  /<[a-zA-Z/][^>\n]*>/g, // HTML tags and <https://…> links
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s)>\]]+/gi, // bare URLs
  /(?:^|(?<=\s))#[^\s#]+/g, // tags
];

const SG_LINK_SKIPS = [SG_SKIP_INLINE[3], SG_SKIP_INLINE[4]];

/**
 * Ranges of a Markdown note to leave alone: frontmatter, code blocks, $$ maths, headings and SG_SKIP_INLINE. Sorted, merged.
 * opts.links === false: leave links out of the ranges (for linkTerms, which looks inside them).
 */
function skipRanges(text, opts = {}) {
  const r = [];
  const add = (a, b) => b > a && r.push([a, b]);
  text = String(text || '');
  if (/^---\r?\n/.test(text)) {
    const end = /\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/g;
    end.lastIndex = 3;
    const x = end.exec(text);
    if (x) add(0, x.index + x[0].length);
  }
  let off = 0;
  let fence = null;
  let math = false;
  let start = 0;
  for (const line of text.split('\n')) {
    const end = off + line.length;
    const t = line.trim();
    if (fence) {
      const f = t.match(/^(`{3,}|~{3,})$/);
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) {
        add(start, end);
        fence = null;
      }
    } else if (math) {
      if (t.endsWith('$$')) {
        add(start, end);
        math = false;
      }
    } else {
      const f = line.match(/^\s*(`{3,}|~{3,})/);
      if (f) [fence, start] = [f[1], off];
      else if (t.startsWith('$$')) {
        if (t.length >= 4 && t.endsWith('$$')) add(off, end);
        else [math, start] = [true, off];
      } else if (/^ {0,3}#{1,6}(\s|$)/.test(line)) add(off, end);
    }
    off = end + 1;
  }
  if (fence || math) add(start, text.length);
  for (const re of SG_SKIP_INLINE) {
    if (opts.links === false && SG_LINK_SKIPS.includes(re)) continue;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) add(m.index, m.index + m[0].length);
  }
  r.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const x of r) {
    const last = merged[merged.length - 1];
    if (last && x[0] <= last[1]) last[1] = Math.max(last[1], x[1]);
    else merged.push([x[0], x[1]]);
  }
  return merged;
}

// [[target#heading|alias]] and [text](url); embeds (with "!") are left alone
const SG_LINKS = [
  { re: /(!?)\[\[([^\]|#^\n]+)([#^][^\]|\n]*)?(?:\|([^\]\n]+))?\]\]/g, target: 2, alias: 4 },
  { re: /(!?)\[([^\]\n]+)\]\([^)\n]*\)/g, alias: 2 },
];

/**
 * Links whose shown text (or wikilink target) is a glossary term → [{ from, to, term, link: true }], sorted.
 * from/to cover the text the link shows. Links in code, comments and other skipped parts are ignored.
 * These are marked every time: a link is a deliberate mention, so "first use only" doesn't apply.
 */
function linkTerms(text, matcher) {
  const out = [];
  if (!matcher || !text || text.indexOf('[') < 0) return out;
  const skip = skipRanges(text, { links: false });
  const skipped = (a, b) => skip.some(([x, y]) => x < b && a < y);
  for (const L of SG_LINKS) {
    const re = new RegExp(L.re.source, L.re.flags);
    let m;
    while ((m = re.exec(text))) {
      if (m[1]) continue; // embed
      const shown = m[L.alias] !== undefined ? m[L.alias] : m[L.target];
      const start = m[L.alias] !== undefined ? m.index + m[0].lastIndexOf(m[L.alias]) : m.index + 2;
      const entry = matcher.entryOf(shown.trim()) || (L.target && matcher.entryOf(m[L.target].trim()));
      if (!entry) continue;
      const from = start + (shown.length - shown.trimStart().length);
      const to = from + shown.trim().length;
      if (!skipped(m.index, m.index + m[0].length)) out.push({ from, to, term: entry.term, link: true });
    }
  }
  return out.sort((a, b) => a.from - b.from);
}

/** term → 0-based line of its first match in a whole note (for "first occurrence only" in Reading view). */
function firstLines(text, matcher) {
  const out = new Map();
  const starts = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  for (const h of findTerms(text, matcher, { skip: skipRanges(text), firstOnly: true })) {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= h.from) lo = mid;
      else hi = mid - 1;
    }
    out.set(h.term, lo);
  }
  return out;
}
