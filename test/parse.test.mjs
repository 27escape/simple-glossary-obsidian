import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { parseGlossary, sgCleanDef } = load(['parseGlossary', 'sgCleanDef']);

const SAMPLE = `# Glossary

 List of things that need explaining, minimum should be the item and a hashtag so that it gets linked around

* **ADM**: Audio Definition Model, <https://github.com/IRT-Open-Source/libadm>
* **LLM**: Large Language Model #ai
* **AIP**: Artificial Intelligence in Production
* **AR**: Augmented Reality
* [RAG](https://en.wikipedia.org/wiki/Retrieval-augmented_generation) Retrieval-Augmented Generation #ai
* **CI/CD**: Continuous Integration and Continuous Delivery
`;

test('reads the sample glossary', () => {
  const e = parseGlossary(SAMPLE);
  assert.deepEqual(
    e.map((x) => x.term),
    ['ADM', 'LLM', 'AIP', 'AR', 'RAG', 'CI/CD']
  );
  const by = Object.fromEntries(e.map((x) => [x.term, x]));
  assert.equal(by.ADM.def, 'Audio Definition Model');
  assert.equal(by.ADM.url, 'https://github.com/IRT-Open-Source/libadm');
  assert.equal(by.LLM.def, 'Large Language Model');
  assert.deepEqual([...by.LLM.tags], ['ai']);
  assert.equal(by.RAG.def, 'Retrieval-Augmented Generation');
  assert.equal(by.RAG.url, 'https://en.wikipedia.org/wiki/Retrieval-augmented_generation');
  assert.equal(by['CI/CD'].def, 'Continuous Integration and Continuous Delivery');
  assert.equal(by.ADM.line, 4);
});

test('other entry forms', () => {
  const e = parseGlossary(['- __BA__ - Business Analyst', '- [[RAG]]: Retrieval augmented generation', '1. KPI: Key performance indicator', '- **SLA:** Service level agreement'].join('\n'));
  assert.deepEqual(
    e.map((x) => [x.term, x.def]),
    [
      ['BA', 'Business Analyst'],
      ['RAG', 'Retrieval augmented generation'],
      ['KPI', 'Key performance indicator'],
      ['SLA', 'Service level agreement'],
    ]
  );
});

test('ignores headings, prose, tasks, code blocks, frontmatter and duplicates', () => {
  const text = ['---', 'tags:', '  - glossary', 'note: x', '---', '# Glossary', 'Some: prose', '- [ ] todo: later', '```', '- **X**: in code', '```', '- **AR**: first', '- **AR**: second', '- just a list item'].join('\n');
  assert.deepEqual(
    parseGlossary(text).map((x) => [x.term, x.def]),
    [['AR', 'first']]
  );
});

test('cleans definitions', () => {
  assert.deepEqual({ ...sgCleanDef(': See [the docs](https://x.org/a) and https://y.org #tag') }, { def: 'See the docs and', url: 'https://x.org/a', tags: ['tag'] });
  assert.equal(sgCleanDef(' **bold** and `code`, ').def, 'bold and code');
  assert.equal(sgCleanDef('').def, '');
});
