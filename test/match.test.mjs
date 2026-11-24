import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { buildMatcher, findTerms, skipRanges, firstLines, linkTerms, sgMeanings } = load(['buildMatcher', 'findTerms', 'skipRanges', 'firstLines', 'linkTerms', 'sgMeanings']);

const entries = ['AR', 'AI', 'AIUI', 'BA', 'CI/CD', 'C++'].map((term, line) => ({ term, def: '', line }));
const m = buildMatcher(entries);
const terms = (text, opts) => findTerms(text, m, opts).map((h) => text.slice(h.from, h.to));

test('whole words only', () => {
  assert.deepEqual(terms('AR, ARM, CAR, AR-based, (AR) AR.'), ['AR', 'AR', 'AR', 'AR']);
  assert.deepEqual(terms('AIUI the AI said'), ['AIUI', 'AI']);
  assert.deepEqual(terms('BAR BA_x xBA'), []);
});

test('terms with symbols', () => {
  assert.deepEqual(terms('Ask CI/CD about C++ and CI/CDs'), ['CI/CD', 'C++', 'CI/CDs']);
});

test('case-sensitive by default; optional ignore case', () => {
  assert.deepEqual(terms('ar Ar AR'), ['AR']);
  const mi = buildMatcher(entries, { caseSensitive: false });
  const hits = findTerms('ar Ar', mi);
  assert.deepEqual(
    hits.map((h) => h.term),
    ['AR', 'AR']
  );
});

test('plurals', () => {
  assert.deepEqual(terms("two BAs and the AR's view; BAss"), ['BAs', "AR's"]);
  const mp = buildMatcher(entries, { plurals: false });
  assert.deepEqual(
    findTerms('two BAs and BA', mp).map((h) => h.term),
    ['BA']
  );
});

test('first use only', () => {
  const hits = findTerms('AR then AR then BA', m, { firstOnly: true });
  assert.deepEqual(
    hits.map((h) => h.from),
    [0, 16]
  );
});

test('no terms, no matcher', () => {
  assert.equal(buildMatcher([]), null);
  assert.deepEqual(findTerms('AR', null), []);
});

test('skips code, links, headings, frontmatter, tags, URLs and comments', () => {
  const text = [
    '---',
    'title: AR',
    '---',
    '# AR heading',
    'Text `AR` [[AR]] [AR](x.md) #AR https://ar.com/AR <span title="AR">',
    '```',
    'AR in code',
    '```',
    '%% AR %% <!-- AR -->',
    '$$',
    'AR',
    '$$',
    'Real AR here',
  ].join('\n');
  const hits = findTerms(text, m, { skip: skipRanges(text) });
  assert.equal(hits.length, 1);
  assert.equal(text.slice(hits[0].from - 5, hits[0].to), 'Real AR');
});

test('an unclosed code block runs to the end', () => {
  const text = 'AR\n```\nAR';
  assert.equal(findTerms(text, m, { skip: skipRanges(text) }).length, 1);
});

test('firstLines gives the line of each first use', () => {
  const text = '# AR\nthe BA\n`AR`\nAR and BA\n';
  const lines = firstLines(text, m);
  assert.equal(lines.get('BA'), 1);
  assert.equal(lines.get('AR'), 3);
});

// bug: "[[SYMCA]]" in a note was never marked, because links are skipped
test('links to a term are marked on the text they show', () => {
  const text = 'see [[AR]], [[AR#Uses|AR]], [[Other|BA]], [BA](x.md), [[ARM]], ![[AR]], `[[AR]]`';
  const shown = (h) => text.slice(h.from, h.to);
  const hits = linkTerms(text, m);
  assert.deepEqual(
    hits.map((h) => [shown(h), h.term]),
    [
      ['AR', 'AR'],
      ['AR', 'AR'],
      ['BA', 'BA'],
      ['BA', 'BA'],
    ]
  );
});

test('a link uses its target when its text is not a term', () => {
  const text = '[[AR|augmented reality]]';
  const hits = linkTerms(text, m);
  assert.equal(hits.length, 1);
  assert.equal(text.slice(hits[0].from, hits[0].to), 'augmented reality');
});

test('skipRanges can leave links out', () => {
  assert.equal(skipRanges('[[AR]] and [a](b)').length, 2);
  assert.equal(skipRanges('[[AR]] and [a](b)', { links: false }).length, 0);
});

test('^ terms match in any case, the others as written', () => {
  const mx = buildMatcher([{ term: 'AR' }, { term: 'socitm', anyCase: true }, { term: 'Big Data', anyCase: true }]);
  const text = 'Socitm, SOCITM, socitm and Socitms; BIG DATA and big data; AR not ar';
  assert.deepEqual(
    findTerms(text, mx).map((h) => [text.slice(h.from, h.to), h.term]),
    [
      ['Socitm', 'socitm'],
      ['SOCITM', 'socitm'],
      ['socitm', 'socitm'],
      ['Socitms', 'socitm'],
      ['BIG DATA', 'Big Data'],
      ['big data', 'Big Data'],
      ['AR', 'AR'],
    ]
  );
  assert.deepEqual(linkTerms('[[SOCITM]] and [Socitm](x.md)', mx).map((h) => h.term), ['socitm', 'socitm']);
});

test('text written exactly as a term gets that entry before a ^ one', () => {
  const mx = buildMatcher([{ term: 'Socitm', def: 'exact' }, { term: 'socitm', def: 'any', anyCase: true }]);
  assert.equal(mx.entryOf('Socitm').def, 'exact');
  assert.equal(mx.entryOf('SOCITM').def, 'any');
});

test('with Match case off, ^ makes no difference', () => {
  const mx = buildMatcher([{ term: 'AR' }, { term: 'socitm', anyCase: true }], { caseSensitive: false });
  assert.deepEqual(findTerms('ar SOCITM', mx).map((h) => h.term), ['AR', 'socitm']);
});

test('a term listed twice: both meanings, in glossary order', () => {
  const entries = [
    { term: 'PMO', def: 'Project Management Office' },
    { term: 'AR', def: 'Augmented Reality' },
    { term: 'PMO', def: 'Portfolio Management Office' },
    { term: 'pmo', def: 'any-case meaning', anyCase: true },
    { term: 'Pmo', def: 'only written Pmo' },
  ];
  const defs = (term, cs) => sgMeanings(entries, term, cs).map((e) => e.def);
  const mx = buildMatcher(entries);
  assert.equal(mx.entryOf('PMO').def, 'Project Management Office');
  assert.deepEqual(defs('PMO'), ['Project Management Office', 'Portfolio Management Office', 'any-case meaning']);
  // matched through the ^ entry ("pMo"): only meanings that match any capitals
  assert.equal(mx.entryOf('pMo').term, 'pmo');
  assert.deepEqual(defs('pmo'), ['any-case meaning']);
  assert.deepEqual(defs('Pmo'), ['any-case meaning', 'only written Pmo']);
  // Match case off: every spelling shares one tooltip
  assert.deepEqual(defs('PMO', false).length, 4);
  assert.deepEqual(defs('AR'), ['Augmented Reality']);
});
