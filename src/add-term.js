// "Add a term to the glossary": a small window with the term and what it means.
// Enter saves, Escape cancels. The only place the plugin writes a note: the glossary, when you press Save.

class SgAddTermModal extends Modal {
  constructor(app, plugin, term) {
    super(app);
    this.plugin = plugin;
    this.initial = term || '';
    this.busy = false;
  }

  onOpen() {
    const { contentEl, modalEl, titleEl } = this;
    modalEl.addClass('sg-add-modal');
    titleEl.setText('Add to glossary');
    const row = contentEl.createDiv({ cls: 'sg-add-row' });
    this.termEl = row.createEl('input', { type: 'text', cls: 'sg-add-term', attr: { placeholder: 'Term', 'aria-label': 'Term', spellcheck: 'false' } });
    this.defEl = row.createEl('input', { type: 'text', cls: 'sg-add-def', attr: { placeholder: 'What it means', 'aria-label': 'What it means' } });
    contentEl.createDiv({ cls: 'sg-add-hint', text: 'Start the term with ^ to match it in any case, such as ^socitm.' });
    this.msgEl = contentEl.createDiv({ cls: 'sg-add-message' });
    const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
    buttons.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
    buttons.createEl('button', { text: 'Save', cls: 'mod-cta' }).addEventListener('click', () => this.save());

    const onKey = (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        this.save();
      }
    }; // Escape is the modal's own: it closes without saving
    this.termEl.addEventListener('keydown', onKey);
    this.defEl.addEventListener('keydown', onKey);
    // say straight away what the term already means
    this.termEl.addEventListener('input', () => this.showProblem(this.existing(), true));
    this.termEl.value = this.initial;
    this.showProblem(this.existing(), true);
    (this.initial ? this.defEl : this.termEl).focus();
  }

  onClose() {
    this.contentEl.empty();
  }

  /** What the typed term already means, as a note (saving adds another meaning). */
  existing() {
    return sgExistingNote(this.termEl.value, this.plugin.entries);
  }

  showProblem(text, isNote) {
    this.msgEl.setText(text || '');
    this.msgEl.toggleClass('sg-add-note', !!isNote);
  }

  async save() {
    if (this.busy) return;
    const term = this.termEl.value.replace(/\s+/g, ' ').trim();
    const def = this.defEl.value.replace(/\s+/g, ' ').trim();
    const problem = sgCheckEntry(term, def, this.plugin.entries);
    if (problem) {
      this.showProblem(problem);
      (problem === 'Enter what it means.' || problem.endsWith('already has that meaning.') ? this.defEl : this.termEl).focus();
      return;
    }
    this.busy = true;
    try {
      const r = await this.plugin.addTerm(term, def);
      if (r.error) this.showProblem(r.error);
      else this.close();
    } finally {
      this.busy = false;
    }
  }
}

Object.assign(SimpleGlossaryPlugin.prototype, {
  /** Open the window; selected text in the note you're editing becomes the term. */
  openAddTerm() {
    const ed = this.app.workspace.activeEditor && this.app.workspace.activeEditor.editor;
    const sel = ed ? ed.getSelection().trim() : '';
    new SgAddTermModal(this.app, this, sel.length <= 40 && !/\n/.test(sel) ? sel : '').open();
  },

  /** Write term and def into the glossary note (made if it doesn't exist yet), sorted → {} or { error }. */
  async addTerm(term, def) {
    const path = this.glossaryPathResolved();
    if (!path) return { error: 'Choose your glossary note in the settings first.' };
    const file = this.glossaryFile();
    let result = null;
    try {
      if (file) {
        // process() reads and writes in one step, so nothing typed in the glossary meanwhile is lost
        await this.app.vault.process(file, (text) => {
          result = sgAddEntry(text, term, def);
          return result.error ? text : result.text;
        });
      } else {
        result = sgAddEntry('# Glossary\n', term, def);
        if (!result.error) await this.app.vault.create(path, result.text);
      }
    } catch (e) {
      return { error: `Couldn't save to ${path}: ${e.message || e}` };
    }
    if (result.error) return result;
    new Notice(`Added ${term} to the glossary`);
    await this.reload();
    return {};
  },
});
