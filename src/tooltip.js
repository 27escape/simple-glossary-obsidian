// The hover tooltip: one at a time, shown after a short delay, kept open while the pointer is over it
// so its links can be clicked. Built with DOM calls only (no HTML strings).

const SG_HIDE_DELAY = 250; // ms after the pointer leaves the term or the tooltip

function sgShortUrl(url) {
  const s = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return s.length > 48 ? `${s.slice(0, 45)}…` : s;
}

class SgTooltip {
  constructor(plugin) {
    this.plugin = plugin;
    this.el = null; // the tooltip
    this.target = null; // the term it belongs to
    this.showTimer = 0;
    this.hideTimer = 0;
  }

  inside(node) {
    return !!node && ((this.el && this.el.contains(node)) || (this.target && this.target.contains(node)));
  }

  onOver(evt) {
    const node = evt.target;
    if (this.inside(node)) return this.cancelHide();
    const term = node && node.closest ? node.closest('.sg-term') : null;
    if (!term) return;
    window.clearTimeout(this.showTimer);
    this.showTimer = window.setTimeout(() => this.show(term), Math.max(0, Number(this.plugin.settings.hoverDelay) || 0));
  }

  onOut(evt) {
    const from = evt.target;
    const to = evt.relatedTarget;
    const term = from && from.closest ? from.closest('.sg-term') : null;
    if (term && term.contains(to)) return; // moving within the term
    if (term && term !== this.target) window.clearTimeout(this.showTimer); // left before the tooltip appeared
    if (this.el && this.inside(from) && !this.inside(to)) this.scheduleHide();
  }

  onScroll(evt) {
    if (this.el && !this.el.contains(evt.target)) this.hide();
  }

  cancelHide() {
    window.clearTimeout(this.hideTimer);
  }

  scheduleHide() {
    this.cancelHide();
    this.hideTimer = window.setTimeout(() => this.hide(), SG_HIDE_DELAY);
  }

  hide() {
    window.clearTimeout(this.showTimer);
    window.clearTimeout(this.hideTimer);
    if (this.el) this.el.remove();
    this.el = null;
    this.target = null;
  }

  /** One meaning: the term, what it means, its link. More: the term and "N meanings", then each one numbered. */
  show(termEl) {
    const meanings = this.plugin.meaningsFor(termEl.getAttribute('data-sg-term'));
    if (!meanings.length || !termEl.isConnected) return;
    this.hide();
    const many = meanings.length > 1;
    const tip = termEl.ownerDocument.body.createDiv({ cls: 'sg-tooltip' });
    const head = tip.createDiv({ cls: 'sg-tooltip-term', text: meanings[0].term });
    if (many) head.createSpan({ cls: 'sg-tooltip-count', text: `${meanings.length} meanings` });
    meanings.forEach((m, i) => {
      let body = tip;
      if (many) {
        const row = tip.createDiv({ cls: 'sg-tooltip-meaning' });
        row.createSpan({ cls: 'sg-tooltip-num', text: `${i + 1}.` });
        body = row.createDiv({ cls: 'sg-tooltip-body' });
      }
      if (m.def) body.createDiv({ cls: 'sg-tooltip-def', text: m.def });
      if (many && m.url) this.addUrl(body.createDiv({ cls: 'sg-tooltip-links' }), m.url);
    });
    const links = tip.createDiv({ cls: 'sg-tooltip-links' });
    if (!many && meanings[0].url) this.addUrl(links, meanings[0].url);
    const open = links.createEl('a', { cls: 'sg-tooltip-open', text: 'Open in glossary' });
    open.addEventListener('click', (e) => {
      e.preventDefault();
      this.hide();
      this.plugin.openEntry(meanings[0], e);
    });
    tip.addEventListener('mouseleave', (e) => !this.inside(e.relatedTarget) && this.scheduleHide());
    this.el = tip;
    this.target = termEl;
    this.place(tip, termEl);
  }

  addUrl(parent, url) {
    const a = parent.createEl('a', { cls: 'sg-tooltip-url', text: sgShortUrl(url), attr: { title: url } });
    a.addEventListener('click', (e) => {
      e.preventDefault();
      this.hide();
      window.open(url); // Obsidian hands this to your web browser
    });
  }

  /** Below the term, or above it when there's no room; kept inside the window. */
  place(tip, termEl) {
    const win = termEl.ownerDocument.defaultView || window;
    const r = termEl.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const gap = 6;
    let top = r.bottom + gap;
    if (top + t.height > win.innerHeight - gap && r.top - gap - t.height > gap) top = r.top - gap - t.height;
    const left = Math.min(Math.max(gap, r.left), Math.max(gap, win.innerWidth - t.width - gap));
    tip.setCssStyles({ top: `${Math.round(top)}px`, left: `${Math.round(left)}px` });
  }
}
