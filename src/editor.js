// Live Preview and Source mode: a CodeMirror extension that marks glossary terms with the same span class.

const sgRefresh = StateEffect.define(); // sent by plugin.refreshViews() when the terms or settings change
const SG_EDITOR_MAX = 1000000; // characters; longer notes aren't marked while editing

function sgEditorExtension(plugin) {
  const marks = new Map();
  const markFor = (term) => {
    if (!marks.has(term)) marks.set(term, Decoration.mark({ class: 'sg-term', attributes: { 'data-sg-term': term } }));
    return marks.get(term);
  };

  class SgEditorMarks {
    constructor(view) {
      this.decorations = this.build(view);
    }

    update(u) {
      if (u.docChanged || u.transactions.some((t) => t.effects.some((e) => e.is(sgRefresh)))) this.decorations = this.build(u.view);
    }

    build(view) {
      const b = new RangeSetBuilder();
      const s = plugin.settings;
      if (!plugin.matcher || !s || !s.inEditor) return b.finish();
      const info = view.state.field(editorInfoField, false);
      if (info && info.file && info.file.path === plugin.glossaryPathResolved()) return b.finish();
      if (view.state.doc.length > SG_EDITOR_MAX) return b.finish();
      const text = view.state.doc.toString();
      for (const h of findTerms(text, plugin.matcher, { skip: skipRanges(text), firstOnly: s.firstOnly })) b.add(h.from, h.to, markFor(h.term));
      return b.finish();
    }
  }

  return ViewPlugin.fromClass(SgEditorMarks, { decorations: (v) => v.decorations });
}
