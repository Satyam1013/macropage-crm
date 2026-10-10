import { Types } from 'mongoose';
import { migrateExpenseScope } from '../src/migrations/expense-scope.migration';
import { addExpense, addPayment, makeProject } from './utils/factories';
import {
  bearer,
  clearDatabase,
  createTestApp,
  Fixtures,
  seedFixtures,
  TestContext,
} from './utils/test-app';

describe('Expense scopes: COMPANY & OWNER (no project)', () => {
  let ctx: TestContext;
  let fx: Fixtures;
  let admin: Record<string, string>;
  let clientProject: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  beforeEach(async () => {
    await clearDatabase(ctx);
    fx = await seedFixtures(ctx);
    admin = bearer(fx.adminToken);
    clientProject = await makeProject(ctx, {
      customerId: fx.customerA,
      ownerId: fx.staffMemberId,
      by: fx.adminId,
      name: 'Alpha Shop',
      contractValue: 100000,
      team: [fx.engineerId],
    });
    await addPayment(ctx, clientProject, 40000, '2026-09-10');
    await addExpense(ctx, clientProject, fx.engineerId, 'SALARY', 10000, '2026-09-15');
  });

  const get = (url: string, auth = admin) => ctx.http().get(`/api${url}`).set(auth).expect(200);
  const batch = (body: Record<string, unknown>) =>
    ctx
      .http()
      .post('/api/expenses/batch')
      .set(admin)
      .send({
        spentOn: '2026-09-20',
        lines: [{ category: 'OFFICE_MISC', amount: 45000, note: 'Office rent' }],
        ...body,
      });

  /** Everything a customer can read under /portal. */
  const portalSnapshot = async () => {
    const alice = bearer(fx.customerAToken);
    return {
      projects: (await get('/portal/projects', alice)).body,
      project: (await get(`/portal/projects/${clientProject}`, alice)).body,
      discussions: (await get('/portal/discussions', alice)).body,
      summary: (await get('/portal/summary', alice)).body,
    };
  };

  it('COMPANY and OWNER expenses need no project or staff and count as business expenses only', async () => {
    const before = {
      projects: (await get('/finance/projects')).body,
      finance: (await get(`/projects/${clientProject}`)).body.finance,
      portal: await portalSnapshot(),
      summary: (await get('/finance/summary')).body,
      dashboard: (await get('/dashboard')).body.money,
    };

    const company = await batch({ scope: 'COMPANY' }).expect(201);
    expect(company.body).toEqual([
      expect.objectContaining({
        scope: 'COMPANY',
        projectId: null,
        internalProjectId: null,
        staffId: null,
        userId: null,
        amount: 45000,
      }),
    ]);
    await batch({
      scope: 'OWNER',
      userId: fx.staffMemberId,
      lines: [
        { category: 'TRAVEL', amount: 12500, note: 'Client visit' },
        { category: 'MARKETING', amount: 2500 },
      ],
    }).expect(201);

    const companyRows = await get('/expenses?scope=COMPANY');
    expect(companyRows.body.data).toEqual([
      expect.objectContaining({ scope: 'COMPANY', note: 'Office rent', userName: null }),
    ]);
    const ownerRows = await get('/expenses?scope=OWNER');
    expect(ownerRows.body.meta.total).toBe(2);
    expect(ownerRows.body.data[0]).toMatchObject({
      scope: 'OWNER',
      staffId: fx.staffMemberId,
      userName: 'Sam Staff',
    });
    // Combinable with the other filters.
    expect((await get('/expenses?scope=OWNER&category=TRAVEL')).body.meta.total).toBe(1);
    expect((await get(`/expenses?scope=OWNER&staffId=${fx.engineerId}`)).body.meta.total).toBe(0);
    expect((await get('/expenses?scope=PROJECT')).body.data).toEqual([
      expect.objectContaining({ scope: 'PROJECT', projectId: clientProject }),
    ]);

    expect((await get('/finance/summary')).body).toEqual({
      ...before.summary,
      expenses: 70000,
      companyExpenses: 45000,
      ownerExpenses: 15000,
      net: -30000,
    });
    expect((await get('/dashboard')).body.money).toEqual({
      ...before.dashboard,
      expenses: 70000,
      net: -30000,
    });
    const sep = (await get('/finance/monthly?months=24')).body.find(
      (m: { month: string }) => m.month === '2026-09',
    );
    expect(sep.expense).toBe(70000);
    const byCategory = await get('/finance/expenses/by-category');
    expect(byCategory.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: 'OFFICE_MISC', total: 45000 })]),
    );
    expect((await get('/finance/expenses/by-category?scope=OWNER')).body).toEqual([
      { category: 'TRAVEL', total: 12500, count: 1 },
      { category: 'MARKETING', total: 2500, count: 1 },
    ]);

    // by-user: expenses without staff are grouped under "Unassigned" (userId null).
    const byUser = await get('/finance/expenses/by-user');
    expect(byUser.body).toEqual([
      expect.objectContaining({ userId: null, name: 'Unassigned', total: 45000 }),
      expect.objectContaining({ userId: fx.staffMemberId, total: 15000 }),
      expect.objectContaining({ userId: fx.engineerId, total: 10000 }),
    ]);
    expect((await get('/finance/expenses/by-user?scope=COMPANY')).body).toEqual([
      expect.objectContaining({ userId: null, name: 'Unassigned', total: 45000 }),
    ]);

    // Client views are identical.
    expect((await get('/finance/projects')).body).toEqual(before.projects);
    expect((await get(`/projects/${clientProject}`)).body.finance).toEqual(before.finance);
    const portal = await portalSnapshot();
    expect(portal).toEqual(before.portal);
    expect(JSON.stringify(portal)).not.toMatch(/Office rent|Client visit|COMPANY|OWNER/);
  });

  it('applies the scope rules to the batch with clear 400s', async () => {
    const internal = (
      await ctx.http().post('/api/internal-projects').set(admin).send({ name: 'Site' }).expect(201)
    ).body.id;
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ scope: 'PROJECT', staffId: fx.engineerId }, /projectId is required/],
      [{ scope: 'PROJECT', projectId: clientProject }, /staffId is required/],
      [{ scope: 'COMPANY', projectId: clientProject }, /projectId must be empty/],
      [{ scope: 'OWNER', internalProjectId: internal }, /internalProjectId must be empty/],
      [{ scope: 'INTERNAL_PROJECT', staffId: fx.engineerId }, /internalProjectId is required/],
      [
        { scope: 'INTERNAL_PROJECT', internalProjectId: internal, projectId: clientProject },
        /projectId must be empty/,
      ],
      [{}, /scope is required/],
      [{ scope: 'PERSONAL' }, /scope/],
      [{ scope: 'COMPANY', staffId: '507f1f77bcf86cd799439011' }, /unknown staff/],
    ];
    for (const [body, message] of cases) {
      const res = await batch(body).expect(400);
      expect(JSON.stringify(res.body.message)).toMatch(message);
    }
    // Backward compatible: scope inferred from the id.
    const legacy = await batch({ projectId: clientProject, staffId: fx.engineerId }).expect(201);
    expect(legacy.body[0].scope).toBe('PROJECT');
    const legacyInternal = await batch({
      internalProjectId: internal,
      staffId: fx.engineerId,
    }).expect(201);
    expect(legacyInternal.body[0]).toMatchObject({
      scope: 'INTERNAL_PROJECT',
      internalProjectId: internal,
    });
  });

  it('staff can be cleared only on COMPANY / OWNER expenses', async () => {
    const [company] = (await batch({ scope: 'COMPANY', staffId: fx.engineerId }).expect(201)).body;
    const cleared = await ctx
      .http()
      .patch(`/api/expenses/${company.id}`)
      .set(admin)
      .send({ staffId: null })
      .expect(200);
    expect(cleared.body).toMatchObject({ staffId: null, scope: 'COMPANY' });
    const project = (await get(`/expenses?projectId=${clientProject}`)).body.data[0];
    await ctx
      .http()
      .patch(`/api/expenses/${project.id}`)
      .set(admin)
      .send({ staffId: null })
      .expect(400);
    await ctx.http().delete(`/api/expenses/${company.id}`).set(admin).expect(200);
  });

  it('rows from before `scope` existed read correctly and migrate to PROJECT / INTERNAL_PROJECT', async () => {
    const raw = ctx.connection.collection('expenses');
    await raw.deleteMany({});
    const base = {
      staffId: new Types.ObjectId(fx.engineerId),
      category: 'TRAVEL',
      amount: 100,
      spentOn: new Date('2026-09-01'),
      note: null,
      deletedAt: null,
    };
    await raw.insertMany([
      { ...base, projectId: new Types.ObjectId(clientProject) },
      { ...base, internalProjectId: new Types.ObjectId() },
      { ...base, projectId: new Types.ObjectId(clientProject), deletedAt: new Date() },
    ]);

    // Before migrating: inferred on read and in filters.
    expect((await get('/expenses?scope=PROJECT')).body.data).toEqual([
      expect.objectContaining({ scope: 'PROJECT', staffId: fx.engineerId }),
    ]);
    expect((await get('/expenses?scope=INTERNAL_PROJECT')).body.data).toEqual([
      expect.objectContaining({ scope: 'INTERNAL_PROJECT', projectId: null }),
    ]);
    expect((await get('/finance/summary')).body).toMatchObject({
      expenses: 200,
      internalExpenses: 100,
    });

    expect(await migrateExpenseScope(ctx.connection, { apply: false })).toEqual({
      project: 2,
      internalProject: 1,
    });
    await migrateExpenseScope(ctx.connection, { apply: true });
    const rows = await raw.find().sort({ _id: 1 }).toArray();
    expect(rows.map((r) => r.scope)).toEqual(['PROJECT', 'INTERNAL_PROJECT', 'PROJECT']);
    expect((await raw.indexes()).map((i) => i.key)).toEqual(
      expect.arrayContaining([{ scope: 1, spentOn: -1 }]),
    );
    // Idempotent; existing expenses keep working.
    expect(await migrateExpenseScope(ctx.connection, { apply: true })).toEqual({
      project: 0,
      internalProject: 0,
    });
    expect((await get('/finance/projects')).body[0]).toMatchObject({ spent: 100 });
  });
});
