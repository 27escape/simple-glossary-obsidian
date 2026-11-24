// The plugin: loads the glossary note, keeps the matcher, wires up Reading view, the editor, the tooltip and clicks.
// Other files add methods with Object.assign(SimpleGlossaryPlugin.prototype, { ... }).

const SG_DEFAULTS = {
  glossaryPath: '',
  inReading: true,
  inEditor: true,
  firstOnly: true,
  caseSensitive: true,
  plurals: true,
  look: 'underline', // underline | highlight | both
  hoverDelay: 300,
};
const SG_LOOKS = { underline: 'Dotted underline', highlight: 'Soft highlight', both: 'Underline and highlight' };

class SimpleGlossaryPlugin extends Plugin {
  async onload() {
    if (Platform.isMobile) return; // desktop only (isDesktopOnly in the manifest too)
    this.settings = Object.assign({}, SG_DEFAULTS, await this.loadData());
    this.entries = [];
    this.byTerm = new Map();
    this.matcher = null;
    this.firstCache = null;
    this.status = '';
    this.docs = new Set();
    this.tooltip = new SgTooltip(this);
    this.reloadSoon = debounce(() => this.reload(), 400, true);

    this.addSettingTab((this.settingTab = new SgSettingTab(this.app, this)));
    this.registerMarkdownPostProcessor((el, ctx) => this.processReading(el, ctx));
    this.registerEditorExtension(sgEditorExtension(this));
    this.watchDocument(document);
    this.registerEvent(this.app.workspace.on('window-open', (win) => this.watchDocument(win.doc)));

    const isGlossary = (f) => f && f.path === this.glossaryPathResolved();
    this.registerEvent(this.app.vault.on('modify', (f) => isGlossary(f) && this.reloadSoon()));
    this.registerEvent(this.app.vault.on('create', (f) => isGlossary(f) && this.reloadSoon()));
    this.registerEvent(this.app.vault.on('delete', (f) => isGlossary(f) && this.reload()));
    this.registerEvent(
      this.app.vault.on('rename', (f, old) => {
        if (old === this.glossaryPathResolved()) {
          // follow the glossary note when it is renamed or moved
          this.settings.glossaryPath = f.path;
          this.saveSettings();
          this.reload();
        } else if (isGlossary(f)) this.reload();
      })
    );
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.tooltip.hide()));

    this.addCommand({ id: 'add-term', name: 'Add a term to the glossary', callback: () => this.openAddTerm() });
    this.addCommand({ id: 'reload-glossary', name: 'Reload glossary', callback: () => this.reload() });
    this.addCommand({
      id: 'open-glossary',
      name: 'Open glossary note',
      checkCallback: (checking) => {
        const file = this.glossaryFile();
        if (checking) return !!file;
        if (file) this.app.workspace.getLeaf('tab').openFile(file);
      },
    });

    this.app.workspace.onLayoutReady(() => this.reload());
  }

  onunload() {
    if (this.tooltip) this.tooltip.hide();
    for (const doc of this.docs || []) doc.body.removeClasses(Object.keys(SG_LOOKS).map((k) => `sg-look-${k}`));
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /** The glossary note's path as set, or with ".md" added when that is what exists. */
  glossaryPathResolved() {
    const p = (this.settings.glossaryPath || '').trim();
    if (!p) return '';
    const path = normalizePath(p);
    if (this.app.vault.getAbstractFileByPath(path) || /\.md$/i.test(path)) return path;
    return `${path}.md`;
  }

  glossaryFile() {
    const p = this.glossaryPathResolved();
    const f = p ? this.app.vault.getAbstractFileByPath(p) : null;
    return f instanceof TFile ? f : null;
  }

  /** Read the glossary note again and refresh every open note. */
  async reload() {
    const file = this.glossaryFile();
    if (!file) {
      const p = this.settings.glossaryPath;
      this.setEntries([], p ? `Note not found: ${p}` : 'No glossary note chosen yet.');
      return;
    }
    const entries = parseGlossary(await this.app.vault.cachedRead(file));
    this.setEntries(entries, `${entries.length} ${entries.length === 1 ? 'term' : 'terms'} read from ${file.path}`);
  }

  setEntries(entries, status) {
    this.entries = entries;
    this.byTerm = new Map(); // term → its first entry
    for (const e of entries) if (!this.byTerm.has(e.term)) this.byTerm.set(e.term, e);
    this.status = status;
    this.rebuild();
    if (this.settingTab) this.settingTab.showStatus();
  }

  /** After the terms or a matching setting change: new matcher, then redraw open notes. */
  rebuild() {
    this.matcher = buildMatcher(this.entries, { caseSensitive: this.settings.caseSensitive, plurals: this.settings.plurals });
    this.firstCache = null;
    this.refreshViews();
  }

  entryFor(term) {
    return this.byTerm.get(term) || null;
  }

  /** Every meaning of a marked term, for the tooltip. */
  meaningsFor(term) {
    return sgMeanings(this.entries, term, this.settings.caseSensitive);
  }

  /** term → first line in this note's text (cached for the last note asked about). */
  firstLinesFor(text) {
    if (!this.firstCache || this.firstCache.text !== text) this.firstCache = { text, map: firstLines(text, this.matcher) };
    return this.firstCache.map;
  }

  refreshViews() {
    this.app.workspace.iterateAllLeaves((leaf) => {
      const v = leaf.view;
      if (!v || v.getViewType() !== 'markdown') return;
      const cm = v.editor && v.editor.cm;
      if (cm && cm.dispatch) cm.dispatch({ effects: sgRefresh.of(null) });
      if (v.previewMode && v.previewMode.rerender) v.previewMode.rerender(true);
    });
  }

  applyLook(doc) {
    for (const k of Object.keys(SG_LOOKS)) doc.body.toggleClass(`sg-look-${k}`, this.settings.look === k);
  }

  /** Hover, click and look for the main window and each pop-out window. */
  watchDocument(doc) {
    if (!doc || this.docs.has(doc)) return;
    this.docs.add(doc);
    this.applyLook(doc);
    this.registerDomEvent(doc, 'mouseover', (e) => this.tooltip.onOver(e));
    this.registerDomEvent(doc, 'mouseout', (e) => this.tooltip.onOut(e));
    this.registerDomEvent(doc, 'mousedown', (e) => this.onMouseDown(e), true);
    this.registerDomEvent(doc, 'click', (e) => this.onClick(e));
    this.registerDomEvent(doc, 'keydown', (e) => e.key === 'Escape' && this.tooltip.hide());
    this.registerDomEvent(doc, 'scroll', (e) => this.tooltip.onScroll(e), true);
  }
}
