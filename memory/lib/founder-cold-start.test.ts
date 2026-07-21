import { test } from 'node:test';
import assert from 'node:assert';
import { scoreFounders, type FounderCandidate } from './founder-cold-start.ts';

// Verbatim formula: score = expertise x max(0.1,recency_decay) x (0.5+0.5xsalience)
// expertise = log1p(footprint). Pick footprint = E-1 so log1p = 1; days=0 so
// recency_decay = 1; salience = 1 so salience_factor = 1 -> score = 1.
test('scoring formula is copied verbatim', () => {
  const [r] = scoreFounders([{
    id: 'fndr-1', name: 'A', footprint: Math.E - 1,
    days_since_last_signal: 0, salience: 1, cold_start: false,
  }]);
  assert.ok(Math.abs(r.score - 1) < 1e-9, `expected ~1, got ${r.score}`);
  assert.ok(Math.abs(r.factors.expertise - 1) < 1e-9);
  assert.strictEqual(r.factors.recency_factor, 1);
  assert.strictEqual(r.factors.salience_factor, 1);
});

// Cold-start recency floor (0.1) — a founder with no dated signal must not
// multiplicative-zero out. recency_factor floored at 0.1 -> score = 1*0.1*1.
test('cold-start recency floor prevents multiplicative-zero', () => {
  const [r] = scoreFounders([{
    id: 'fndr-1', name: 'A', footprint: Math.E - 1,
    days_since_last_signal: null, salience: 1, cold_start: false,
  }]);
  assert.strictEqual(r.factors.recency_factor, 0.1);
  assert.ok(Math.abs(r.score - 0.1) < 1e-9, `expected ~0.1, got ${r.score}`);
});

// Missing salience is neutral 0.5 -> salience_factor 0.75.
test('missing salience is neutral (0.5)', () => {
  const [r] = scoreFounders([{
    id: 'fndr-1', name: 'A', footprint: Math.E - 1,
    days_since_last_signal: 0, salience: null, cold_start: false,
  }]);
  assert.strictEqual(r.factors.salience_factor, 0.75);
});

// DESIGN DECISION [gsig-098] — deliberately NOT implementing quality.md's
// notability gate. This is a contract-driven design choice, not a fix to a
// defect in copied code: whoknows.rankCandidates (the adapted source) has no
// gate and already scores every candidate. The gate is a PROSE convention in
// gbrain skills/conventions/quality.md ("A 400-follower person who tweeted once
// is not notable. When in doubt, DON'T create."). founder.schema requires the
// opposite: "Cold-start founders get a wide band, not a low value."
//
// To give these tests a CONCRETE original behavior to diverge from (rather than
// self-validating against only new fields), `gatedReferenceScore` encodes what a
// founder pipeline honoring quality.md's gate would produce: the SAME whoknows
// formula, but (a) it REFUSES to create a thin-footprint cold-start founder
// (returns null — "DON'T create"), and (b) it yields a bare point value with no
// band, so cold-start doubt could only be expressed by omitting/lowering the
// value, never by widening a band. Each assertion below pins the gate's output,
// then shows scoreFounders diverging from it.
const GATE_NOTABILITY_THRESHOLD = 1; // footprint below this + cold_start => "not notable"
function gatedReferenceScore(c: FounderCandidate): number | null {
  const notable = !c.cold_start || c.footprint >= GATE_NOTABILITY_THRESHOLD;
  if (!notable) return null; // notability gate refuses to represent -> excluded
  const expertise = Math.log1p(Math.max(0, c.footprint));
  const days = c.days_since_last_signal;
  const recency = days == null || !Number.isFinite(days)
    ? 0.1 : Math.max(0.1, Math.exp(-Math.max(0, days) / 180));
  let sal = c.salience == null || !Number.isFinite(c.salience) ? 0.5 : c.salience;
  sal = Math.min(1, Math.max(0, sal));
  return expertise * recency * (0.5 + 0.5 * sal); // point value, no band
}

// Divergence 1: a thin-footprint cold-start founder is represented and scored
// > 0 — never gated out or zeroed. The gated reference would EXCLUDE this exact
// founder, so this assertion fails against a quality.md-gated original.
test('cold-start founder is represented, not gated out (defect e — diverges from quality.md gate)', () => {
  const thinColdStart: FounderCandidate = {
    id: 'fndr-cold', name: 'Renée (first-time, no fundraise history)',
    footprint: 0.2, days_since_last_signal: null, salience: null, cold_start: true,
  };
  // Pin the ORIGINAL gated behavior: this thin cold-start founder is not created.
  assert.strictEqual(gatedReferenceScore(thinColdStart), null,
    'quality.md gate would refuse this thin-footprint cold-start founder');
  // scoreFounders diverges: it represents and scores the founder.
  const out = scoreFounders([thinColdStart]);
  const cold = out.find((r) => r.id === 'fndr-cold');
  assert.ok(cold, 'cold-start founder must not be excluded by a notability gate');
  assert.ok(cold!.score > 0, 'cold-start founder must not score 0 for absence of history');
  assert.strictEqual(cold!.cold_start, true);
  assert.strictEqual(cold!.confidence, 'speculative');
});

// Divergence 2 (the core guarantee): absence of history must NOT lower the
// value. Two founders with IDENTICAL footprint/recency/salience (both above the
// notability threshold, so both survive the gate) — one cold-start, one
// established. The gate assigns each the SAME bare point value (its formula
// ignores cold_start) with no band. scoreFounders keeps that same value for
// BOTH (no history penalty) but DIVERGES by expressing cold-start doubt as a
// wider band + lower confidence — representation the point-only gate cannot
// produce. This separates "wide band" (uncertainty) from "low value" (penalty),
// which the gate conflates into omission.
test('absence of history widens the band, never lowers the value (defect e — diverges from quality.md gate)', () => {
  const shared = { footprint: Math.E - 1, days_since_last_signal: 0, salience: 0.6 };
  const coldC: FounderCandidate = { id: 'fndr-cold', name: 'first-timer', ...shared, cold_start: true };
  const warmC: FounderCandidate = { id: 'fndr-warm', name: 'repeat', ...shared, cold_start: false };
  const [cold] = scoreFounders([coldC]);
  const [warm] = scoreFounders([warmC]);

  // Pin the ORIGINAL gated behavior: identical bare point value, cold or warm.
  const gatedCold = gatedReferenceScore(coldC);
  const gatedWarm = gatedReferenceScore(warmC);
  assert.strictEqual(gatedCold, gatedWarm);

  // scoreFounders keeps the value equal to the gate's ungated point value for
  // BOTH — the cold-start founder is not penalized in value.
  assert.strictEqual(cold.score, warm.score);
  assert.ok(Math.abs(cold.score - gatedCold!) < 1e-9, 'value must match the ungated formula, not be penalized');
  // ...but it diverges by widening the band + downgrading confidence for cold.
  const coldWidth = cold.band[1] - cold.band[0];
  const warmWidth = warm.band[1] - warm.band[0];
  assert.ok(coldWidth > warmWidth, 'cold-start must widen the band');
  assert.strictEqual(cold.confidence, 'low');
  assert.strictEqual(warm.confidence, 'high');
});

// Deterministic ordering: score DESC, id tie-break.
test('deterministic ordering by score then id', () => {
  const mk = (id: string): FounderCandidate => ({
    id, name: id, footprint: Math.E - 1, days_since_last_signal: 0, salience: 1, cold_start: false,
  });
  const out = scoreFounders([mk('fndr-b'), mk('fndr-a')]);
  assert.deepStrictEqual(out.map((r) => r.id), ['fndr-a', 'fndr-b']);
});
