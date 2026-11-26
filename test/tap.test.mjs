import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { SimpleGlossaryPlugin } = load(['SimpleGlossaryPlugin']);
const P = SimpleGlossaryPlugin.prototype;

// a stand-in element: closest() finds itself as a term, and an editor around it if inEditor
const el = ({ term = false, link = false, inEditor = false } = {}) => {
  const e = {
    classList: { contains: (c) => c === 'sg-link' && link },
    closest: (sel) => (sel === '.sg-term' ? (term ? e : null) : sel === '.cm-editor' ? (inEditor ? {} : null) : null),
  };
  return e;
};
const setup = () => {
  const tooltip = {
    el: null,
    target: null,
    show(t) {
      this.el = { contains: (n) => n === tipLink };
      this.target = t;
    },
    hide() {
      this.el = null;
      this.target = null;
    },
  };
  const tipLink = el();
  const ctx = { tooltip, termAt: P.termAt };
  const tap = (target) => {
    const evt = { target, prevented: false, preventDefault() { this.prevented = true; } };
    P.onTap.call(ctx, evt);
    return evt;
  };
  return { tooltip, tap, tipLink };
};

test('mobile: a tap on a term shows its tooltip; a second tap hides it', () => {
  const { tooltip, tap } = setup();
  const term = el({ term: true });
  const e = tap(term);
  assert.equal(tooltip.target, term);
  assert.equal(e.prevented, true); // Reading view: the tap doesn't go on to open anything
  tap(term);
  assert.equal(tooltip.target, null);
});

test('mobile: a tap elsewhere hides it; a tap inside the tooltip leaves it open', () => {
  const { tooltip, tap, tipLink } = setup();
  const term = el({ term: true });
  tap(term);
  tap(tipLink);
  assert.equal(tooltip.target, term);
  tap(el());
  assert.equal(tooltip.target, null);
});

test('mobile: another term moves the tooltip; a linked term is left to open its note', () => {
  const { tooltip, tap } = setup();
  const a = el({ term: true });
  const b = el({ term: true });
  tap(a);
  tap(b);
  assert.equal(tooltip.target, b);
  const e = tap(el({ term: true, link: true }));
  assert.equal(tooltip.target, null);
  assert.equal(e.prevented, false);
});

test('mobile: while editing, the tap still places the cursor', () => {
  const { tooltip, tap } = setup();
  const term = el({ term: true, inEditor: true });
  const e = tap(term);
  assert.equal(tooltip.target, term);
  assert.equal(e.prevented, false);
});
