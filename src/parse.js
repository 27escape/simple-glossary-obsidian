// Read a glossary note into entries: { term, def, url, tags, line, anyCase }.
// An entry is a list item (-, *, + or 1.) in one of these forms:
//   **TERM**: definition    __TERM__: definition    [TERM](https://…) definition
//   [[TERM]]: definition    TERM: definition
// A term starting with ^ (such as ^socitm or **^socitm**) matches in any case: the ^ is dropped from term
// and anyCase is set. Hashtags are taken out of the definition (kept in tags); the first URL is kept in url.
// line is the 0-based line of the entry, used to open the glossary at that entry.

const SG_LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(?!\[[ xX]\]\s)(.*)$/;
const SG_FORMATS = [
  { re: /^\*\*(.+?)\*\*(.*)$/, term: 1, rest: 2 },
  { re: /^__(.+?)__(.*)$/, term: 1, rest: 2 },
  { re: /^\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\](.*)$/, term: 1, rest: 2 },
  { re: /^\[([^\]]+)\]\(([^)\s]+)\)(.*)$/, term: 1, url: 2, rest: 3 },
  { re: /^([^:*_[\]`#<>\s][^:*_[\]`#<>]{0,39}?):\s+(.*)$/, term: 1, rest: 2 },
];

/** Tidy a definition: take out hashtags and URLs, unwrap links, drop bold/code marks and leading separators. */
function sgCleanDef(text) {
  let url = '';
  const tags = [];
  const keep = (u) => (url = url || u);
  let s = ' ' + String(text || '');
  s = s.replace(/<(https?:\/\/[^>\s]+)>/g, (m, u) => (keep(u), ''));
  s = s.replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (m, t, u) => (keep(u), t));
  s = s.replace(/https?:\/\/[^\s)>\]]+/g, (u) => (keep(u), ''));
  s = s.replace(/(^|\s)#([\p{L}\p{N}_/-]+)/gu, (m, sp, t) => (tags.push(t), sp));
  s = s.replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1').replace(/\[\[([^\]]+)\]\]/g, '$1');
  s = s.replace(/\*\*|__|`/g, '');
  s = s.replace(/^[\s:–—-]+/, '').replace(/[\s,;:–—-]+$/, '').replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1');
  return { def: s.trim(), url, tags };
}

/** Glossary note text → entries, in note order. A term listed more than once has more than one meaning; only an exact repeat (same term and meaning) is dropped. */
function parseGlossary(text) {
  const out = [];
  const seen = new Set();
  const lines = String(text || '').split(/\r?\n/);
  let i = 0;
  if (/^---\s*$/.test(lines[0] || '')) {
    // skip the frontmatter (its "- value" lists aren't entries)
    for (i = 1; i < lines.length && !/^(---|\.\.\.)\s*$/.test(lines[i]); i++);
    i++;
  }
  let fence = null;
  for (; i < lines.length; i++) {
    const raw = lines[i];
    const f = raw.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      continue;
    }
    if (f) {
      fence = f[1];
      continue;
    }
    const item = raw.match(SG_LIST_ITEM);
    if (!item) continue;
    const body = item[1].trim();
    for (const fmt of SG_FORMATS) {
      const m = body.match(fmt.re);
      if (!m) continue;
      let term = m[fmt.term].replace(/[\s:]+$/, '').trim();
      const anyCase = term.startsWith('^');
      if (anyCase) term = term.slice(1).trim();
      if (!term) break;
      const c = sgCleanDef(m[fmt.rest]);
      const key = `${term}\n${c.def.toLowerCase()}`;
      if (seen.has(key)) break;
      const link = fmt.url && /^https?:\/\//.test(m[fmt.url]) ? m[fmt.url] : '';
      out.push({ term, def: c.def, url: link || c.url, tags: c.tags, line: i, anyCase });
      seen.add(key);
      break;
    }
  }
  return out;
}
