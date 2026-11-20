// The settings page, with suggestions of notes for the glossary path as you type.

class SgNoteSuggest extends AbstractInputSuggest {
  constructor(app, inputEl, onPick) {
    super(app, inputEl);
    this.inputEl = inputEl;
    this.onPick = onPick;
  }

  /** Notes whose path contains what was typed; names that start with it first, then shorter paths. */
  getSuggestions(query) {
    const q = query.toLowerCase().trim();
    const rank = (f) => (f.basename.toLowerCase().startsWith(q) ? 0 : f.basename.toLowerCase().includes(q) ? 1 : 2);
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => !q || f.path.toLowerCase().includes(q))
      .sort((a, b) => rank(a) - rank(b) || a.path.length - b.path.length || a.path.localeCompare(b.path))
      .slice(0, 50);
  }

  renderSuggestion(file, el) {
    el.createDiv({ text: file.basename });
    el.createDiv({ cls: 'sg-suggest-path', text: file.path });
  }

  selectSuggestion(file) {
    this.setValue(file.path);
    this.onPick(file.path);
    this.close();
  }
}

class SgSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.statusEl = null;
  }

  showStatus() {
    if (this.statusEl) this.statusEl.setText(this.plugin.status || '');
  }

  display() {
    const p = this.plugin;
    const s = p.settings;
    const { containerEl } = this;
    containerEl.empty();

    const pathChanged = debounce(async (value) => {
      s.glossaryPath = value.trim();
      await p.saveSettings();
      await p.reload();
    }, 500, true);
    const glossary = new Setting(containerEl)
      .setName('Glossary note')
      .setDesc('The note that lists your terms, one list item each, such as "**ADM**: Audio Definition Model". Start typing to pick a note.')
      .addText((text) => {
        text.setPlaceholder('Glossary.md').setValue(s.glossaryPath).onChange(pathChanged);
        new SgNoteSuggest(this.app, text.inputEl, pathChanged);
      });
    this.statusEl = glossary.descEl.createDiv({ cls: 'sg-status' });
    this.showStatus();

    const toggle = (name, desc, key, after) =>
      new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addToggle((t) =>
          t.setValue(!!s[key]).onChange(async (v) => {
            s[key] = v;
            await p.saveSettings();
            after();
          })
        );
    const redraw = () => p.refreshViews();
    const rematch = () => p.rebuild();

    new Setting(containerEl).setName('Where').setHeading();
    toggle('Reading view', 'Mark terms in notes you are reading.', 'inReading', redraw);
    toggle('While editing', 'Mark terms in Live Preview and Source mode. Ctrl-click (Cmd-click on a Mac) a term to open the glossary.', 'inEditor', redraw);

    new Setting(containerEl).setName('Matching').setHeading();
    toggle('First use only', 'Mark only the first time each term appears in a note.', 'firstOnly', redraw);
    toggle('Match case', 'Match the term exactly as written in the glossary, so "AR" does not match "ar". A term written as ^term in the glossary always matches in any case.', 'caseSensitive', rematch);
    toggle('Plurals', 'Also match simple plurals such as "BAs" and "AR\'s".', 'plurals', rematch);

    new Setting(containerEl).setName('Appearance').setHeading();
    new Setting(containerEl)
      .setName('Look')
      .setDesc('How a marked term looks in the note.')
      .addDropdown((d) =>
        d
          .addOptions(SG_LOOKS)
          .setValue(s.look)
          .onChange(async (v) => {
            s.look = v;
            await p.saveSettings();
            for (const doc of p.docs) p.applyLook(doc);
          })
      );
    new Setting(containerEl)
      .setName('Hover delay')
      .setDesc('How long, in milliseconds, to hover over a term before its explanation appears.')
      .addSlider((sl) =>
        sl
          .setLimits(0, 1000, 50)
          .setValue(Number(s.hoverDelay) || 0)
          .setDynamicTooltip()
          .onChange(async (v) => {
            s.hoverDelay = v;
            await p.saveSettings();
          })
      );
  }
}
