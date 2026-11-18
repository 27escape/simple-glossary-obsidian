// Find glossary terms in text: whole words only, optional simple plurals, optional case matching,
// and nothing inside the parts of a note that aren't prose (code, links, headings, frontmatter, tags, URLs…).

const SG_WORD = '[\\p{L}\\p{N}_]';

function sgEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * entries → { re, entryOf(text) } or null when there are no terms.
 * opts.caseSensitive (default true), opts.plurals (default true: "BAs", "AR's").
 */
function buildMatcher(entries, opts = {}) {
  const cs = opts.caseSensitive !== false;
  const byKey = new Map();
  for (const e of entries || []) {
    const k = cs ? e.term : e.term.toLowerCase();
    if (e.term && !byKey.has(k)) byKey.set(k, e);
  }
  if (!byKey.size) return null;
  const terms = [...byKey.values()].map((e) => e.term).sort((a, b) => b.length - a.length);
  const plural = opts.plurals === false ? '()' : "(s|'s|’s)?";
  const re = new RegExp(`(?<!${SG_WORD})(${terms.map(sgEscape).join('|')})${plural}(?!${SG_WORD})`, cs ? 'gu' : 'giu');
  return { re, entryOf: (t) => byKey.get(cs ? t : t.toLowerCase()) || null };
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
  /!?\[\[[^\]\n]*\]\]/g, // wikilinks and embeds
  /!?\[[^\]\n]*\]\([^)\n]*\)/g, // Markdown links and images
  /<[a-zA-Z/][^>\n]*>/g, // HTML tags and <https://…> links
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s)>\]]+/gi, // bare URLs
  /(?:^|(?<=\s))#[^\s#]+/g, // tags
];

/** Ranges of a Markdown note to leave alone: frontmatter, code blocks, $$ maths, headings and SG_SKIP_INLINE. Sorted, merged. */
function skipRanges(text) {
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
