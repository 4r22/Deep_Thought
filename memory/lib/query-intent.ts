/**
 * VC-shaped query intent classification.
 *
 * MIT License. Copyright (c) 2026 Garry Tan.
 * Adapted from gbrain src/core/search/query-intent.ts (MIT).
 *
 * Take [gsig-035] (search-stack steal #5): a pure-regex, zero-LLM classifier.
 * The EVENT patterns are already VC-shaped because this is Garry Tan's brain:
 * /\braised?\s+\$?\d/i, /\bfund(ing|raise)\b/i, /\bIPO\b/i, /\bacquisition\b/i,
 * /\bmerge[drs]?\b/i. Returns intent (entity|temporal|event|general) plus
 * orthogonal salience/recency suggestions, with the "canonical truth => off,
 * current state => on" rule and a narrow explicit-temporal-bound override.
 * Drop-in for routing memo / forum queries.
 *
 * Deviations from the original:
 *   - Zero imports (the source already had none).
 *   - The v0.36 cross-modal / image modality axis (ModalityMode,
 *     CROSS_MODAL_PATTERNS, isAmbiguousModalityQuery, suggestedModality) is
 *     dropped: vc-brain has no image-search path, so that caller does not exist.
 *     The intent / detail / salience / recency axes are copied VERBATIM.
 */

export type QueryIntent = 'entity' | 'temporal' | 'event' | 'general';
export type SalienceMode = 'off' | 'on' | 'strong';
export type RecencyMode = 'off' | 'on' | 'strong';

export interface QuerySuggestions {
  intent: QueryIntent;
  suggestedDetail: 'low' | 'medium' | 'high' | undefined;
  suggestedSalience: SalienceMode;
  suggestedRecency: RecencyMode;
}

// ── Pattern banks ──

