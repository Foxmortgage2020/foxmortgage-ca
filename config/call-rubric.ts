// The Call Review rubric (Agent session). This is the supervision
// instrument: every graded review cites this version, so rubric changes
// are config edits here with a changelog note in config/changelog.ts,
// never silent prompt drift. Item ids are stable; retire an item by
// removing it and bumping the version, never by reusing an id.
//
// Seeded from the Jul 10 reference review of the Aitken renewal call.

export const CALL_RUBRIC_VERSION = 1

export interface RubricItem {
  id: string
  label: string
  detail: string
}

export const CALL_RUBRIC: RubricItem[] = [
  {
    id: 'brief-used',
    label: 'Pre-call brief used',
    detail:
      'The call shows preparation: file facts arrive from the brief, not discovered live on the call.',
  },
  {
    id: 'facts-confirmed',
    label: 'File facts stated aloud and confirmed',
    detail:
      'Key stored facts (rate, amount, dates) are said to the client and confirmed or corrected, so the record and the client agree.',
  },
  {
    id: 'renewal-vs-refi',
    label: 'Renewal versus refinance need distinguished',
    detail:
      'The call establishes whether the client needs a straight renewal or has a borrowing need that makes this a refinance conversation.',
  },
  {
    id: 'income-employment',
    label: 'Income and employment changes asked',
    detail: 'Any change in income or employment since origination is asked about and noted.',
  },
  {
    id: 'obligations',
    label: 'Obligation changes asked',
    detail: 'New debts, support obligations, or other liabilities since origination are asked about.',
  },
  {
    id: 'property-plans-term',
    label: 'Property plans and term fit',
    detail:
      'How long the client plans to keep the property is asked, and the term discussion fits that answer.',
  },
  {
    id: 'rate-anchors',
    label: 'Gate-approved rate anchors with terms',
    detail:
      'Rates quoted on the call come from the approved book and are stated with their term; no invented or rounded numbers.',
  },
  {
    id: 'mechanism-explained',
    label: 'Mechanism explained when floating is discussed',
    detail:
      'If adjustable or variable comes up, the payment-moves versus amortization-erodes distinction is explained in plain words.',
  },
  {
    id: 'clock-set',
    label: 'The clock set',
    detail:
      'Time pressure is made concrete: maturity date, rate hold windows, or promo expiries with dates.',
  },
  {
    id: 'next-step',
    label: 'Next step with owner, date, and channel',
    detail:
      'The call ends with a specific next step: who does what, by when, through which channel.',
  },
]
