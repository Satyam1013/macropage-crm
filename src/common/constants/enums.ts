export const ROLES = ['ADMIN', 'CUSTOMER'] as const;
export type Role = (typeof ROLES)[number];

export const LEAD_STAGES = [
  'LEAD',
  'IDENTIFIED',
  'GENERATED',
  'QUALIFIED',
  'DEMO',
  'PROPOSAL',
  'NEGOTIATION',
  'VERBAL',
  'PENDING',
  'WON',
  'CANCELLED',
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** Stages a lead can be moved to through PATCH /leads/:id/stage (everything except WON). */
export const MANUAL_LEAD_STAGES = LEAD_STAGES.filter((s) => s !== 'WON') as Exclude<
  LeadStage,
  'WON'
>[];

/** Stages counted as "open pipeline". */
export const PIPELINE_LEAD_STAGES = LEAD_STAGES.filter(
  (s) => s !== 'WON' && s !== 'CANCELLED',
) as LeadStage[];

export const PROJECT_STAGES = [
  'INITIATE',
  'STARTED',
  'IN_PROGRESS',
  'TESTING',
  'CLOUD_SETUP',
  'SERVER_SETUP',
  'CONFIRMATION_TESTING',
  'DEPLOYMENT',
  'CLIENT_CONFIRMATION',
  'CLOSED',
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const PAYMENT_MODES = ['BANK_TRANSFER', 'UPI', 'CASH', 'CHEQUE', 'CARD'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const EXPENSE_CATEGORIES = [
  'SALARY',
  'FREELANCER',
  'SOFTWARE_TOOLS',
  'CLOUD_HOSTING',
  'DOMAIN_SSL',
  'TRAVEL',
  'MARKETING',
  'OFFICE_MISC',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const STAFF_TYPES = ['ENGINEER', 'STAFF'] as const;
export type StaffType = (typeof STAFF_TYPES)[number];
