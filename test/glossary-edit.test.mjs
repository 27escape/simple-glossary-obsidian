import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { sgAddEntry, sgCheckEntry } = load(['sgAddEntry', 'sgCheckEntry']);
const add = (lines, term, def) => {
  const r = sgAddEntry(lines.join('\n'), term, def);
  return r.error ? r : r.text.split('\n');
};

test('adds the entry and sorts the list, ignoring Markdown and case', () => {
  const before = [
    '---',
    'title: Glossary',
    '---',
    '# Glossary',
    '',
    'Short name and description, one per line.',
    '',
    '- **MCA**: Mayoral Combined Authority',
    '- [RAG](https://example.org/rag) Retrieval-Augmented Generation #ai',
    '- GMCA: Greater Manchester Combined Authority',
    '- **ai**: lower-case term',
    '',
    'Last line.',
  ];
  assert.deepEqual(add(before, 'KPI', 'Key Performance Indicator'), [
    ...before.slice(0, 7),
    '- **ai**: lower-case term',
    '- GMCA: Greater Manchester Combined Authority',
    '- KPI: Key Performance Indicator',
    '- **MCA**: Mayoral Combined Authority',
    '- [RAG](https://example.org/rag) Retrieval-Augmented Generation #ai',
    '',
    'Last line.',
  ]);
});

test('one list marker per list: the one most items use', () => {
  assert.deepEqual(add(['* **B**: b', '* **D**: d', '1. **C**: c'], 'A', 'a'), ['* A: a', '* **B**: b', '* **C**: c', '* **D**: d']);
});

test('numbered lists are renumbered from their first number', () => {
  assert.deepEqual(add(['3. **C**: c', '4. **A**: a'], 'B', 'b'), ['3. **A**: a', '4. B: b', '5. **C**: c']);
});

test('lines under an entry move with it', () => {
  assert.deepEqual(add(['- **Z**: z', '  more about Z', '  - a sub-point', '- **B**: b'], 'M', 'm'), ['- **B**: b', '- M: m', '- **Z**: z', '  more about Z', '  - a sub-point']);
});

test('each section is sorted on its own; the new entry joins the longest list', () => {
  const r = add(['## Business', '- **SLA**: x', '- **KPI**: y', '', '## Tech', '- **LLM**: a', '- **AR**: b', '- **API**: c'], 'GPU', 'Graphics Processing Unit');
  assert.deepEqual(r, ['## Business', '- **KPI**: y', '- **SLA**: x', '', '## Tech', '- **API**: c', '- **AR**: b', '- GPU: Graphics Processing Unit', '- **LLM**: a']);
});

test('numbers sort as numbers', () => {
  assert.deepEqual(add(['- **5G**: a', '- **10G**: b'], '2FA', 'two-factor'), ['- 2FA: two-factor', '- **5G**: a', '- **10G**: b']);
});

test('a glossary with no entries yet gets a list at the end', () => {
  assert.deepEqual(add(['# Glossary', '', 'Intro.', '', ''], 'AR', 'Augmented Reality'), ['# Glossary', '', 'Intro.', '', '- AR: Augmented Reality', '']);
  assert.deepEqual(add([''], 'AR', 'Augmented Reality'), ['- AR: Augmented Reality', '']);
});

test('Windows line endings are kept', () => {
  const r = sgAddEntry('- **B**: b\r\n- **A**: a\r\n', 'C', 'c');
  assert.equal(r.text, '- **A**: a\r\n- **B**: b\r\n- C: c\r\n');
});

test('spaces are tidied', () => {
  assert.deepEqual(add(['- **B**: b'], '  CI/CD ', ' Continuous   Integration \n and Delivery '), ['- **B**: b', '- CI/CD: Continuous Integration and Delivery']);
});

test('refuses duplicates (any case), empty fields and Markdown characters in the term', () => {
  assert.match(add(['- **AR**: Augmented Reality'], 'ar', 'x').error, /^AR is already in the glossary: Augmented Reality\.$/);
  assert.equal(add(['- GMCA: Greater Manchester'], 'GMCA', 'x').error, 'GMCA is already in the glossary: Greater Manchester.');
  assert.equal(sgCheckEntry('', 'x', []), 'Enter the term.');
  assert.equal(sgCheckEntry('AR', '', []), 'Enter what it means.');
  for (const t of ['A:B', '**A**', 'A[1]', '#A', 'A|B', '`A`', 'A_B', '<A>']) assert.match(sgCheckEntry(t, 'x', []), /can't contain/);
});

test('new entries are plain "TERM: def" and read back with the same term', () => {
  const { parseGlossary } = load(['parseGlossary']);
  assert.equal(sgCheckEntry('x'.repeat(41), 'y', []), 'A term can be 40 characters at most.');
  for (const term of ['AR', 'CI/CD', 'C++', 'R&D', '5G', 'Socitm', 'Big Data', 'e-mail', 'x'.repeat(40)]) {
    const r = sgAddEntry('# Glossary\n', term, 'what it means');
    assert.equal(r.error, undefined, term);
    assert.match(r.text, new RegExp(`^- ${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: what it means$`, 'm'));
    const e = parseGlossary(r.text);
    assert.deepEqual([e.length, e[0].term, e[0].def], [1, term, 'what it means'], term);
  }
});

test('a ^ term is written with its ^, sorted without it, and checked for duplicates without it', () => {
  assert.deepEqual(add(['- RAID: risks', '- TA: Technical Architect'], '^ socitm', 'Society for Innovation'), ['- RAID: risks', '- ^socitm: Society for Innovation', '- TA: Technical Architect']);
  assert.equal(add(['- Socitm: Society'], '^socitm', 'x').error, 'Socitm is already in the glossary: Society.');
  assert.equal(add(['- ^socitm: Society'], 'SOCITM', 'x').error, 'socitm is already in the glossary: Society.');
  assert.equal(sgCheckEntry('^', 'x', []), 'Enter the term.');
  assert.match(sgCheckEntry('A^B', 'x', []), /can't contain/);
  assert.equal(sgCheckEntry('^' + 'x'.repeat(40), 'y', []), 'A term can be 40 characters at most.');
  const { parseGlossary } = load(['parseGlossary']);
  const e = parseGlossary(sgAddEntry('', '^' + 'x'.repeat(39), 'y').text);
  assert.deepEqual([e[0].term.length, e[0].anyCase], [39, true]);
});
