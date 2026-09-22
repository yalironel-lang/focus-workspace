/**
 * M0.9C2.2 — conservative deterministic detector for context-dependent follow-ups.
 * No NLP / model rewrite. Used only to shape the retrieval embedding string.
 */

/** Explicit standalone topical asks must not be hijacked by prior context. */
export function isExplicitStandaloneAskCourseQuestion(question: string): boolean {
  const q = question.trim();
  if (!q) return false;

  // Long standalone prompts are treated as topical.
  if (q.length >= 100) return true;

  const lower = q.toLowerCase();

  // "Explain the Code of Hammurabi." / "What is natural law in …"
  // Require a substantial topical tail after a common ask verb, without
  // relying solely on demonstratives/ordinals.
  const topicalLead =
    /^(?:please\s+)?(?:can you\s+|could you\s+|would you\s+)?(?:please\s+)?(?:explain|describe|summarize|define|outline|compare|contrast|discuss|analyze|analyse)\s+(.+)$/i;
  const whatIsLead =
    /^(?:please\s+)?(?:what(?:'s| is| are)|who(?:'s| is| are)|when(?:'s| is| are)|where(?:'s| is| are))\s+(.+)$/i;

  const m = q.match(topicalLead) || q.match(whatIsLead);
  if (!m?.[1]) return false;
  const tail = m[1].trim();
  if (tail.length < 12) return false;

  // If the tail is mostly referential ("that more simply", "the second step") → not standalone.
  if (isReferentialAskCourseFollowUp(q)) return false;

  // Tail that is only pronouns/demonstratives is not a standalone topic.
  if (/^(that|this|it|those|these|them|the (?:first|second|third|previous|last)(?:\s+\w+)?)[.?!]*$/i.test(tail)) {
    return false;
  }

  void lower;
  return true;
}

/**
 * True when the current question likely depends on prior conversational referents.
 * Conservative: prefer false negatives over hijacking explicit new topics.
 */
export function isReferentialAskCourseFollowUp(question: string): boolean {
  const q = question.trim();
  if (!q) return false;

  // Explicit standalone topics win — never classify as referential.
  // (Checked via length + lead patterns without recursion into this function.)
  if (q.length >= 100) return false;

  const lower = q.toLowerCase().replace(/\s+/g, ' ').trim();
  const stripped = lower.replace(/[.?!]+$/g, '').trim();

  // Ultra-short why/how/etc.
  if (/^(why|how|really|and|so|ok|okay)(\s+though)?$/i.test(stripped)) return true;
  if (/^(why|how)\s+(is|are|was|were|did|does|do|can|could|would|should)?\s*(that|this|it)?$/i.test(stripped)) {
    return true;
  }

  // Classic anaphora / clarification patterns
  if (/\bwhat do you mean\b/.test(lower)) return true;
  if (/\bi don'?t understand\b/.test(lower) || /\bi do not understand\b/.test(lower)) {
    return true;
  }
  if (/\bcan you (explain|clarify|expand|simplify)\b/.test(lower)) return true;
  if (/\bexplain that\b/.test(lower)) return true;
  if (/\bmore simply\b/.test(lower)) return true;
  if (/\bin (?:simpler|simpler?|plain) (?:terms|words|english)\b/.test(lower)) return true;
  if (/\bgive me an example\b/.test(lower) || /\bcan you give (me )?an example\b/.test(lower)) {
    return true;
  }
  if (/\bwhat about (the )?(first|second|third|previous|last|other)\b/.test(lower)) return true;
  if (/\b(the )?(first|second|third|previous|last|next) (step|one|part|point)\b/.test(lower)) {
    return true;
  }

  // Short questions with demonstratives / light pronouns
  if (q.length <= 72) {
    if (/\b(that|this|those|these)\b/.test(lower)) return true;
    if (/\b(it|them)\b/.test(lower) && /^(why|how|what|can|could|would|please|explain|clarify)/.test(lower)) {
      return true;
    }
  }

  // Guard: "Explain the Code of Hammurabi" style — topical lead + long tail, no referential markers
  const topicalLead =
    /^(?:please\s+)?(?:can you\s+|could you\s+)?(?:explain|describe|summarize|define|outline)\s+(.+)$/i;
  const whatIsLead = /^(?:what(?:'s| is| are))\s+(.+)$/i;
  const m = q.match(topicalLead) || q.match(whatIsLead);
  if (m?.[1] && m[1].trim().length >= 12) {
    const tail = m[1].toLowerCase();
    const referentialTail =
      /\b(that|this|it|those|these|them|first|second|third|previous|step|one)\b/.test(tail) ||
      /\bmore simply\b/.test(tail) ||
      /\bexample\b/.test(tail);
    if (!referentialTail) return false;
  }

  return false;
}

/**
 * Decide whether prior user context should lead the retrieval embedding string.
 */
export function shouldLeadRetrievalWithPriorUserContext(input: {
  question: string;
  hasPriorUserContext: boolean;
}): boolean {
  if (!input.hasPriorUserContext) return false;
  if (isExplicitStandaloneAskCourseQuestion(input.question)) return false;
  return isReferentialAskCourseFollowUp(input.question);
}
