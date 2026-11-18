// Clicking a term opens the glossary note at its entry.
// Reading view: a plain click. Editor: Ctrl-click (Cmd-click on a Mac), since a plain click there places the cursor.
// Terms that are links (.sg-link) keep the link's own click; the tooltip's "Open in glossary" still works.

Object.assign(SimpleGlossaryPlugin.prototype, {
  termAt(evt) {
    const t = evt.target;
    return t && t.closest ? t.closest('.sg-term') : null;
  },

  onMouseDown(evt) {
    const term = this.termAt(evt);
    if (!term || evt.button !== 0 || term.classList.contains('sg-link') || !term.closest('.cm-editor') || !Keymap.isModEvent(evt)) return;
    evt.preventDefault(); // stop CodeMirror adding a cursor
    evt.stopPropagation();
    const entry = this.entryFor(term.getAttribute('data-sg-term'));
    if (entry) this.openEntry(entry);
  },

  onClick(evt) {
    const term = this.termAt(evt);
    if (!term || evt.button !== 0 || term.classList.contains('sg-link') || term.closest('.cm-editor')) return;
    const entry = this.entryFor(term.getAttribute('data-sg-term'));
    if (!entry) return;
    evt.preventDefault();
    this.tooltip.hide();
    this.openEntry(entry);
  },

  /** Show the glossary at the entry: in its open tab if there is one, otherwise in a new tab. */
  async openEntry(entry) {
    const file = this.glossaryFile();
    if (!file) return;
    const eState = { line: entry.line };
    let leaf = null;
    this.app.workspace.iterateAllLeaves((l) => {
      if (!leaf && l.view && l.view.file && l.view.file.path === file.path) leaf = l;
    });
    if (leaf) {
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
      leaf.setEphemeralState(eState);
    } else {
      await this.app.workspace.getLeaf('tab').openFile(file, { active: true, eState });
    }
  },
});
