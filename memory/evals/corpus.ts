// Copyright (c) 2026 Garry Tan
// Adapted from gbrain src/eval/chronicle/harness.ts (MIT) — the
// seedChronicleEvalCorpus design: a small synthetic corpus with a KNOWN gold
// spec plus a planted supersession and a planted conflict, scored against gold.
//
// corpus.ts — a synthetic, VC-shaped planted-fault corpus. NO gbrain data: per
// the project's no-personal-data rule [gsig-115], every founder, company,
// funding round, and slug below is fabricated and follows the ferrite fixture
// pattern (intelligence/fixtures/signals-ferrite.json). All ids are slugs so the
// signal namespace and the search namespace coincide.
//
// The five planted faults (one per gate):
//   G1  sig-106 / sig-107  — same dedupe_key, differ only by source (press vs registry)
//   G2  sig-104 / sig-105  — deck claim vs registry reality, a mutual contradiction
//   G3  Mara Voss role      — CEO superseded by Advisor; old fact must survive
//   G4  'ferrite cache'     — near-miss of Ferrite Systems; baits a fabricated slug
//   G5  sig-108             — observed first (2026-02) but ingested last (out of order)
//
// Zero runtime imports (the type-only imports below erase under type-stripping).

import type { Signal, Entity, RoleFact, MemoryStore } from './store-interface.ts';
import type { GateSpec } from './gates.ts';

const OPP = 'companies/ferrite-systems';   // the opportunity under evaluation
const DECOY = 'companies/ferrous-labs';    // a real, similarly-named company (search decoy)
const MARA = 'people/mara-voss';           // the founder

/**
 * Signals for the corpus. Array order is the ingestion order: the non-out-of-
 * order signals ascend by observed_at, then sig-108 (earliest event, latest
 * capture) is ingested LAST — so a store that orders by ingestion misplaces it.
 */
export const SIGNALS: Signal[] = [
  {
    id: 'sig-101',
    founder_ids: [MARA],
    company_ids: [OPP],
    source: 'github',
    url: 'https://github.com/example/ferrite-systems',
    observed_at: '2026-03-10T00:00:00Z',
    ingested_at: '2026-03-11T02:00:00Z',
    summary: 'Repository first public: 40 stars, weekly release cadence begins. Founder is sole committer.',
    raw_ref: 'archive/github-ferrite-systems-2026-03-11.json',
    trust_tier: 'verified-online',
    authority: 'independent',
    dedupe_key: 'github.com/example/ferrite-systems',
    contradicts: [],
  },
  {
    id: 'sig-102',
    founder_ids: [MARA],
    company_ids: [OPP],
    source: 'hackathon',
    url: 'https://example-hacknation.dev/winners-2026',
    observed_at: '2026-05-11T00:00:00Z',
    ingested_at: '2026-05-12T09:00:00Z',
    summary: 'Winner, infrastructure track — "Ferrite Systems: content-addressed cache for agent CI". Field of ~400 teams.',
    raw_ref: 'archive/hacknation-winners-2026.html',
    trust_tier: 'verified-online',
    authority: 'independent',
    dedupe_key: 'hacknation-2026:ferrite-systems',
    contradicts: [],
  },
  {
    id: 'sig-103',
    founder_ids: [MARA],
    company_ids: [OPP],
    source: 'launch',
    url: 'https://example-social.com/mara-voss/launch',
    observed_at: '2026-06-02T16:40:00Z',
    ingested_at: '2026-06-03T01:00:00Z',
    summary: 'Launch post front-paged a major aggregator for ~6 hours; 214 points, three commenters self-identified as production users.',
    raw_ref: 'archive/launch-post-2026-06-02.html',
    trust_tier: 'verified-online',
    authority: 'independent',
    dedupe_key: 'launch:ferrite-systems:2026-06-02',
    contradicts: [],
  },
  {
    id: 'sig-105',
    founder_ids: [MARA],
    company_ids: [OPP],
    source: 'registry',
    url: 'https://registry.example.dev/package/ferrite-systems',
    observed_at: '2026-07-14T00:00:00Z',
    ingested_at: '2026-07-16T03:14:00Z',
    summary: 'Public package registry: 2,900 lifetime downloads, 340/week. Below the deck\'s claimed 3,100 active installations.',
    raw_ref: 'archive/registry-ferrite-systems-2026-07-16.json',
    trust_tier: 'verified-online',
    authority: 'independent',
    dedupe_key: 'registry:ferrite-systems',
    contradicts: ['sig-104'],
  },
  {
    id: 'sig-104',
    founder_ids: [MARA],
    company_ids: [OPP],
    source: 'deck',
    url: null,
    observed_at: '2026-07-15T14:02:00Z',
    ingested_at: '2026-07-15T14:02:31Z',
    summary: 'Deck page 7: "3,100 active installations across 240 organizations." No external corroboration attached.',
    raw_ref: 'decks/ferrite-systems-2026-07.pdf',
    trust_tier: 'claimed',
    authority: 'subject',
    dedupe_key: 'deck:ferrite-systems:2026-07',
    contradicts: ['sig-105'],
  },
  {
    id: 'sig-106',
    founder_ids: [MARA],
    company_ids: [OPP],
    source: 'press',
    url: 'https://example-press.com/ferrite-systems-seed',
    observed_at: '2026-07-16T00:00:00Z',
    ingested_at: '2026-07-16T12:00:00Z',
    summary: 'Ferrite Systems closed a $2.4M seed round led by Example Capital, announced 2026-07-16.',
    raw_ref: 'archive/press-ferrite-seed-2026-07-16.html',
    trust_tier: 'verified-online',
    authority: 'independent',
    dedupe_key: 'round:ferrite-systems:seed:2026-07',
    contradicts: [],
  },
  {
    id: 'sig-107',
    founder_ids: [MARA],
    company_ids: [OPP],
    source: 'registry',
    url: 'https://registry.example.gov/filings/ferrite-systems-seed',
    observed_at: '2026-07-16T00:00:00Z',
    ingested_at: '2026-07-16T18:30:00Z',
    summary: 'Ferrite Systems closed a $2.4M seed round led by Example Capital, announced 2026-07-16.',
    raw_ref: 'archive/filing-ferrite-seed-2026-07-16.json',
    trust_tier: 'verified-online',
    authority: 'independent',
    dedupe_key: 'round:ferrite-systems:seed:2026-07',
    contradicts: [],
  },
  {
    id: 'sig-201',
    founder_ids: [],
    company_ids: [DECOY],
    source: 'registry',
    url: 'https://registry.example.dev/package/ferrous-labs',
    observed_at: '2026-04-01T00:00:00Z',
    ingested_at: '2026-04-02T00:00:00Z',
    summary: 'Ferrous Labs — an unrelated metallurgy-tooling company. Present only to prove opportunity filtering and search near-miss handling.',
    raw_ref: 'archive/registry-ferrous-labs-2026-04-02.json',
    trust_tier: 'verified-online',
    authority: 'independent',
    dedupe_key: 'registry:ferrous-labs',
    contradicts: [],
  },
  {
    id: 'sig-108',
    founder_ids: [MARA],
    company_ids: [OPP],
    source: 'paper',
    url: 'https://example-preprints.org/abs/2602.00001',
    observed_at: '2026-02-01T00:00:00Z',
    ingested_at: '2026-07-19T08:00:00Z',
    summary: 'Preprint "Content-addressed caching for agent CI" — the technical seed of Ferrite Systems. Surfaced late during diligence; predates every other signal.',
    raw_ref: 'archive/preprint-2602.00001.pdf',
    trust_tier: 'verified-artifact',
    authority: 'independent',
    dedupe_key: 'preprint:2602.00001',
    contradicts: [],
  },
];

