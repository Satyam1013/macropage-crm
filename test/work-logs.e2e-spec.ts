import { WorkLog } from '../src/work-logs/schemas/work-log.schema';
import { makeProject } from './utils/factories';
import {
  bearer,
  clearDatabase,
  createTestApp,
  Fixtures,
  seedFixtures,
  TestContext,
} from './utils/test-app';

describe('Work logs', () => {
  let ctx: TestContext;
  let fx: Fixtures;
  let admin: Record<string, string>;
  let projectId: string;
  let leadId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  beforeEach(async () => {
    await clearDatabase(ctx);
    fx = await seedFixtures(ctx);
    admin = bearer(fx.adminToken);
    projectId = await makeProject(ctx, {
      customerId: fx.customerA,
      ownerId: fx.staffMemberId,
      by: fx.adminId,
      name: 'Alpha Shop',
      team: [fx.engineerId],
    });
    const detail = await ctx.http().get(`/api/projects/${projectId}`).set(admin).expect(200);
    leadId = detail.body.leadId;
  });

  const log = (body: Record<string, unknown>, id = projectId) =>
    ctx.http().post(`/api/projects/${id}/work-logs`).set(admin).send(body);

  it('creates one row per (scope, type) item, sharing staff, status and note', async () => {
    const res = await log({
      staffId: fx.engineerId,
      note: 'Checkout + kickoff',
      items: [
        { scope: 'PROJECT', type: 'Frontend Development' },
        { scope: 'LEAD', type: 'Client Meeting' },
      ],
    }).expect(201);
    expect(res.body).toEqual([
      expect.objectContaining({
        scope: 'PROJECT',
        projectId,
        leadId: null,
        staffId: fx.engineerId,
        type: 'Frontend Development',
        note: 'Checkout + kickoff',
        status: 'IN_PROGRESS',
        targetName: 'Alpha Shop',
      }),
      expect.objectContaining({
        scope: 'LEAD',
        projectId: null,
        leadId,
        type: 'Client Meeting',
        status: 'IN_PROGRESS',
        targetName: 'Alpha Shop', // the factory's lead title
      }),
    ]);

    // Duplicates across requests are allowed.
    await log({
      staffId: fx.engineerId,
      status: 'BLOCKED',
      items: [{ scope: 'PROJECT', type: 'Frontend Development' }],
    }).expect(201);

    const list = await ctx
      .http()
      .get(`/api/projects/${projectId}/work-logs`)
      .set(admin)
      .expect(200);
    expect(list.body).toHaveLength(3);
    expect(list.body[0]).toMatchObject({ status: 'BLOCKED', note: '' });
  });

  it('validates staff, items and types; creates nothing on failure', async () => {
    const ok = { scope: 'PROJECT', type: 'Bug Fixing' };
    const bad: Record<string, unknown>[] = [
      { staffId: fx.staffMemberId, items: [ok] }, // not on the team
      { staffId: fx.engineerId, items: [] },
      { staffId: fx.engineerId },
      { staffId: fx.engineerId, items: [{ scope: 'PROJECT', type: 'Client Meeting' }] },
      { staffId: fx.engineerId, items: [{ scope: 'LEAD', type: 'Bug Fixing' }] },
      { staffId: fx.engineerId, items: [{ scope: 'OTHER', type: 'Bug Fixing' }] },
      { staffId: fx.engineerId, items: [ok, { scope: 'LEAD', type: 'Follow-up' }, ok] },
      { staffId: fx.engineerId, status: 'PAUSED', items: [ok] },
      { staffId: 'nope', items: [ok] },
    ];
    for (const body of bad) await log(body).expect(400);
    await log({ staffId: fx.engineerId, items: [ok] }, '507f1f77bcf86cd799439011').expect(404);
    expect(await ctx.model<WorkLog>(WorkLog.name).countDocuments()).toBe(0);
  });

  it('updates inline, deletes, and filters the global list', async () => {
    const [p, l] = (
      await log({
        staffId: fx.engineerId,
        items: [
          { scope: 'PROJECT', type: 'Testing & QA' },
          { scope: 'LEAD', type: 'Follow-up' },
        ],
      }).expect(201)
    ).body;

    const patched = await ctx
      .http()
      .patch(`/api/work-logs/${p.id}`)
      .set(admin)
      .send({ status: 'DONE', note: 'Shipped' })
      .expect(200);
    expect(patched.body).toMatchObject({ status: 'DONE', note: 'Shipped', type: 'Testing & QA' });
    // Type must stay within the row's scope.
    await ctx
      .http()
      .patch(`/api/work-logs/${l.id}`)
      .set(admin)
      .send({ type: 'Bug Fixing' })
      .expect(400);

    const get = (q: string) => ctx.http().get(`/api/work-logs${q}`).set(admin).expect(200);
    expect((await get('')).body).toHaveLength(2);
    expect((await get('?status=DONE')).body.map((w: { id: string }) => w.id)).toEqual([p.id]);
    expect((await get(`?leadId=${leadId}`)).body.map((w: { id: string }) => w.id)).toEqual([l.id]);
    expect((await get(`?projectId=${projectId}`)).body).toHaveLength(1);
    expect((await get(`?staffId=${fx.staffMemberId}`)).body).toHaveLength(0);

    await ctx.http().delete(`/api/work-logs/${l.id}`).set(admin).expect(200);
    await ctx.http().delete(`/api/work-logs/${l.id}`).set(admin).expect(404);
    expect((await get('')).body).toHaveLength(1);
  });

  it('adds non-DONE logs to each staff item as currentWork', async () => {
    const [a, b] = (
      await log({
        staffId: fx.engineerId,
        items: [
          { scope: 'PROJECT', type: 'API Integration' },
          { scope: 'LEAD', type: 'Requirement Gathering' },
        ],
      }).expect(201)
    ).body;
    await ctx
      .http()
      .patch(`/api/work-logs/${b.id}`)
      .set(admin)
      .send({ status: 'DONE' })
      .expect(200);

    const res = await ctx.http().get('/api/staff').set(admin).expect(200);
    const eng = res.body.data.find((s: { id: string }) => s.id === fx.engineerId);
    expect(eng.currentWork).toEqual([
      {
        id: a.id,
        scope: 'PROJECT',
        type: 'API Integration',
        status: 'IN_PROGRESS',
        projectId,
        leadId: null,
        targetName: 'Alpha Shop',
      },
    ]);
    const other = res.body.data.find((s: { id: string }) => s.id === fx.staffMemberId);
    expect(other.currentWork).toEqual([]);
    const one = await ctx.http().get(`/api/staff/${fx.engineerId}`).set(admin).expect(200);
    expect(one.body.currentWork).toHaveLength(1);
  });

  it("removes a staff member's logs when the staff member is deleted", async () => {
    await log({
      staffId: fx.engineerId,
      items: [{ scope: 'PROJECT', type: 'Server Setup' }],
    }).expect(201);
    await ctx.http().delete(`/api/staff/${fx.engineerId}`).set(admin).expect(200);
    const list = await ctx.http().get('/api/work-logs').set(admin).expect(200);
    expect(list.body).toEqual([]);
  });

  it('is admin-only and not exposed to customers', async () => {
    const alice = bearer(fx.customerAToken);
    await ctx.http().get('/api/work-logs').set(alice).expect(403);
    await ctx.http().get(`/api/projects/${projectId}/work-logs`).set(alice).expect(403);
    await ctx.http().get(`/api/portal/projects/${projectId}/work-logs`).set(alice).expect(404);
  });
});