const TEMPORAL_PATTERNS = [
  /\bwhen\b/i,
  /\blast\s+(met|meeting|call|conversation|chat|talked|spoke|seen|heard|time)\b/i,
  /\brecent(ly)?\b/i,
  /\bhistory\b/i,
  /\btimeline\b/i,
  /\bmeeting\s+notes?\b/i,
  /\bwhat('s| is| was)\s+new\b/i,
  /\blatest\b/i,
  /\bupdate(s)?\s+(on|from|about)\b/i,
  /\bhow\s+long\s+(ago|since)\b/i,
  /\b\d{4}[-/]\d{2}\b/i,
  /\blast\s+(week|month|quarter|year)\b/i,
];

// Already VC-shaped in the gbrain original.
const EVENT_PATTERNS = [
  /\bannounce[ds]?(ment)?\b/i,
  /\blaunch(ed|es|ing)?\b/i,
  /\braised?\s+\$?\d/i,
  /\bfund(ing|raise)\b/i,
  /\bIPO\b/i,
  /\bacquisition\b/i,
  /\bmerge[drs]?\b/i,
  /\bnews\b/i,
  /\bhappened?\b/i,
];

const ENTITY_PATTERNS = [
  /\bwho\s+is\b/i,
  /\bwhat\s+(is|does|are)\b/i,
  /\btell\s+me\s+about\b/i,
  /\bdescribe\b/i,
  /\bsummar(y|ize)\b/i,
  /\boverview\b/i,
  /\bbackground\b/i,
  /\bprofile\b/i,
  /\bwhat\s+do\s+(you|we)\s+know\b/i,
];

const FULL_CONTEXT_PATTERNS = [
  /\beverything\b/i,
  /\ball\s+(about|info|information|details)\b/i,
  /\bfull\s+(history|context|picture|story|details)\b/i,
  /\bcomprehensive\b/i,
  /\bdeep\s+dive\b/i,
  /\bgive\s+me\s+everything\b/i,
];

const CANONICAL_PATTERNS = [
  /\bwho\s+is\b/i,
  /\bwhat\s+(is|are|does|means?)\b/i,
  /\bdefin(e|ition|ing)\b/i,
  /\bexplain\s+(what|how|why)\b/i,
  /\b(history|origin|background)\s+of\b/i,
  /\bconcept\s+of\b/i,
  /\boverview\s+of\b/i,
  /\btell\s+me\s+about\b/i,
  /\bcompiled\s+truth\b/i,
  /::|->|\.\w+\(/,
  /\b(function|class|method|module)\s+\w+/i,
  /\b(graph|traversal|backlinks?|inbound|outbound)\b/i,
];

const STRONG_RECENCY_PATTERNS = [
  /\btoday\b/i,
  /\bright\s+now\b/i,
  /\bthis\s+morning\b/i,
  /\bjust\s+now\b/i,
];

const RECENCY_ON_PATTERNS = [
  /\bwhat'?s\s+(going\s+on|happening|new|latest|up)\b/i,
  /\b(latest|recent(ly)?|currently)\b/i,
  /\b(this|last|past)\s+(week|month|few\s+days|couple\s+days)\b/i,
  /\bmeeting\s+(prep|with|for|notes?|brief)\b/i,
  /\bbefore\s+(my|the|our)\s+(meeting|call|sync|chat)\b/i,
  /\bprep(are)?\s+(for|me)\b/i,
  /\bcatch(es|ing)?\b[\s\w]{0,15}\bup\b/i,
  /\bremind\s+me\s+(what|about|of)\b/i,
  /\b(update|status|progress)\s+(on|with|from)\b/i,
];

const EXPLICIT_TEMPORAL_BOUND_PATTERNS = [
  /\btoday\b/i,
  /\bright\s+now\b/i,
  /\bthis\s+morning\b/i,
  /\bthis\s+week\b/i,
  /\bsince\s+(launch|last|the|\d)/i,
  /\blast\s+\d+\s+(day|days|week|weeks|month|months)\b/i,
];

const SALIENCE_ON_PATTERNS = [
  /\bwhat'?s\s+(going\s+on|happening|been\s+going|been\s+up)\b/i,
  /\bcatch(es|ing)?\b[\s\w]{0,15}\bup\b/i,
  /\bremind\s+me\s+(what|about|of)\b/i,
  /\bprep(are)?\s+(for|me)\b/i,
  /\bbefore\s+(my|the|our)\s+(meeting|call|sync|chat)\b/i,
  /\bmeeting\s+(prep|with|for|brief)\b/i,
  /\b(update|status|progress)\s+(on|with|from)\b/i,
  /\bwhat\s+matters\b/i,
  /\bwhat'?s\s+important\b/i,
];

// ── Classifier ──

function matches(patterns: RegExp[], q: string): boolean {
  for (const re of patterns) if (re.test(q)) return true;
  return false;
}

/**
 * Classify a query and return all axis suggestions.
 *
 * Resolution rules (verbatim from gbrain):
 *   - intent:           full-context > temporal > event > entity > general
 *   - suggestedDetail:  entity=low, temporal/event=high, general=undefined
 *   - suggestedRecency: STRONG_RECENCY > RECENCY_ON; CANONICAL wins UNLESS
 *                       EXPLICIT_TEMPORAL_BOUND also matches; default 'off'
 *   - suggestedSalience: SALIENCE_ON; CANONICAL wins UNLESS
 *                        EXPLICIT_TEMPORAL_BOUND; default 'off'
 */
export function classifyQuery(query: string): QuerySuggestions {
  const intent = classifyQueryIntent(query);
  const suggestedDetail = intentToDetail(intent);

  const hasCanonical = matches(CANONICAL_PATTERNS, query);
  const hasTemporalBound = matches(EXPLICIT_TEMPORAL_BOUND_PATTERNS, query);
  const hasStrongRecency = matches(STRONG_RECENCY_PATTERNS, query);
  const hasRecencyOn = matches(RECENCY_ON_PATTERNS, query);
  const hasSalienceOn = matches(SALIENCE_ON_PATTERNS, query);

  let suggestedRecency: RecencyMode;
  if (hasCanonical && !hasTemporalBound) {
    suggestedRecency = 'off';
  } else if (hasStrongRecency) {
    suggestedRecency = 'strong';
  } else if (hasRecencyOn) {
    suggestedRecency = 'on';
  } else {
    suggestedRecency = 'off';
  }

  let suggestedSalience: SalienceMode;
  if (hasCanonical && !hasTemporalBound) {
    suggestedSalience = 'off';
  } else if (hasSalienceOn) {
    suggestedSalience = 'on';
  } else {
    suggestedSalience = 'off';
  }

  return { intent, suggestedDetail, suggestedSalience, suggestedRecency };
}

export function classifyQueryIntent(query: string): QueryIntent {
  if (matches(FULL_CONTEXT_PATTERNS, query)) return 'temporal';
  if (matches(TEMPORAL_PATTERNS, query)) return 'temporal';
  if (matches(EVENT_PATTERNS, query)) return 'event';
  if (matches(ENTITY_PATTERNS, query)) return 'entity';
  return 'general';
}

export function intentToDetail(intent: QueryIntent): 'low' | 'medium' | 'high' | undefined {
  switch (intent) {
    case 'entity':
      return 'low';
    case 'temporal':
      return 'high';
    case 'event':
      return 'high';
    case 'general':
      return undefined;
  }
}

/** v0.29.0 helper. Routes through classifyQuery internally. */
export function autoDetectDetail(query: string): 'low' | 'medium' | 'high' | undefined {
  return classifyQuery(query).suggestedDetail;
}
