// Evidence labels: what kind of figure a card or summary line is showing. A label never changes how a figure is
// worked out; it only says whether the figure was reported, worked out, planned or recorded, so a yearly average
// cannot sit under a "now" headline without anyone noticing.
export type Evidence='observed'|'estimated'|'scheduled'|'historical';
export const EVIDENCE:Record<Evidence,{label:string;glyph:string;meaning:string}>={
 observed:{label:'Observed',glyph:'●',meaning:'Reported by a source for a specific recent moment'},
 estimated:{label:'Estimated',glyph:'◐',meaning:'Worked out from other evidence, or modelled by the provider'},
 scheduled:{label:'Scheduled',glyph:'◷',meaning:'Planned in advance; not a report of what is happening'},
 historical:{label:'Historical',glyph:'↺',meaning:'A record of the past, or map data from a fixed snapshot'},
};
/** A small badge: glyph and word, with the border style (solid, dashed, dotted, none) as a third cue besides colour. */
export const evidenceBadge=(kind:Evidence)=>`<span class="evidence ${kind}" title="${EVIDENCE[kind].meaning}"><i aria-hidden="true">${EVIDENCE[kind].glyph}</i>${EVIDENCE[kind].label}</span>`;
