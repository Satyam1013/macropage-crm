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

/** Pricing tiers quoted on a lead and chosen when it is won. */
export const PROJECT_PLANS = ['PRO', 'PREMIUM'] as const;
export type ProjectPlan = (typeof PROJECT_PLANS)[number];

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

/** What a work log is about: delivery on the project, or business work on its lead. */
export const WORK_LOG_SCOPES = ['PROJECT', 'LEAD'] as const;
export type WorkLogScope = (typeof WORK_LOG_SCOPES)[number];

export const WORK_LOG_STATUSES = ['IN_PROGRESS', 'DONE', 'BLOCKED'] as const;
export type WorkLogStatus = (typeof WORK_LOG_STATUSES)[number];

/** Allowed work types per scope (labels are stored and returned verbatim). */
export const WORK_TYPES: Record<WorkLogScope, readonly string[]> = {
  PROJECT: [
    'Frontend Development',
    'Backend Development',
    'Server Setup',
    'Architecture Design',
    'System Design',
    'Database Design',
    'API Integration',
    'UI/UX Design',
    'Testing & QA',
    'Deployment / DevOps',
    'Bug Fixing',
    'Project Management',
    'Client Coordination',
    'Documentation',
    'Other Tech Work',
    'Other Business Work',
  ],
  LEAD: [
    'Client Discussion',
    'Client Meeting',
    'Client Negotiation',
    'Client Documentation',
    'Requirement Gathering',
    'Quotation / Proposal',
    'Follow-up',
    'Other Business Work',
  ],
};

/** Lifecycle of an internal (non-client) project. */
export const INTERNAL_PROJECT_STATUSES = ['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED'] as const;
export type InternalProjectStatus = (typeof INTERNAL_PROJECT_STATUSES)[number];

/** What an expense is booked against. COMPANY / OWNER expenses belong to no project. */
export const EXPENSE_SCOPES = ['PROJECT', 'INTERNAL_PROJECT', 'COMPANY', 'OWNER'] as const;
export type ExpenseScope = (typeof EXPENSE_SCOPES)[number];
