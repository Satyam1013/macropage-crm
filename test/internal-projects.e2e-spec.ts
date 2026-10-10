import { Expense } from '../src/expenses/schemas/expense.schema';
import { addExpense, addPayment, makeProject } from './utils/factories';
import {
  bearer,
  clearDatabase,
  createTestApp,
  Fixtures,
  seedFixtures,
  TestContext,
} from './utils/test-app';

describe('Internal projects', () => {
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
  const createInternal = (body: Record<string, unknown> = {}) =>
    ctx
      .http()
      .post('/api/internal-projects')
      .set(admin)
      .send({ name: 'Company website', ...body });
  const batch = (body: Record<string, unknown>) =>
    ctx
      .http()
      .post('/api/expenses/batch')
      .set(admin)
      .send({
        staffId: fx.engineerId,
        spentOn: '2026-09-20',
        lines: [
          { category: 'SOFTWARE_TOOLS', amount: 3000, note: 'Figma' },
          { category: 'CLOUD_HOSTING', amount: 2000 },
        ],
        ...body,
      });

  it('CRUD with validation; the list accepts limit=500 and is empty at first', async () => {
    expect((await get('/internal-projects?limit=500')).body).toEqual({
      data: [],
      meta: { page: 1, limit: 500, total: 0 },
    });

    const created = await createInternal({
      description: 'Marketing site',
      budget: 50000,
      startDate: '2026-10-01',
      endDate: '2026-12-31',
    }).expect(201);
    expect(created.body).toEqual({
      id: expect.any(String),
      name: 'Company website',
      description: 'Marketing site',
      status: 'ACTIVE',
      budget: 50000,
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      spent: 0,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    const minimal = await createInternal({ name: 'Internal CRM', status: 'PLANNED' }).expect(201);
    expect(minimal.body).toMatchObject({
      description: null,
      budget: null,
      startDate: null,
      endDate: null,
    });

    for (const bad of [
      { name: '' },
      { name: undefined },
      { budget: -1 },
      { status: 'DONE' },
      { startDate: '2026-12-01', endDate: '2026-11-30' },
      { startDate: 'soon' },
    ]) {
      await createInternal(bad).expect(400);
    }

    const id = created.body.id;
    const patched = await ctx
      .http()
      .patch(`/api/internal-projects/${id}`)
      .set(admin)
      .send({ status: 'ON_HOLD', budget: 0, description: null })
      .expect(200);
    expect(patched.body).toMatchObject({
      status: 'ON_HOLD',
      budget: 0,
      description: null,
      name: 'Company website',
      startDate: '2026-10-01',
    });
    // Checked against the stored startDate.
    await ctx
      .http()
      .patch(`/api/internal-projects/${id}`)
      .set(admin)
      .send({ endDate: '2026-09-30' })
      .expect(400);
    await ctx
      .http()
      .patch(`/api/internal-projects/${id}`)
      .set(admin)
      .send({ name: null })
      .expect(400);

    const filtered = await get('/internal-projects?limit=500&status=PLANNED');
    expect(filtered.body.data.map((p: { name: string }) => p.name)).toEqual(['Internal CRM']);
    const searched = await get('/internal-projects?limit=500&search=WEBSITE');
    expect(searched.body.data.map((p: { id: string }) => p.id)).toEqual([id]);
    await ctx.http().get('/api/internal-projects/507f1f77bcf86cd799439011').set(admin).expect(404);
  });

  it('internal expenses show up in /expenses and every business total, but not per-client views', async () => {
    const before = {
      projects: (await get('/finance/projects')).body,
      projectDetail: (await get(`/projects/${clientProject}`)).body.finance,
      portal: (await get('/portal/projects', bearer(fx.customerAToken))).body,
      summary: (await get('/finance/summary')).body,
      dashboard: (await get('/dashboard')).body.money,
    };
    expect(before.summary).toMatchObject({ expenses: 10000, internalExpenses: 0, net: 30000 });

    const internal = (await createInternal({ budget: 20000 }).expect(201)).body;
    const created = await batch({ internalProjectId: internal.id }).expect(201);
    expect(created.body).toEqual([
      expect.objectContaining({
        projectId: null,
        internalProjectId: internal.id,
        category: 'SOFTWARE_TOOLS',
        amount: 3000,
        note: 'Figma',
      }),
      expect.objectContaining({ internalProjectId: internal.id, amount: 2000 }),
    ]);

    const list = await get(`/expenses?internalProjectId=${internal.id}`);
    expect(list.body.meta.total).toBe(2);
    expect(list.body.data[0]).toMatchObject({
      projectId: null,
      projectName: null,
      internalProjectId: internal.id,
      internalProjectName: 'Company website',
    });
    const clientRows = await get(`/expenses?projectId=${clientProject}`);
    expect(clientRows.body.data).toEqual([
      expect.objectContaining({ projectId: clientProject, internalProjectId: null }),
    ]);
    expect((await get('/expenses')).body.meta.total).toBe(3);
    expect((await get(`/internal-projects/${internal.id}`)).body.spent).toBe(5000);
    expect((await get(`/internal-projects/${internal.id}/expenses`)).body).toHaveLength(2);

    // Business totals include them.
    expect((await get('/finance/summary')).body).toEqual({
      ...before.summary,
      expenses: 15000,
      internalExpenses: 5000,
      net: 25000,
    });
    expect((await get('/dashboard')).body.money).toEqual({
      ...before.dashboard,
      expenses: 15000,
      net: 25000,
    });
    const monthly = await get('/finance/monthly?months=24');
    const sep = monthly.body.find((m: { month: string }) => m.month === '2026-09');
    expect(sep).toMatchObject({ revenue: 40000, expense: 15000 });
    const byCategory = await get('/finance/expenses/by-category');
    expect(byCategory.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'SOFTWARE_TOOLS', total: 3000 }),
        expect.objectContaining({ category: 'SALARY', total: 10000 }),
      ]),
    );
    const byUser = await get('/finance/expenses/by-user');
    expect(byUser.body).toEqual([expect.objectContaining({ userId: fx.engineerId, total: 15000 })]);

    // Per-client views are unchanged.
    expect((await get('/finance/projects')).body).toEqual(before.projects);
    expect((await get(`/projects/${clientProject}`)).body.finance).toEqual(before.projectDetail);
    expect((await get('/portal/projects', bearer(fx.customerAToken))).body).toEqual(before.portal);

    // Deleting the internal project removes its expenses and the totals drop back.
    const del = await ctx
      .http()
      .delete(`/api/internal-projects/${internal.id}`)
      .set(admin)
      .expect(200);
    expect(del.body).toEqual({ id: internal.id, deleted: true, expensesDeleted: 2 });
    await ctx.http().get(`/api/internal-projects/${internal.id}`).set(admin).expect(404);
    expect((await get(`/expenses?internalProjectId=${internal.id}`)).body.meta.total).toBe(0);
    expect((await get('/finance/summary')).body).toEqual(before.summary);
    expect((await get('/dashboard')).body.money).toEqual(before.dashboard);
    await batch({ internalProjectId: internal.id }).expect(400);
  });

  it('expense batches need exactly one existing project id', async () => {
    const internal = (await createInternal().expect(201)).body;
    await batch({ projectId: clientProject, internalProjectId: internal.id }).expect(400);
    await batch({}).expect(400);
    await batch({ internalProjectId: '507f1f77bcf86cd799439011' }).expect(400);
    await batch({ internalProjectId: 'nope' }).expect(400);
    await batch({ projectId: clientProject }).expect(201);
    expect(await ctx.model<Expense>(Expense.name).countDocuments({ deletedAt: null })).toBe(3);
  });

  it('the model enforces the scope id rules', async () => {
    const Expenses = ctx.model<Expense>(Expense.name);
    const base = { staffId: fx.engineerId, category: 'TRAVEL', amount: 1, spentOn: new Date() };
    await expect(Expenses.create(base)).rejects.toThrow(/projectId is required/);
    await expect(
      Expenses.create({
        ...base,
        projectId: clientProject,
        internalProjectId: '507f1f77bcf86cd799439011',
      }),
    ).rejects.toThrow(/internalProjectId must be empty/);
    await expect(
      Expenses.create({ ...base, scope: 'INTERNAL_PROJECT', projectId: clientProject }),
    ).rejects.toThrow(/projectId must be empty/);
    await expect(
      Expenses.create({ ...base, scope: 'COMPANY', internalProjectId: '507f1f77bcf86cd799439011' }),
    ).rejects.toThrow(/internalProjectId must be empty/);
  });

  it('is admin-only', async () => {
    const alice = bearer(fx.customerAToken);
    await ctx.http().get('/api/internal-projects').set(alice).expect(403);
    await ctx.http().post('/api/internal-projects').set(alice).send({ name: 'x' }).expect(403);
  });
});
