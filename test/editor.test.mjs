import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { sgEditorExtension, buildMatcher, SimpleGlossaryPlugin } = load(['sgEditorExtension', 'buildMatcher', 'SimpleGlossaryPlugin']);

const entries = [{ term: 'AR' }, { term: 'BA' }];
const fakePlugin = (settings, path = 'Glossary.md') => ({
  matcher: buildMatcher(entries),
  settings: { inEditor: true, firstOnly: true, ...settings },
  glossaryPathResolved: () => path,
});
const fakeView = (text, file = 'Note.md') => ({
  state: { doc: { length: text.length, toString: () => text }, field: () => ({ file: { path: file } }) },
});
const marks = (plugin, text, file) => {
  const Cls = sgEditorExtension(plugin); // the stand-in ViewPlugin.fromClass returns the class itself
  return new Cls(fakeView(text, file)).decorations.map((d) => [text.slice(d.from, d.to), d.deco.attributes['data-sg-term']]);
};

test('the plugin source loads', () => {
  assert.equal(typeof SimpleGlossaryPlugin, 'function');
});

test('editor marks the first use of each term, outside code', () => {
  assert.deepEqual(marks(fakePlugin(), '`AR` and AR, BAs, AR again'), [
    ['AR', 'AR'],
    ['BAs', 'BA'],
  ]);
});

test('editor marks every use when first use only is off', () => {
  assert.equal(marks(fakePlugin({ firstOnly: false }), 'AR AR AR').length, 3);
});

test('editor leaves the glossary note itself and switched-off editors alone', () => {
  assert.deepEqual(marks(fakePlugin(), 'AR', 'Glossary.md'), []);
  assert.deepEqual(marks(fakePlugin({ inEditor: false }), 'AR'), []);
});
