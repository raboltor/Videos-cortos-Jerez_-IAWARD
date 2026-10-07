// EPISODE CONFIGURATION - Episode 01: IAWARD
// Edit this file (or copy it to episodes/epNN-<project>.config.js) to make another episode.
// All times are absolute seconds on the fixed 45 s series timeline (see src/series.js):
//   opening 0-4 | project 4-11 | need 11-17 | how 17-30 | value 30-37 | next 37-43 | closing 43-45
// Visuals are chosen from the engine's visual library by `type` (see README "Visual library").
window.EPISODE_CONFIG = {
  episodeNumber: 1,
  totalEpisodes: 18,
  projectTitle: 'IAWARD', // never expand this acronym
  company: 'ACCIONA',
  division: 'CAI',
  businessContext: 'Construction',
  tagline: 'AI agents for procurement',
  closingLine: 'AI proposes.\nBuyers approve.', // \n = line break

  // The recurring object that travels through the episode (fictional illustration).
  openingVisual: {
    type: 'documentSwarm',
    hero: {
      kind: 'Purchase request',
      ref: 'PR-0001',
      item: 'Formwork panels',
      note: 'Illustrative example',
    },
    satellites: ['Offer', 'Offer', 'Message', 'Quote', 'Spec', 'Offer'],
  },

  // ---- Approved content per chapter ---------------------------------------------------------
  projectDescription: {
    messages: [{ text: 'From request to award', start: 4.35, end: 11 }],
    visual: {
      type: 'stagePipeline',
      stages: [
        { label: 'Request', sub: 'Prepare and validate', status: 'Validated' },
        { label: 'Offers', sub: 'Compare suppliers', status: 'Offers in' },
        { label: 'Negotiation', sub: 'Proposed terms', status: 'Terms' },
        { label: 'Award', sub: 'Buyer decision', status: 'Awarded' },
        { label: 'Corporate ERP', sub: 'Business management system', status: 'Handed over', destination: true },
      ],
      destinationNote: 'Workflow destination',
    },
  },

  need: {
    messages: [{ text: 'Less manual work', start: 11.35, end: 17 }],
    visual: {
      type: 'clutterToFlow',
      frictions: ['Copied data', 'Supplier messages', 'Offer documents'],
      resolvedLabel: 'One coordinated workflow',
      reorganiseAt: 14.2,
    },
  },

  workflow: {
    messages: [
      { text: 'Prepare the request', start: 17.35, end: 20.0 },
      { text: 'Compare offers', start: 20.0, end: 23.3 },
      { text: 'Negotiate and recommend', start: 23.3, end: 26.4 },
      { text: 'AI proposes. Buyers approve.', start: 26.4, end: 30, emphasis: true },
    ],
    visual: {
      type: 'agentApprovalFlow',
      humanRole: 'Buyer',
      steps: [
        {
          agent: 'Request agent',
          start: 17.0,
          end: 20.0,
          scene: 'structure',
          fields: ['Item', 'Quantity', 'Delivery site'],
          result: 'Validated',
        },
        {
          agent: 'Offers agent',
          start: 20.0,
          end: 23.3,
          scene: 'compare',
          shortlistLabel: 'Suppliers to invite',
          compareLabel: 'Offers compared',
          options: ['Supplier A', 'Supplier B', 'Supplier C'],
          // Human approval checkpoint - IAWARD-specific content, not a series rule.
          // The buyer approves the proposed supplier list before any request for quotation goes out.
          checkpoint: { decision: 'Supplier selection', pauseAt: 21.1, approveAt: 22.15 },
        },
        {
          agent: 'Negotiation agent',
          start: 23.3,
          end: 26.4,
          scene: 'terms',
          terms: ['Delivery schedule', 'Payment terms', 'Volume'],
          checkpoint: { decision: 'Negotiation', pauseAt: 24.45, approveAt: 25.5 },
        },
        {
          agent: 'Award agent',
          start: 26.4,
          end: 30.0,
          scene: 'award',
          recommendation: 'Award recommendation',
          option: 'Supplier B',
          checkpoint: { decision: 'Award', pauseAt: 27.2, approveAt: 28.45 },
        },
      ],
      proposedLabel: 'Proposed',
      approvedLabel: 'Approved',
      waitingLabel: 'Awaiting buyer',
      idleLine: 'Approves or adjusts',
      actionLabel: 'Approve',
    },
  },

  value: {
    messages: [
      { text: 'Connected operations', start: 30.35, end: 33.6 },
      { text: 'Traceable decisions', start: 33.6, end: 37 },
    ],
    visual: {
      type: 'auditTrail',
      steps: ['Request', 'Offers', 'Negotiation', 'Award', 'Corporate ERP'],
      trailTitle: 'Audit trail',
      trailAt: 33.6,
      records: [
        { text: 'Request', state: 'Logged', by: 'ai' },
        { text: 'Selection', state: 'Approved', by: 'buyer' },
        { text: 'Terms', state: 'Approved', by: 'buyer' },
        { text: 'Award', state: 'Approved', by: 'buyer' },
        { text: 'Transfer', state: 'Logged', by: 'ai' },
      ],
    },
  },

  nextSteps: {
    messages: [
      { text: 'Refine with historical data', start: 37.35, end: 40.1 },
      { text: 'Adapt to more countries', start: 40.1, end: 43 },
    ],
    visual: {
      type: 'futureExpansion',
      plannedBadge: 'Planned evolution',
      historyLabel: 'Past purchase records',
      refineLabel: 'Future refinement',
      expandAt: 40.1,
      expandLabel: 'Local rules',
      checkpoints: 5, // abstract regulatory checkpoints - no countries are named
    },
  },

  // ---- Narration (English). Total ~100 spoken words. -----------------------------------------
  narration: [
    { chapter: 'opening', text: 'Meet IAWARD: AI agents for procurement at ACCIONA.' },
    {
      chapter: 'project',
      text: 'It supports the whole procurement journey, from purchase request to contract award, and information transfer to the corporate ERP.',
    },
    {
      chapter: 'need',
      text: 'Procurement involves manual tasks, supplier questions and repeated comparisons. IAWARD helps streamline that work.',
    },
    {
      chapter: 'how',
      text: 'Specialised AI agents prepare requests, compare offers and support negotiation. The buyer supervises throughout, and explicitly approves every supplier selection, negotiation and award decision. AI proposes. Buyers approve.',
    },
    {
      chapter: 'value',
      text: 'The result: the workflow connects operational tasks, while audit records keep proposals and decisions traceable.',
    },
    {
      chapter: 'next',
      text: 'Next, planned phases: refinement using historical purchasing data, and adaptation to more countries and local regulations.',
    },
    { chapter: 'closing', text: '' },
  ],

  // ---- Subtitles: short phrase chunks, max two lines. Also exported as SRT. ------------------
  captions: [
    { start: 0.2, end: 3.8, text: 'Meet IAWARD: AI agents for procurement at ACCIONA.' },

    { start: 4.3, end: 6.4, text: 'It supports the whole procurement journey,' },
    { start: 6.4, end: 8.6, text: 'from purchase request to contract award,' },
    { start: 8.6, end: 10.85, text: 'and information transfer to the corporate ERP.' },

    { start: 11.2, end: 13.2, text: 'Procurement involves manual tasks,' },
    { start: 13.2, end: 15.0, text: 'supplier questions and repeated comparisons.' },
    { start: 15.0, end: 16.85, text: 'IAWARD helps streamline that work.' },

    { start: 17.2, end: 19.4, text: 'Specialised AI agents prepare requests,' },
    { start: 19.4, end: 21.4, text: 'compare offers and support negotiation.' },
    { start: 21.4, end: 23.4, text: 'The buyer supervises throughout,' },
    { start: 23.4, end: 25.6, text: 'and explicitly approves every supplier selection,' },
    { start: 25.6, end: 27.6, text: 'negotiation and award decision.' },
    { start: 27.6, end: 29.85, text: 'AI proposes. Buyers approve.' },

    { start: 30.2, end: 32.6, text: 'The result: the workflow connects operational tasks,' },
    { start: 32.6, end: 34.7, text: 'while audit records keep proposals' },
    { start: 34.7, end: 36.85, text: 'and decisions traceable.' },

    { start: 37.2, end: 38.7, text: 'Next, planned phases:' },
    { start: 38.7, end: 40.5, text: 'refinement using historical purchasing data,' },
    { start: 40.5, end: 42.85, text: 'and adaptation to more countries and local regulations.' },
  ],

  // Fictional illustrations only. No real suppliers, prices, budgets or people.
  visualAssets: {
    logo: null, // no approved ACCIONA logo asset supplied -> clean text treatment is used
    requestCard: 'Fictional purchase request PR-0001 (Formwork panels)',
    suppliers: 'Fictional: Supplier A, Supplier B, Supplier C (no commercial terms shown)',
    buyerIcon: 'Generic person glyph labelled "Buyer"',
  },

  evidenceNotes: [
    'Primary source: approved project information in the brief. Attachments used only to understand the process.',
    'Procurement proposal p.7 (Source-to-Pay scope): request -> RFQ -> negotiation -> contract/order, with buyer approval diamonds and "traceability of activities" across the flow. Reinterpreted as the vertical 5-stage pipeline and the audit trail.',
    'Technical-functional deck slides 6-9: specialised agents (request parser, supplier selector, RFQ builder, offer validator, scenario evaluator, negotiator, award recommender) and human gates where the flow stops until the buyer validates (supplier list, negotiation scripts, award recommendation). Simplified to four named agents and three checkpoints.',
    'Deck slide 9: the buyer can accept or modify; a rejection returns the flow to the previous step. Shown as "Approves or adjusts".',
    'Follow-up deck (Phase 2 list): integrations, adaptation to other geographies and agent learning are post-pilot items, consistent with the approved "What\u2019s next".',
    'Not used: supplier names, budgets, fees, FTE estimates, dates, KPIs, the technical stack/infrastructure, team details, and the robot mascot (brief asks to avoid humanoid robots).',
    'ACCIONA logo: only embedded raster copies inside third-party slides (dark lettering on white), not a clean approved asset for a black background, so the text treatment "ACCIONA" is used.',
    'Every supplier selection, negotiation and award decision is shown paused until the buyer presses Approve.',
    'AI output is labelled "Proposed" (cyan, dashed); buyer decisions are labelled "Approved" (red, solid, with buyer icon).',
    'Corporate ERP is shown as the workflow destination, not as a live product interface. No SAP integration is shown or implied.',
    'No savings, monetary, adoption, speed or launch-date figures are shown.',
    'Historical-data refinement and expansion are labelled "Planned evolution" / "Future refinement". No countries are named.',
  ],
};