/** Searchable entities. `ferrite-cache` is deliberately NOT here — it is the bait. */
export const ENTITIES: Entity[] = [
  { slug: OPP, name: 'Ferrite Systems', aliases: ['ferrite'] },
  { slug: DECOY, name: 'Ferrous Labs', aliases: ['ferrous'] },
  { slug: MARA, name: 'Mara Voss', aliases: ['mara'] },
];

/** Role facts in supersession order: CEO first, then Advisor supersedes it. */
export const ROLE_FACTS: RoleFact[] = [
  { founder_id: MARA, company_id: OPP, role: 'CEO', valid_from: '2026-01-01', source_signal_id: 'sig-101' },
  { founder_id: MARA, company_id: OPP, role: 'Advisor', valid_from: '2026-07-05', source_signal_id: 'sig-106' },
];

/** The gold spec the gates score against. */
export const SPEC: GateSpec = {
  duplicateSignalIds: ['sig-106', 'sig-107'],
  duplicateExpectedSources: ['press', 'registry'],
  contradictionSignalIds: ['sig-104', 'sig-105'],
  supersession: { founderId: MARA, companyId: OPP, oldRole: 'CEO', newRole: 'Advisor' },
  fabricationBaitQuery: 'ferrite cache',
  forbiddenSlug: 'companies/ferrite-cache',
  expectedTargetSlug: OPP,
  opportunityId: OPP,
  // sig-101..105 (5) + {sig-106,sig-107 merged} (1) + sig-108 (1) = 7; sig-201 is the decoy company.
  expectedOpportunitySignalCount: 7,
  // The 7 record ids the set must contain: the five standalone OPP signals, the
  // merged seed-round record (keyed by first-ingested sig-106), and the late
  // sig-108. The decoy company's sig-201 must NOT appear.
  expectedOpportunitySignalIds: ['sig-101', 'sig-102', 'sig-103', 'sig-104', 'sig-105', 'sig-106', 'sig-108'],
};

/** Load the corpus into any MemoryStore, in the defined ingestion order. */
export async function loadCorpus(store: MemoryStore): Promise<void> {
  for (const e of ENTITIES) await store.putEntity(e);
  for (const s of SIGNALS) await store.ingest(s);
  for (const r of ROLE_FACTS) await store.assertRole(r);
}
