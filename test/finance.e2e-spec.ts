import { FinanceService } from '../src/finance/finance.service';
import { addExpense, addPayment, makeProject } from './utils/factories';
import {
  bearer,
  clearDatabase,
  createTestApp,
  Fixtures,
  seedFixtures,
  TestContext,
} from './utils/test-app';

describe('Finance aggregations', () => {
  let ctx: TestContext;
  let fx: Fixtures;
  let admin: Record<string, string>;
  let p1: string;
  let p2: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await clearDatabase(ctx);
    fx = await seedFixtures(ctx);
    admin = bearer(fx.adminToken);

    p1 = await makeProject(ctx, {
      customerId: fx.customerA,
      ownerId: fx.staffMemberId,
      by: fx.adminId,
      name: 'Alpha Shop',
      contractValue: 100000,
    });
    p2 = await makeProject(ctx, {
      customerId: fx.customerB,
      ownerId: fx.staffMemberId,
      by: fx.adminId,
      name: 'Beta App',
      contractValue: 50000,
    });

    // p1: received 70,000 (+ a deleted 999,999), spent 30,000 (+ a deleted 5,000)
    await addPayment(ctx, p1, 40000, '2026-08-10');
    await addPayment(ctx, p1, 30000, '2026-09-05');
    await addPayment(ctx, p1, 999999, '2026-09-06', true);
    await addExpense(ctx, p1, fx.engineerId, 'SALARY', 20000, '2026-08-15');
    await addExpense(ctx, p1, fx.engineerId, 'CLOUD_HOSTING', 4000.25, '2026-09-01');
    await addExpense(ctx, p1, fx.staffMemberId, 'TRAVEL', 5999.75, '2026-09-20');
    await addExpense(ctx, p1, fx.staffMemberId, 'TRAVEL', 5000, '2026-09-21', true);

    // p2: overpaid 60,000 on a 50,000 contract, spent 55,000 (loss)
    await addPayment(ctx, p2, 60000, '2026-10-01');
    await addExpense(ctx, p2, fx.engineerId, 'SALARY', 55000, '2026-10-02');
  });
  afterAll(() => ctx.close());

  it('GET /finance/projects computes contract/received/pending/spent/net/projected/margin', async () => {
    const res = await ctx.http().get('/api/finance/projects').set(admin).expect(200);
    const byName = Object.fromEntries(res.body.map((r: { name: string }) => [r.name, r]));
    expect(byName['Alpha Shop']).toMatchObject({
      projectId: p1,
      clientName: 'Alpha Corp',
      contract: 100000,
      received: 70000,
      pending: 30000,
      spent: 30000,
      net: 40000,
      projected: 70000,
      margin: 70,
    });
    expect(byName['Beta App']).toMatchObject({
      contract: 50000,
      received: 60000,
      pending: 0,
      spent: 55000,
      net: 5000,
      projected: -5000,
      margin: -10,
    });
  });

  it('GET /finance/summary totals across projects (pending summed per project)', async () => {
    const res = await ctx.http().get('/api/finance/summary').set(admin).expect(200);
    expect(res.body).toEqual({
      contractValue: 150000,
      received: 130000,
      pending: 30000,
      expenses: 85000,
      net: 45000,
      projected: 65000,
    });
  });

  it('project detail embeds the same finance block', async () => {
    const res = await ctx.http().get(`/api/projects/${p1}`).set(admin).expect(200);
    expect(res.body.finance).toEqual({
      contract: 100000,
      received: 70000,
      pending: 30000,
      spent: 30000,
      net: 40000,
      projected: 70000,
      margin: 70,
    });
    // IN_PROGRESS with dev 100/50/20/30 → round(12 + 50 × 0.53) = 39
    expect(res.body.progress).toBe(39);
  });

  it('monthly groups payments and expenses per YYYY-MM, oldest first, zero-filled', async () => {
    const service = ctx.moduleRef.get(FinanceService);
    const rows = await service.monthly(4, new Date('2026-10-15T12:00:00Z'));
    expect(rows).toEqual([
      { month: '2026-07', revenue: 0, expense: 0 },
      { month: '2026-08', revenue: 40000, expense: 20000 },
      { month: '2026-09', revenue: 30000, expense: 10000 },
      { month: '2026-10', revenue: 60000, expense: 55000 },
    ]);
  });

  it('GET /finance/monthly validates the months parameter', async () => {
    const res = await ctx.http().get('/api/finance/monthly?months=3').set(admin).expect(200);
    expect(res.body).toHaveLength(3);
    await ctx.http().get('/api/finance/monthly?months=0').set(admin).expect(400);
  });

  it('expenses by category (soft-deleted lines excluded)', async () => {
    const res = await ctx.http().get('/api/finance/expenses/by-category').set(admin).expect(200);
    expect(res.body).toEqual([
      { category: 'SALARY', total: 75000, count: 2 },
      { category: 'TRAVEL', total: 5999.75, count: 1 },
      { category: 'CLOUD_HOSTING', total: 4000.25, count: 1 },
    ]);
  });

  it('expenses by user with per-category split, filterable by project and date', async () => {
    const all = await ctx.http().get('/api/finance/expenses/by-user').set(admin).expect(200);
    expect(all.body).toEqual([
      {
        userId: fx.engineerId,
        name: 'Eve Engineer',
        role: 'Backend Engineer',
        type: 'ENGINEER',
        total: 79000.25,
        categories: [
          { category: 'SALARY', amount: 75000 },
          { category: 'CLOUD_HOSTING', amount: 4000.25 },
        ],
      },
      {
        userId: fx.staffMemberId,
        name: 'Sam Staff',
        role: 'Coordinator',
        type: 'STAFF',
        total: 5999.75,
        categories: [{ category: 'TRAVEL', amount: 5999.75 }],
      },
    ]);

    const filtered = await ctx
      .http()
      .get(`/api/finance/expenses/by-user?projectId=${p1}&from=2026-09-01&to=2026-09-30`)
      .set(admin)
      .expect(200);
    expect(
      filtered.body.map((u: { userId: string; total: number }) => [u.userId, u.total]),
    ).toEqual([
      [fx.staffMemberId, 5999.75],
      [fx.engineerId, 4000.25],
    ]);

    await ctx
      .http()
      .get('/api/finance/expenses/by-user?from=2026-10-01&to=2026-09-01')
      .set(admin)
      .expect(400);
  });

  it('expense batches create one document per category line, atomically', async () => {
    const res = await ctx
      .http()
      .post('/api/expenses/batch')
      .set(admin)
      .send({
        projectId: p2,
        userId: fx.staffMemberId, // frontend alias for staffId
        date: '2026-10-03', // frontend alias for spentOn
        lines: [
          { category: 'SOFTWARE_TOOLS', amount: 100 },
          { category: 'DOMAIN_SSL', amount: 50.5, note: 'ssl' },
        ],
      })
      .expect(201);
    expect(res.body).toEqual([
      expect.objectContaining({
        projectId: p2,
        userId: fx.staffMemberId,
        category: 'SOFTWARE_TOOLS',
        amount: 100,
        date: '2026-10-03',
      }),
      expect.objectContaining({ category: 'DOMAIN_SSL', amount: 50.5, note: 'ssl' }),
    ]);

    // An invalid line rejects the whole batch.
    await ctx
      .http()
      .post('/api/expenses/batch')
      .set(admin)
      .send({
        projectId: p2,
        staffId: fx.staffMemberId,
        spentOn: '2026-10-03',
        lines: [
          { category: 'SALARY', amount: 1 },
          { category: 'BOGUS', amount: 1 },
        ],
      })
      .expect(400);

    const list = await ctx
      .http()
      .get(`/api/expenses?projectId=${p2}&limit=50`)
      .set(admin)
      .expect(200);
    expect(list.body.meta).toEqual({ page: 1, limit: 50, total: 3 });

    // Clean up so other assertions in this file are order-independent.
    for (const e of res.body)
      await ctx.http().delete(`/api/expenses/${e.id}`).set(admin).expect(200);
  });

  it('soft-deleting a payment removes it from finance totals', async () => {
    const created = await ctx
      .http()
      .post('/api/payments')
      .set(admin)
      .send({ projectId: p1, amount: 10000, date: '2026-10-05', mode: 'UPI' })
      .expect(201);
    expect((await ctx.http().get('/api/finance/summary').set(admin)).body.received).toBe(140000);
    await ctx.http().delete(`/api/payments/${created.body.id}`).set(admin).expect(200);
    expect((await ctx.http().get('/api/finance/summary').set(admin)).body.received).toBe(130000);
    await ctx.http().delete(`/api/payments/${created.body.id}`).set(admin).expect(404);
  });
});
