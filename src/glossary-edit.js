// Add an entry to a glossary note's text and keep the entries in alphabetical order.
// Text in, text out: the plugin writes the result (src/add-term.js). Uses parseGlossary (parse.js).
//
// A "block" is an entry's list line plus any more-indented lines under it (wrapped text, sub-items).
// A "run" is a list of blocks one after another at the same indent. Each run is sorted on its own,
// by the term without its Markdown (bold, links), ignoring case; headings and prose between runs stay put.
// Every run gets one list marker (the one most of its items use; numbered lists are renumbered),
// so a stray "1." among "-" items doesn't split the list in two once sorted.

const SG_MARKER = /^(\s*)([-*+]|\d+[.)])(\s+)/;
const SG_COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const sgIndent = (line) => line.match(/^\s*/)[0].length;

/** Runs of entry blocks: [{ start, end, indent, blocks: [{ start, end, term }] }]; end is exclusive. */
function sgEntryRuns(lines, entries) {
  const runs = [];
  let run = null;
  let covered = 0; // lines up to here belong to an earlier block (an entry inside one is part of it)
  for (const e of entries) {
    if (e.line < covered) continue;
    const indent = sgIndent(lines[e.line]);
    let end = e.line + 1;
    while (end < lines.length && lines[end].trim() && sgIndent(lines[end]) > indent) end++;
    covered = end;
    const block = { start: e.line, end, term: e.term };
    if (run && run.end === block.start && run.indent === indent) {
      run.blocks.push(block);
      run.end = end;
    } else runs.push((run = { start: block.start, end, indent, blocks: [block] }));
  }
  return runs;
}

/** One marker for the whole run: the most used (ties: the first item's); numbered lists count up from their first number. */
function sgRestyle(blockLines, original, indentStr) {
  const count = new Map();
  let first = null;
  let start = 1;
  for (const ls of original) {
    const m = ls[0].match(SG_MARKER);
    if (!m) continue;
    const style = /\d/.test(m[2]) ? `#${m[2].slice(-1)}` : m[2];
    if (!first) first = style;
    if (style[0] === '#' && !count.has(style)) start = parseInt(m[2], 10) || 1;
    count.set(style, (count.get(style) || 0) + 1);
  }
  let style = first || '-';
  for (const [s, c] of count) if (c > count.get(style)) style = s;
  return blockLines.map((ls, i) => {
    const m = ls[0].match(SG_MARKER);
    const rest = m ? ls[0].slice(m[0].length) : ls[0];
    const marker = style[0] === '#' ? `${start + i}${style[1]}` : style;
    return [`${indentStr}${marker}${m ? m[3] : ' '}${rest}`, ...ls.slice(1)];
  });
}

/** A term as typed, without the ^ that makes it match in any case. */
function sgBareTerm(term) {
  return String(term || '').replace(/^\^\s*/, '');
}

/** Problem with a new term (may start with ^) or description, or ''. */
function sgCheckEntry(term, def, entries) {
  const bare = sgBareTerm(term);
  if (!bare) return 'Enter the term.';
  // the characters the plain "TERM: def" form can't hold (see SG_FORMATS in parse.js)
  if (/[:*_`[\]#|<>^]/.test(bare)) return 'A term can\'t contain : * _ ` [ ] # | < or >, or a ^ other than at the start.';
  if (bare.length + (bare === term ? 0 : 1) > 40) return 'A term can be 40 characters at most.';
  const dup = (entries || []).find((e) => e.term.toLowerCase() === bare.toLowerCase());
  if (dup) return `${dup.term} is already in the glossary${dup.def ? `: ${dup.def}` : ''}.`;
  if (!def) return 'Enter what it means.';
  return '';
}

/**
 * The glossary text with "term: def" added (term may start with ^: any case) and every run of entries sorted → { text } or { error }.
 * The new entry joins the longest run (the last, if two are as long); with no entries yet, a list starts at the end.
 */
function sgAddEntry(text, term, def) {
  text = String(text || '');
  term = String(term || '').replace(/\s+/g, ' ').trim().replace(/^\^\s*/, '^');
  def = String(def || '').replace(/\s+/g, ' ').trim();
  const entries = parseGlossary(text);
  const problem = sgCheckEntry(term, def, entries);
  if (problem) return { error: problem };
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const entry = `${term}: ${def}`; // plain, the simplest form parseGlossary reads
  const runs = sgEntryRuns(lines, entries);
  if (!runs.length) {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (lines.length) lines.push('');
    lines.push(`- ${entry}`, '');
    return { text: lines.join(eol) };
  }
  const target = runs.reduce((a, r) => (r.blocks.length >= a.blocks.length ? r : a));
  target.blocks.push({ lines: [entry], term: sgBareTerm(term) }); // ^socitm sorts under S
  for (const r of runs.slice().reverse()) {
    // from the last run back, so earlier line numbers stay right
    const original = r.blocks.map((b) => b.lines || lines.slice(b.start, b.end));
    const order = original.map((ls, i) => ({ ls, i, term: r.blocks[i].term })).sort((a, b) => SG_COLLATOR.compare(a.term, b.term) || a.i - b.i);
    const indentStr = lines[r.start].match(/^\s*/)[0];
    const restyled = sgRestyle(
      order.map((x) => x.ls),
      original.filter((ls) => SG_MARKER.test(ls[0])),
      indentStr
    );
    lines.splice(r.start, r.end - r.start, ...restyled.flat());
  }
  return { text: lines.join(eol) };
}
