import { addExpense, addPayment, makeProject } from './utils/factories';
import {
  bearer,
  clearDatabase,
  createTestApp,
  Fixtures,
  seedFixtures,
  TestContext,
} from './utils/test-app';

const FORBIDDEN_KEYS = [
  'expenses',
  'spent',
  'net',
  'projected',
  'margin',
  'finance',
  'leadId',
  'teamIds',
  'stageHistory',
];

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => collectKeys(v, keys));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      keys.add(k);
      collectKeys(v, keys);
    }
  }
  return keys;
}

describe('Client portal: data isolation & client confirmation', () => {
  let ctx: TestContext;
  let fx: Fixtures;
  let admin: Record<string, string>;
  let alice: Record<string, string>;
  let bob: Record<string, string>;
  let aliceProject: string;
  let aliceAwaiting: string;
  let bobProject: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  beforeEach(async () => {
    await clearDatabase(ctx);
    fx = await seedFixtures(ctx);
    admin = bearer(fx.adminToken);
    alice = bearer(fx.customerAToken);
    bob = bearer(fx.customerBToken);
    const base = {
      ownerId: fx.staffMemberId,
      by: fx.adminId,
      team: [fx.engineerId, fx.staffMemberId],
    };
    aliceProject = await makeProject(ctx, {
      ...base,
      customerId: fx.customerA,
      name: 'Alpha Shop',
      stage: 'IN_PROGRESS',
      contractValue: 100000,
      plan: 'PREMIUM',
    });
    aliceAwaiting = await makeProject(ctx, {
      ...base,
      customerId: fx.customerA,
      name: 'Alpha App',
      stage: 'CLIENT_CONFIRMATION',
      contractValue: 80000,
    });
    bobProject = await makeProject(ctx, {
      ...base,
      customerId: fx.customerB,
      name: 'Beta Site',
      stage: 'CLIENT_CONFIRMATION',
    });
    await addPayment(ctx, aliceProject, 25000, '2026-09-01');
    await addPayment(ctx, aliceProject, 5000, '2026-09-02', true);
    await addExpense(ctx, aliceProject, fx.engineerId, 'SALARY', 40000, '2026-09-03');
  });

  it("lists only the caller's own projects, without internal finance fields", async () => {
    const res = await ctx.http().get('/api/portal/projects').set(alice).expect(200);
    expect(res.body.map((p: { name: string }) => p.name).sort()).toEqual([
      'Alpha App',
      'Alpha Shop',
    ]);
    const shop = res.body.find((p: { id: string }) => p.id === aliceProject);
    expect(shop).toMatchObject({
      contractValue: 100000,
      paid: 25000,
      balance: 75000,
      progress: 39,
      clientName: 'Alpha Corp',
      plan: 'PREMIUM',
    });
    // Projects converted before plans existed report null.
    expect(res.body.find((p: { id: string }) => p.id === aliceAwaiting).plan).toBeNull();
    const keys = collectKeys(res.body);
    for (const k of FORBIDDEN_KEYS) expect(keys).not.toContain(k);

    const bobRes = await ctx.http().get('/api/portal/projects').set(bob).expect(200);
    expect(bobRes.body.map((p: { id: string }) => p.id)).toEqual([bobProject]);
  });

  it('project detail: payments summary, timeline and team names/titles only', async () => {
    const res = await ctx.http().get(`/api/portal/projects/${aliceProject}`).set(alice).expect(200);
    expect(res.body.payments).toEqual({
      contract: 100000,
      paid: 25000,
      balance: 75000,
      list: [expect.objectContaining({ amount: 25000, date: '2026-09-01', mode: 'BANK_TRANSFER' })],
    });
    expect(res.body.team).toEqual([
      { name: 'Eve Engineer', role: 'Backend Engineer' },
      { name: 'Sam Staff', role: 'Coordinator' },
    ]);
    expect(res.body.timeline).toEqual([{ from: null, to: 'IN_PROGRESS', at: expect.any(String) }]);
    expect(res.body.requirements).toBe('reqs');
    expect(res.body.plan).toBe('PREMIUM');
    const keys = collectKeys(res.body);
    for (const k of [...FORBIDDEN_KEYS, 'by', 'email', 'phone', 'type'])
      expect(keys).not.toContain(k);
  });

  it("returns 404 (not 403) for another customer's project on every portal route", async () => {
    await ctx.http().get(`/api/portal/projects/${bobProject}`).set(alice).expect(404);
    await ctx.http().post(`/api/portal/projects/${bobProject}/approve`).set(alice).expect(404);
    await ctx
      .http()
      .post(`/api/portal/projects/${bobProject}/request-changes`)
      .set(alice)
      .send({ note: 'x' })
      .expect(404);
    await ctx.http().get('/api/portal/projects/507f1f77bcf86cd799439011').set(alice).expect(404);
    // Bob's project is untouched.
    const bobView = await ctx.http().get(`/api/portal/projects/${bobProject}`).set(bob).expect(200);
    expect(bobView.body.stage).toBe('CLIENT_CONFIRMATION');
  });

  it('customers cannot reach admin endpoints; admins cannot reach the portal', async () => {
    for (const path of [
      '/api/leads',
      '/api/projects',
      `/api/projects/${aliceProject}`,
      '/api/finance/summary',
      '/api/dashboard',
      '/api/customers',
      '/api/staff',
      '/api/expenses',
      '/api/users',
    ]) {
      await ctx.http().get(path).set(alice).expect(403);
    }
    await ctx.http().get('/api/portal/projects').set(admin).expect(403);
    await ctx.http().get('/api/portal/projects').expect(401);
  });

  it('approve: CLIENT_CONFIRMATION → CLOSED, then 409 on repeat', async () => {
    const res = await ctx
      .http()
      .post(`/api/portal/projects/${aliceAwaiting}/approve`)
      .set(alice)
      .expect(200);
    expect(res.body).toMatchObject({
      stage: 'CLOSED',
      clientApproved: true,
      progress: 100,
      awaitingApproval: false,
    });
    expect(res.body.closedAt).toEqual(expect.any(String));
    expect(res.body.timeline.at(-1)).toMatchObject({ from: 'CLIENT_CONFIRMATION', to: 'CLOSED' });
    await ctx.http().post(`/api/portal/projects/${aliceAwaiting}/approve`).set(alice).expect(409);
  });

  it('approve / request-changes return 409 when the project is not awaiting confirmation', async () => {
    await ctx.http().post(`/api/portal/projects/${aliceProject}/approve`).set(alice).expect(409);
    await ctx
      .http()
      .post(`/api/portal/projects/${aliceProject}/request-changes`)
      .set(alice)
      .send({ note: 'x' })
      .expect(409);
  });

  it('request-changes: back to CONFIRMATION_TESTING with the note; note is required', async () => {
    await ctx
      .http()
      .post(`/api/portal/projects/${aliceAwaiting}/request-changes`)
      .set(alice)
      .send({})
      .expect(400);
    const res = await ctx
      .http()
      .post(`/api/portal/projects/${aliceAwaiting}/request-changes`)
      .set(alice)
      .send({ note: 'Logo is too small' })
      .expect(200);
    expect(res.body).toMatchObject({
      stage: 'CONFIRMATION_TESTING',
      clientApproved: false,
      clientNote: 'Logo is too small',
    });
  });

  describe('admin project lifecycle', () => {
    it('cannot close without client approval; can after recording it', async () => {
      await ctx
        .http()
        .patch(`/api/projects/${aliceAwaiting}/stage`)
        .set(admin)
        .send({ stage: 'CLOSED' })
        .expect(409);
      const approved = await ctx
        .http()
        .post(`/api/projects/${aliceAwaiting}/record-client-approval`)
        .set(admin)
        .expect(200);
      expect(approved.body).toMatchObject({ stage: 'CLOSED', clientApproved: true, progress: 100 });

      // Re-open and close again: approval is kept, closedAt is reset/set.
      const reopened = await ctx
        .http()
        .patch(`/api/projects/${aliceAwaiting}/stage`)
        .set(admin)
        .send({ stage: 'DEPLOYMENT' })
        .expect(200);
      expect(reopened.body.closedAt).toBeNull();
      await ctx
        .http()
        .patch(`/api/projects/${aliceAwaiting}/stage`)
        .set(admin)
        .send({ stage: 'CLOSED' })
        .expect(200);
    });

    it('re-entering CLIENT_CONFIRMATION requires a fresh approval', async () => {
      await ctx
        .http()
        .post(`/api/projects/${aliceAwaiting}/record-client-approval`)
        .set(admin)
        .expect(200);
      await ctx
        .http()
        .patch(`/api/projects/${aliceAwaiting}/stage`)
        .set(admin)
        .send({ stage: 'CLIENT_CONFIRMATION' })
        .expect(200);
      await ctx
        .http()
        .patch(`/api/projects/${aliceAwaiting}/stage`)
        .set(admin)
        .send({ stage: 'CLOSED' })
        .expect(409);
    });

    it('record-client-approval is 409 outside CLIENT_CONFIRMATION', async () => {
      await ctx
        .http()
        .post(`/api/projects/${aliceProject}/record-client-approval`)
        .set(admin)
        .expect(409);
    });

    it('moves to any non-CLOSED stage, with history', async () => {
      for (const stage of ['TESTING', 'STARTED', 'SERVER_SETUP']) {
        await ctx
          .http()
          .patch(`/api/projects/${aliceProject}/stage`)
          .set(admin)
          .send({ stage })
          .expect(200);
      }
      const res = await ctx.http().get(`/api/projects/${aliceProject}`).set(admin).expect(200);
      expect(res.body.stage).toBe('SERVER_SETUP');
      expect(res.body.progress).toBe(79);
      expect(res.body.stageHistory.map((h: { to: string }) => h.to)).toEqual([
        'IN_PROGRESS',
        'TESTING',
        'STARTED',
        'SERVER_SETUP',
      ]);
    });

    it('clamps dev progress to 0–100', async () => {
      const res = await ctx
        .http()
        .patch(`/api/projects/${aliceProject}/progress`)
        .set(admin)
        .send({ requirement: 140, backend: -20, frontend: 70.4 })
        .expect(200);
      expect(res.body.dev).toEqual({ requirement: 100, ui: 50, frontend: 70, backend: 0 });
      expect(res.body.progress).toBe(Math.round(12 + ((100 + 50 + 70 + 0) / 4) * 0.53));
    });

    it('lists the board with status filters', async () => {
      await ctx
        .http()
        .post(`/api/projects/${aliceAwaiting}/record-client-approval`)
        .set(admin)
        .expect(200);
      const running = await ctx.http().get('/api/projects?status=running').set(admin).expect(200);
      expect(running.body.map((p: { name: string }) => p.name).sort()).toEqual([
        'Alpha Shop',
        'Beta Site',
      ]);
      const closed = await ctx.http().get('/api/projects?status=closed').set(admin).expect(200);
      expect(closed.body.map((p: { name: string }) => p.name)).toEqual(['Alpha App']);
      const search = await ctx.http().get('/api/projects?search=beta').set(admin).expect(200);
      expect(search.body).toHaveLength(1);
    });

    it('dashboard counts follow the documented definitions', async () => {
      const res = await ctx.http().get('/api/dashboard').set(admin).expect(200);
      expect(res.body.counts).toEqual({
        leads: 3,
        confirmedLeads: 3,
        projectsRunning: 3,
        projectsOngoing: 3,
        projectsClosed: 0,
        awaitingClient: 2,
      });
      expect(res.body.money).toEqual({
        revenue: 25000,
        booked: 280000,
        expenses: 40000,
        net: -15000,
      });
      expect(res.body.funnel).toHaveLength(11);
      expect(res.body.monthly).toHaveLength(6);
    });
  });
});
