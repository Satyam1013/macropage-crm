/* eslint-disable no-console */
/**
 * Seeds fictional demo data. Run with `npm run seed`. WIPES all CRM collections first.
 * Refuses to run with NODE_ENV=production unless SEED_FORCE=true.
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Connection, Model, Types } from 'mongoose';
import { AppModule } from './app.module';
import type {
  ExpenseCategory,
  LeadStage,
  PaymentMode,
  ProjectStage,
} from './common/constants/enums';
import { LEAD_STAGES, PROJECT_STAGES } from './common/constants/enums';
import { Customer } from './customers/schemas/customer.schema';
import { Expense } from './expenses/schemas/expense.schema';
import { Lead } from './leads/schemas/lead.schema';
import { Payment } from './payments/schemas/payment.schema';
import { Project } from './projects/schemas/project.schema';
import { Staff } from './staff/schemas/staff.schema';
import { User } from './users/schemas/user.schema';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);
/** UTC midnight, n days from today (negative = past). */
const dateOnly = (offsetDays: number) => {
  const d = new Date(now.getTime() + offsetDays * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

type History<T extends string> = { from: T | null; to: T; by: Types.ObjectId; at: Date }[];

/** Builds a history walking `path`, spreading entries evenly between `startDaysAgo` and `endDaysAgo`. */
function history<T extends string>(
  path: T[],
  by: Types.ObjectId,
  startDaysAgo: number,
  endDaysAgo: number,
): History<T> {
  const step = path.length > 1 ? (startDaysAgo - endDaysAgo) / (path.length - 1) : 0;
  return path.map((to, i) => ({
    from: i === 0 ? null : path[i - 1],
    to,
    by,
    at: daysAgo(startDaysAgo - step * i),
  }));
}

const leadPath = (stage: LeadStage): LeadStage[] => {
  if (stage === 'CANCELLED') return ['LEAD', 'QUALIFIED', 'PROPOSAL', 'CANCELLED'];
  return LEAD_STAGES.slice(0, LEAD_STAGES.indexOf(stage) + 1) as LeadStage[];
};

const projectPath = (stage: ProjectStage): ProjectStage[] =>
  PROJECT_STAGES.slice(0, PROJECT_STAGES.indexOf(stage) + 1) as ProjectStage[];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_FORCE !== 'true') {
    throw new Error('Refusing to seed in production (set SEED_FORCE=true to override).');
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const logger = new Logger('Seed');
  try {
    const connection = app.get<Connection>(getConnectionToken());
    const model = <T>(name: string) => app.get<Model<T>>(getModelToken(name));
    const Users = model<User>(User.name);
    const Customers = model<Customer>(Customer.name);
    const StaffM = model<Staff>(Staff.name);
    const Leads = model<Lead>(Lead.name);
    const Projects = model<Project>(Project.name);
    const Payments = model<Payment>(Payment.name);
    const Expenses = model<Expense>(Expense.name);
    const all = [
      Users,
      Customers,
      StaffM,
      Leads,
      Projects,
      Payments,
      Expenses,
    ] as unknown as Model<unknown>[];

    logger.log(`Seeding database "${connection.name}"…`);
    await Promise.all(all.map((m) => m.deleteMany({})));
    await Promise.all(all.map((m) => m.syncIndexes()));

    // ---- Users -------------------------------------------------------------------------
    const [adminHash, clientHash] = await Promise.all([
      bcrypt.hash('admin123', 10),
      bcrypt.hash('client123', 10),
    ]);
    const admin = await Users.create({
      name: 'MACROPAGE Admin',
      email: 'admin@macropage.in',
      passwordHash: adminHash,
      role: 'ADMIN',
      isActive: true,
    });
    const by = admin._id;

    // ---- Staff -------------------------------------------------------------------------
    const staff = await StaffM.insertMany([
      {
        name: 'Arjun Mehta',
        role: 'Tech Lead',
        type: 'ENGINEER',
        email: 'arjun@macropage.in',
        phone: '+91 90000 10001',
      },
      {
        name: 'Priya Nair',
        role: 'Frontend Engineer',
        type: 'ENGINEER',
        email: 'priya@macropage.in',
        phone: '+91 90000 10002',
      },
      {
        name: 'Rohan Kulkarni',
        role: 'Backend Engineer',
        type: 'ENGINEER',
        email: 'rohan@macropage.in',
        phone: '+91 90000 10003',
      },
      {
        name: 'Sneha Iyer',
        role: 'UI/UX Designer',
        type: 'ENGINEER',
        email: 'sneha@macropage.in',
        phone: '+91 90000 10004',
      },
      {
        name: 'Vikram Singh',
        role: 'DevOps Engineer',
        type: 'ENGINEER',
        email: 'vikram@macropage.in',
        phone: '+91 90000 10005',
      },
      {
        name: 'Ananya Rao',
        role: 'Business Development Manager',
        type: 'STAFF',
        email: 'ananya@macropage.in',
        phone: '+91 90000 10006',
      },
      {
        name: 'Karan Shah',
        role: 'Project Coordinator',
        type: 'STAFF',
        email: 'karan@macropage.in',
        phone: '+91 90000 10007',
      },
    ]);
    const [arjun, priya, rohan, sneha, vikram, ananya, karan] = staff;

    // ---- Customers + customer logins ---------------------------------------------------
    const [demoRetail, seaside, greenleaf, urbanfit] = await Customers.insertMany([
      {
        name: 'Demo Retail Pvt. Ltd.',
        contactName: 'Rahul Verma',
        email: 'client@demo.com',
        phone: '+91 98000 20001',
        address: '12 Market Road, Pune',
      },
      {
        name: 'Seaside Hotels & Resorts',
        contactName: 'Meera Pillai',
        email: 'hotel@demo.com',
        phone: '+91 98000 20002',
        address: 'Beach Road, Kochi',
      },
      {
        name: 'GreenLeaf Organics',
        contactName: 'Aditya Joshi',
        email: 'ops@greenleaf.example',
        phone: '+91 98000 20003',
        address: 'Plot 7, Nashik',
      },
      {
        name: 'UrbanFit Gyms',
        contactName: 'Neha Kapoor',
        email: 'it@urbanfit.example',
        phone: '+91 98000 20004',
        address: 'Sector 21, Gurugram',
      },
    ]);
    await Users.insertMany([
      {
        name: 'Rahul Verma',
        email: 'client@demo.com',
        passwordHash: clientHash,
        role: 'CUSTOMER',
        customerId: demoRetail._id,
        isActive: true,
      },
      {
        name: 'Meera Pillai',
        email: 'hotel@demo.com',
        passwordHash: clientHash,
        role: 'CUSTOMER',
        customerId: seaside._id,
        isActive: true,
      },
    ]);

    // ---- Open-pipeline leads (11) --------------------------------------------------------
    const openLeads: {
      title: string;
      company: string;
      contactName: string;
      source: string;
      value: number;
      stage: LeadStage;
      owner: Types.ObjectId;
      age: number;
      expectedClose: number | null;
    }[] = [
      {
        title: 'Clinic appointment app',
        company: 'CareWell Clinics',
        contactName: 'Dr. Sana Qureshi',
        source: 'Website',
        value: 180000,
        stage: 'LEAD',
        owner: ananya._id,
        age: 3,
        expectedClose: 60,
      },
      {
        title: 'School ERP modernisation',
        company: 'Bright Future School',
        contactName: 'Mr. Thomas George',
        source: 'Referral',
        value: 420000,
        stage: 'IDENTIFIED',
        owner: ananya._id,
        age: 9,
        expectedClose: 75,
      },
      {
        title: 'Logistics tracking dashboard',
        company: 'SwiftMove Logistics',
        contactName: 'Imran Sheikh',
        source: 'LinkedIn',
        value: 560000,
        stage: 'GENERATED',
        owner: karan._id,
        age: 14,
        expectedClose: 50,
      },
      {
        title: 'Restaurant POS integration',
        company: 'Spice Route Foods',
        contactName: 'Kavya Reddy',
        source: 'Cold Call',
        value: 150000,
        stage: 'QUALIFIED',
        owner: ananya._id,
        age: 20,
        expectedClose: 30,
      },
      {
        title: 'Real-estate listings portal',
        company: 'Skyline Realty',
        contactName: 'Manish Agarwal',
        source: 'Website',
        value: 380000,
        stage: 'QUALIFIED',
        owner: karan._id,
        age: 18,
        expectedClose: 45,
      },
      {
        title: 'Field-sales CRM mobile app',
        company: 'AgroLink Traders',
        contactName: 'Suresh Patil',
        source: 'Trade Show',
        value: 290000,
        stage: 'DEMO',
        owner: ananya._id,
        age: 26,
        expectedClose: 25,
      },
      {
        title: 'Patient records migration',
        company: 'LifeLine Diagnostics',
        contactName: 'Dr. Ritu Malhotra',
        source: 'Referral',
        value: 640000,
        stage: 'PROPOSAL',
        owner: karan._id,
        age: 33,
        expectedClose: 20,
      },
      {
        title: 'Event ticketing platform',
        company: 'StageDoor Events',
        contactName: 'Farhan Ali',
        source: 'LinkedIn',
        value: 470000,
        stage: 'NEGOTIATION',
        owner: ananya._id,
        age: 40,
        expectedClose: 14,
      },
      {
        title: 'Warehouse IoT monitoring',
        company: 'ColdChain Storage',
        contactName: 'Deepak Menon',
        source: 'Website',
        value: 720000,
        stage: 'VERBAL',
        owner: karan._id,
        age: 45,
        expectedClose: 7,
      },
      {
        title: 'Corporate intranet revamp',
        company: 'Nimbus Consulting',
        contactName: 'Pooja Bhatt',
        source: 'Referral',
        value: 260000,
        stage: 'PENDING',
        owner: ananya._id,
        age: 50,
        expectedClose: 10,
      },
      {
        title: 'Travel booking chatbot',
        company: 'WanderLust Travels',
        contactName: 'Nikhil Das',
        source: 'Cold Call',
        value: 210000,
        stage: 'CANCELLED',
        owner: karan._id,
        age: 70,
        expectedClose: null,
      },
    ];
    await Leads.insertMany(
      openLeads.map((l, i) => {
        const path = leadPath(l.stage);
        const hist = history(path, by, l.age, Math.max(l.age - path.length * 2, 1));
        return {
          title: l.title,
          company: l.company,
          contactName: l.contactName,
          phone: `+91 97000 300${String(i + 10)}`,
          email: `${l.contactName.split(' ').slice(-1)[0].toLowerCase()}@${l.company.split(' ')[0].toLowerCase()}.example`,
          source: l.source,
          value: l.value,
          stage: l.stage,
          ownerId: l.owner,
          expectedClose: l.expectedClose === null ? null : dateOnly(l.expectedClose),
          notes:
            l.stage === 'CANCELLED'
              ? 'Client postponed indefinitely; budget moved to marketing.'
              : '',
          stageHistory: hist,
          stageUpdatedAt: hist[hist.length - 1].at,
          createdAt: daysAgo(l.age),
        };
      }),
    );

    // ---- Won leads → projects (5) -------------------------------------------------------
    const deals: {
      title: string;
      customer: typeof demoRetail;
      source: string;
      contract: number;
      owner: Types.ObjectId;
      wonDaysAgo: number;
      stage: ProjectStage;
      dev: { requirement: number; ui: number; frontend: number; backend: number };
      team: Types.ObjectId[];
      start: number;
      end: number;
      description: string;
      requirements: string;
      payments: { amount: number; daysAgo: number; mode: PaymentMode; note: string }[];
      expenses: {
        staff: Types.ObjectId;
        daysAgo: number;
        lines: [ExpenseCategory, number, string?][];
      }[];
      clientNote?: string;
    }[] = [
      {
        title: 'E-commerce Platform',
        customer: demoRetail,
        source: 'Referral',
        contract: 850000,
        owner: ananya._id,
        wonDaysAgo: 120,
        stage: 'IN_PROGRESS',
        dev: { requirement: 100, ui: 80, frontend: 55, backend: 60 },
        team: [arjun._id, priya._id, rohan._id, sneha._id, karan._id],
        start: -110,
        end: 40,
        description: 'Multi-vendor storefront with inventory sync and payment gateway.',
        requirements:
          '- Product catalogue with variants\n- Cart & checkout (UPI, cards)\n- Vendor dashboard\n- Order tracking & invoices',
        payments: [
          { amount: 255000, daysAgo: 115, mode: 'BANK_TRANSFER', note: 'Advance (30%)' },
          { amount: 170000, daysAgo: 60, mode: 'BANK_TRANSFER', note: 'Milestone 1: UI sign-off' },
          { amount: 85000, daysAgo: 12, mode: 'UPI', note: 'Milestone 2 (partial)' },
        ],
        expenses: [
          {
            staff: priya._id,
            daysAgo: 100,
            lines: [
              ['SALARY', 65000],
              ['SOFTWARE_TOOLS', 4500, 'Figma + IDE licences'],
            ],
          },
          {
            staff: rohan._id,
            daysAgo: 70,
            lines: [
              ['SALARY', 70000],
              ['CLOUD_HOSTING', 12000, 'Staging environment'],
            ],
          },
          {
            staff: sneha._id,
            daysAgo: 45,
            lines: [
              ['FREELANCER', 30000, 'Illustration pack'],
              ['SOFTWARE_TOOLS', 3200],
            ],
          },
          {
            staff: arjun._id,
            daysAgo: 15,
            lines: [
              ['SALARY', 80000],
              ['DOMAIN_SSL', 6500],
              ['TRAVEL', 8200, 'Client workshop, Pune'],
            ],
          },
        ],
      },
      {
        title: 'Hotel Booking Engine',
        customer: seaside,
        source: 'Website',
        contract: 620000,
        owner: karan._id,
        wonDaysAgo: 160,
        stage: 'CLIENT_CONFIRMATION',
        dev: { requirement: 100, ui: 100, frontend: 100, backend: 100 },
        team: [arjun._id, priya._id, vikram._id, karan._id],
        start: -150,
        end: 5,
        description:
          'Direct-booking engine with room inventory, rate plans and channel-manager sync.',
        requirements:
          '- Room & rate management\n- Availability calendar\n- Payment gateway\n- Booking emails & SMS',
        clientNote: 'Please make the date picker start on Monday.',
        payments: [
          { amount: 186000, daysAgo: 150, mode: 'BANK_TRANSFER', note: 'Advance (30%)' },
          { amount: 186000, daysAgo: 90, mode: 'CHEQUE', note: 'Milestone 1' },
          { amount: 124000, daysAgo: 25, mode: 'BANK_TRANSFER', note: 'Milestone 2' },
        ],
        expenses: [
          { staff: priya._id, daysAgo: 140, lines: [['SALARY', 60000]] },
          {
            staff: vikram._id,
            daysAgo: 80,
            lines: [
              ['CLOUD_HOSTING', 18000, 'Production cluster'],
              ['DOMAIN_SSL', 4800],
            ],
          },
          {
            staff: arjun._id,
            daysAgo: 35,
            lines: [
              ['SALARY', 75000],
              ['TRAVEL', 14500, 'On-site UAT, Kochi'],
            ],
          },
          {
            staff: karan._id,
            daysAgo: 10,
            lines: [
              ['MARKETING', 9000, 'Launch creatives'],
              ['OFFICE_MISC', 2100],
            ],
          },
        ],
      },
      {
        title: 'Inventory Mobile App',
        customer: greenleaf,
        source: 'Trade Show',
        contract: 480000,
        owner: ananya._id,
        wonDaysAgo: 210,
        stage: 'CLOSED',
        dev: { requirement: 100, ui: 100, frontend: 100, backend: 100 },
        team: [rohan._id, sneha._id, vikram._id],
        start: -200,
        end: -30,
        description: 'Android/iOS app for farm-to-warehouse stock tracking with barcode scanning.',
        requirements: '- Barcode scanning\n- Offline sync\n- Stock reports\n- Role-based access',
        payments: [
          { amount: 144000, daysAgo: 175, mode: 'BANK_TRANSFER', note: 'Advance (30%)' },
          { amount: 192000, daysAgo: 100, mode: 'BANK_TRANSFER', note: 'Beta delivery' },
          { amount: 144000, daysAgo: 28, mode: 'UPI', note: 'Final payment' },
        ],
        expenses: [
          {
            staff: rohan._id,
            daysAgo: 170,
            lines: [
              ['SALARY', 70000],
              ['SOFTWARE_TOOLS', 8000, 'Apple developer + Play console'],
            ],
          },
          { staff: sneha._id, daysAgo: 130, lines: [['SALARY', 55000]] },
          {
            staff: vikram._id,
            daysAgo: 60,
            lines: [
              ['CLOUD_HOSTING', 15000],
              ['DOMAIN_SSL', 3500],
            ],
          },
        ],
      },
      {
        title: 'Membership Management System',
        customer: urbanfit,
        source: 'LinkedIn',
        contract: 390000,
        owner: karan._id,
        wonDaysAgo: 95,
        stage: 'TESTING',
        dev: { requirement: 100, ui: 100, frontend: 100, backend: 95 },
        team: [priya._id, rohan._id, karan._id],
        start: -85,
        end: 25,
        description: 'Member onboarding, plan billing and attendance tracking across 6 gyms.',
        requirements:
          '- Member onboarding & KYC\n- Recurring billing\n- QR attendance\n- Branch reports',
        payments: [
          { amount: 117000, daysAgo: 88, mode: 'BANK_TRANSFER', note: 'Advance (30%)' },
          { amount: 78000, daysAgo: 30, mode: 'CARD', note: 'Milestone 1' },
        ],
        expenses: [
          { staff: priya._id, daysAgo: 75, lines: [['SALARY', 58000]] },
          {
            staff: rohan._id,
            daysAgo: 40,
            lines: [
              ['SALARY', 62000],
              ['CLOUD_HOSTING', 7000],
            ],
          },
          {
            staff: karan._id,
            daysAgo: 5,
            lines: [
              ['TRAVEL', 6200, 'Branch visit, Gurugram'],
              ['OFFICE_MISC', 1800],
            ],
          },
        ],
      },
      {
        title: 'Loyalty Program Portal',
        customer: demoRetail,
        source: 'Referral',
        contract: 240000,
        owner: ananya._id,
        wonDaysAgo: 6,
        stage: 'INITIATE',
        dev: { requirement: 0, ui: 0, frontend: 0, backend: 0 },
        team: [arjun._id, sneha._id],
        start: 7,
        end: 97,
        description:
          'Points, tiers and rewards for Demo Retail customers, integrated with the storefront.',
        requirements: '- Points engine\n- Tier rules\n- Rewards catalogue',
        payments: [],
        expenses: [],
      },
    ];

    let paymentCount = 0;
    let expenseCount = 0;
    for (const deal of deals) {
      const leadId = new Types.ObjectId();
      const projectId = new Types.ObjectId();
      const leadHist = history(leadPath('WON'), by, deal.wonDaysAgo + 40, deal.wonDaysAgo);
      const wonAt = daysAgo(deal.wonDaysAgo);
      const pPath = projectPath(deal.stage);
      const projectHist = history(
        pPath,
        by,
        deal.wonDaysAgo,
        Math.max(deal.wonDaysAgo - pPath.length * 10, 1),
      );
      if (deal.stage === 'CLOSED') {
        // The final transition is the client's approval.
        projectHist[projectHist.length - 1].at = daysAgo(28);
      }

      await Leads.create({
        _id: leadId,
        title: deal.title,
        company: deal.customer.name,
        contactName: deal.customer.contactName,
        phone: deal.customer.phone,
        email: deal.customer.email,
        source: deal.source,
        value: deal.contract,
        stage: 'WON',
        ownerId: deal.owner,
        expectedClose: dateOnly(-deal.wonDaysAgo),
        notes: '',
        wonAt,
        customerId: deal.customer._id,
        projectId,
        stageUpdatedAt: wonAt,
        stageHistory: leadHist,
        createdAt: daysAgo(deal.wonDaysAgo + 40),
      });

      await Projects.create({
        _id: projectId,
        leadId,
        customerId: deal.customer._id,
        name: deal.title,
        description: deal.description,
        requirements: deal.requirements,
        stage: deal.stage,
        startDate: dateOnly(deal.start),
        endDate: dateOnly(deal.end),
        contractValue: deal.contract,
        dev: deal.dev,
        team: deal.team,
        clientApproved: deal.stage === 'CLOSED',
        clientNote: deal.clientNote ?? null,
        closedAt: deal.stage === 'CLOSED' ? daysAgo(28) : null,
        stageHistory: projectHist,
        createdAt: wonAt,
      });

      if (deal.payments.length) {
        await Payments.insertMany(
          deal.payments.map((p) => ({
            projectId,
            amount: p.amount,
            paidOn: dateOnly(-p.daysAgo),
            mode: p.mode,
            note: p.note,
          })),
        );
        paymentCount += deal.payments.length;
      }
      for (const batch of deal.expenses) {
        await Expenses.insertMany(
          batch.lines.map(([category, amount, note]) => ({
            projectId,
            staffId: batch.staff,
            category,
            amount,
            spentOn: dateOnly(-batch.daysAgo),
            note: note ?? null,
          })),
        );
        expenseCount += batch.lines.length;
      }
    }

    console.log(`
✔ Seed complete
  Staff: ${staff.length}   Customers: 4   Leads: ${openLeads.length + deals.length}   Projects: ${deals.length}
  Payments: ${paymentCount}   Expenses: ${expenseCount}

  Admin     admin@macropage.in / admin123   (role ADMIN)
  Customer  client@demo.com    / client123  (Demo Retail Pvt. Ltd. — 2 projects)
  Customer  hotel@demo.com     / client123  (Seaside Hotels & Resorts — awaiting approval)
`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
