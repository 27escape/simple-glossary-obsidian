# Architecture

```mermaid
flowchart LR
  G[Glossary note] -->|cachedRead, on load and on save| P[parseGlossary]
  P --> E[entries]
  E --> M[buildMatcher]
  M --> R[Reading view<br>post-processor]
  M --> C[Editor<br>CodeMirror marks]
  R --> S[span.sg-term]
  C --> S
  S -->|hover| T[Tooltip]
  S -->|click / Ctrl-click| O[Open glossary at entry]
```

## Loading
`SimpleGlossaryPlugin.reload()` reads the glossary note with `vault.cachedRead`. `parseGlossary` turns it into entries, and `buildMatcher` makes one regular expression from all the terms, longest first. The expression only matches a term when there is no letter, digit or underscore either side of it, and it can include an optional plural ending. A term written `^term` in the glossary has `anyCase` set. With *Match case* on, `sgAnyCase` writes it into the expression letter by letter (`[sS][oO]…`), so it matches in any case while the other terms still match exactly. `entryOf` looks for an exact match first, then for an any-case one. The plugin reloads when the glossary note is saved, created, deleted or renamed. A rename updates the saved path.

## Marking
Both views put the same `span.sg-term[data-sg-term]` around each match, so the tooltip and click handling don't need to know which view a term is in.

- **Reading view** (`reading.js`): a Markdown post-processor walks the text nodes of each rendered section. It skips code, links, headings, tags, maths, embeds and frontmatter. Reading view renders a note one section at a time, so with *First use only* on, `firstLines` works out from the whole note (`ctx.getSectionInfo`) which section holds each term's first use. Only that section marks the term.
- **Editor** (`editor.js`): a CodeMirror `ViewPlugin` decorates the whole document. It skips the ranges from `skipRanges` (frontmatter, code blocks, `$$` maths, headings, inline code, links, tags, URLs, comments and HTML). It rebuilds the marks when the document changes or when the plugin sends `sgRefresh`.

When the terms or a matching setting change, `refreshViews()` sends `sgRefresh` to every open editor and re-renders every Reading view.

## Links
`linkTerms` (editor) and the end of `sgMarkDom` (Reading view) mark links whose shown text, or wikilink target, is a term, such as `[[SYMCA]]` or `[[Other|AR]]`. They carry the extra class `sg-link`, are marked every time ("first use only" doesn't apply), and keep the link's own click: the click handlers ignore `.sg-link`.

## Tooltip and clicks
`watchDocument` adds listeners at document level, for the main window and each pop-out window: `mouseover`, `mouseout`, `mousedown` (capture), `click`, `keydown` (Esc) and `scroll`. Only one tooltip exists at a time. It is attached to `body`, positioned with `setCssStyles` below the term (or above it when there's no room) and built with DOM calls. It stays open while the pointer is over it. Web links open through `window.open`, which Obsidian passes to the system browser. *Open in glossary* goes to the entry's line using the `line` ephemeral state. If the glossary is already open in a tab, that tab is reused; otherwise it opens in a new tab.

## Adding a term
`add-term.js` holds the *Add to glossary* window (`SgAddTermModal`) and `addTerm`. This is the only code that writes a note, and `tools/check.mjs` enforces that. The write happens through `vault.process`, which reads and writes in one step, or `vault.create` if the glossary doesn't exist yet. The text change itself is `sgAddEntry` in `glossary-edit.js`, which is plain text in and text out so it can be unit tested:

- `sgEntryRuns` groups the entries into runs. A block is an entry's line plus the more-indented lines under it, and a run is a set of blocks one after another at the same indent.
- The new entry joins the longest run.
- Each run is sorted by term (`Intl.Collator`, numeric, ignoring case).
- `sgRestyle` gives each run the list marker most of its items use, and renumbers numbered lists.

`sgCheckEntry` refuses a duplicate term (of any case), an empty term or description, and Markdown characters in the term.

## Settings
`data.json` holds `glossaryPath`, `inReading`, `inEditor`, `firstOnly`, `caseSensitive`, `plurals`, `look` and `hoverDelay`. *Look* is a class on `body` (`sg-look-underline`, `sg-look-highlight` or `sg-look-both`), so changing it needs no re-render. The glossary path field uses `AbstractInputSuggest` to list matching notes as you type.
