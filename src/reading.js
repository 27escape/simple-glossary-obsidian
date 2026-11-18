// Reading view: wrap glossary terms in rendered notes in <span class="sg-term" data-sg-term="…">.

// rendered parts to leave alone
const SG_SKIP_SEL = [
  'code', 'pre', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'button', 'input', 'textarea', 'svg',
  '.frontmatter', '.frontmatter-container', '.metadata-container', '.math', '.mermaid',
  '.internal-embed', '.tag', '.sg-term',
].join(', ');

/** Mark matches inside root. opts: firstOnly, allowed (Set of terms or null). */
function sgMarkDom(root, matcher, opts = {}) {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */, {
    acceptNode: (n) => (!n.nodeValue.trim() || (n.parentElement && n.parentElement.closest(SG_SKIP_SEL)) ? 2 : 1), // reject : accept
  });
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  const seen = new Set();
  for (const node of nodes) {
    const text = node.nodeValue;
    const hits = findTerms(text, matcher, { firstOnly: opts.firstOnly, seen, allowed: opts.allowed || null });
    if (!hits.length) continue;
    const frag = doc.createDocumentFragment();
    let at = 0;
    for (const h of hits) {
      if (h.from > at) frag.appendChild(doc.createTextNode(text.slice(at, h.from)));
      const span = doc.createElement('span');
      span.className = 'sg-term';
      span.setAttribute('data-sg-term', h.term);
      span.textContent = text.slice(h.from, h.to);
      frag.appendChild(span);
      at = h.to;
    }
    if (at < text.length) frag.appendChild(doc.createTextNode(text.slice(at)));
    node.parentNode.replaceChild(frag, node);
  }
  // links whose text (or target) is a term get the tooltip too; the link itself still works when clicked
  for (const a of root.querySelectorAll('a.internal-link, a.external-link')) {
    if (a.closest('code, pre, .sg-term') || a.classList.contains('sg-term')) continue;
    const entry = matcher.entryOf(a.textContent.trim()) || matcher.entryOf((a.getAttribute('data-href') || '').split(/[#^]/)[0].trim());
    if (!entry) continue;
    a.classList.add('sg-term', 'sg-link');
    a.setAttribute('data-sg-term', entry.term);
  }
}

Object.assign(SimpleGlossaryPlugin.prototype, {
  /** Markdown post-processor: called once per rendered section of a note. */
  processReading(el, ctx) {
    const s = this.settings;
    if (!this.matcher || !s.inReading) return;
    if (ctx.sourcePath && ctx.sourcePath === this.glossaryPathResolved()) return;
    let allowed = null;
    if (s.firstOnly) {
      // sections render one at a time, so work out from the whole note which section holds each term's first use
      const info = ctx.getSectionInfo(el);
      if (info) {
        allowed = new Set();
        for (const [term, line] of this.firstLinesFor(info.text)) if (line >= info.lineStart && line <= info.lineEnd) allowed.add(term);
        if (!allowed.size) return;
      }
    }
    sgMarkDom(el, this.matcher, { firstOnly: s.firstOnly, allowed });
  },
});
