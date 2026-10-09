import { Lead } from '../src/leads/schemas/lead.schema';
import {
  bearer,
  clearDatabase,
  createTestApp,
  Fixtures,
  seedFixtures,
  TestContext,
} from './utils/test-app';

const PRIVATE_KEYS = [
  'notes',
  'source',
  'ownerId',
  'owner',
  'contactName',
  'email',
  'phone',
  'expectedClose',
  'customerId',
  'projectId',
  'by',
  'from',
  'company',
];

function keysOf(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, keys));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      keys.add(k);
      keysOf(v, keys);
    }
  }
  return keys;
}

describe('Client portal: My Discussions', () => {
  let ctx: TestContext;
  let fx: Fixtures;
  let admin: Record<string, string>;
  let alice: Record<string, string>;
  let bob: Record<string, string>;

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
  });

  /** Creates a lead via the API (with secret-looking fields) and optionally shares it. */
  const lead = async (
    title: string,
    opts: { stage?: string; customerId?: string; visible?: boolean; showValue?: boolean } = {},
  ) => {
    const res = await ctx
      .http()
      .post('/api/leads')
      .set(admin)
      .send({
        title,
        company: 'Alpha Corp',
        contactName: 'Secret Contact',
        email: 'secret@alpha.test',
        phone: '+91 99999 00000',
        source: 'SecretSource',
        notes: 'INTERNAL: client is price-sensitive',
        value: 123456,
        owner: fx.staffMemberId,
        expectedClose: '2026-12-31',
        ...(opts.customerId ? { customerId: opts.customerId } : {}),
        visibleToClient: opts.visible ?? false,
        showValueToClient: opts.showValue ?? false,
      })
      .expect(201);
    if (opts.stage) {
      await ctx
        .http()
        .patch(`/api/leads/${res.body.id}/stage`)
        .set(admin)
        .send({ stage: opts.stage })
        .expect(200);
    }
    return res.body.id as string;
  };

  it('lists only leads that are linked to the caller AND visible', async () => {
    const shared = await lead('Shared with Alice', { customerId: fx.customerA, visible: true });
    await lead('Linked but hidden', { customerId: fx.customerA, visible: false });
    await lead('Unlinked');
    const bobs = await lead('Shared with Bob', { customerId: fx.customerB, visible: true });

    const a = await ctx.http().get('/api/portal/discussions').set(alice).expect(200);
    expect(a.body.map((d: { id: string }) => d.id)).toEqual([shared]);
    const b = await ctx.http().get('/api/portal/discussions').set(bob).expect(200);
    expect(b.body.map((d: { id: string }) => d.id)).toEqual([bobs]);
  });

  it("returns 404 for another customer's, hidden, unknown or converted discussions", async () => {
    const bobs = await lead('Bob only', { customerId: fx.customerB, visible: true });
    const hidden = await lead('Hidden', { customerId: fx.customerA, visible: false });
    for (const id of [bobs, hidden, '507f1f77bcf86cd799439011']) {
      const res = await ctx.http().get(`/api/portal/discussions/${id}`).set(alice).expect(404);
      expect(res.body).toEqual({
        statusCode: 404,
        message: 'Discussion not found',
        error: 'Not Found',
      });
    }
    await ctx.http().get('/api/portal/discussions/not-an-id').set(alice).expect(400);
    await ctx.http().get(`/api/portal/discussions/${bobs}`).set(bob).expect(200);
  });

  it('never leaks internal fields; value only with showValueToClient', async () => {
    const plain = await lead('No value', {
      customerId: fx.customerA,
      visible: true,
      stage: 'DEMO',
    });
    const valued = await lead('With value', {
      customerId: fx.customerA,
      visible: true,
      showValue: true,
    });

    const list = await ctx.http().get('/api/portal/discussions').set(alice).expect(200);
    const keys = keysOf(list.body);
    for (const k of PRIVATE_KEYS) expect(keys).not.toContain(k);
    expect(JSON.stringify(list.body)).not.toMatch(/INTERNAL|SecretSource|Secret Contact|secret@/);

    const p = (await ctx.http().get(`/api/portal/discussions/${plain}`).set(alice).expect(200))
      .body;
    expect(Object.keys(p).sort()).toEqual([
      'id',
      'lastUpdatedAt',
      'stage',
      'stageProgress',
      'status',
      'timeline',
      'title',
    ]);
    expect(p).toMatchObject({
      title: 'No value',
      stage: 'DEMO',
      status: 'ACTIVE',
      stageProgress: 50,
    });
    expect(p.timeline.map((t: { stage: string }) => t.stage)).toEqual(['DEMO', 'LEAD']);
    expect(Object.keys(p.timeline[0]).sort()).toEqual(['at', 'stage']);
    expect(p.lastUpdatedAt).toBe(p.timeline[0].at);

    const v = (await ctx.http().get(`/api/portal/discussions/${valued}`).set(alice).expect(200))
      .body;
    expect(v.value).toBe(123456);
    for (const k of PRIVATE_KEYS) expect(Object.keys(v)).not.toContain(k);
  });

  it('stageProgress spans LEAD (0) → PENDING (100)', async () => {
    const id = await lead('Progress', { customerId: fx.customerA, visible: true });
    const expected: [string, number][] = [
      ['LEAD', 0],
      ['IDENTIFIED', 13],
      ['QUALIFIED', 38],
      ['PROPOSAL', 63],
      ['VERBAL', 88],
      ['PENDING', 100],
    ];
    for (const [stage, progress] of expected) {
      if (stage !== 'LEAD')
        await ctx.http().patch(`/api/leads/${id}/stage`).set(admin).send({ stage }).expect(200);
      const res = await ctx.http().get(`/api/portal/discussions/${id}`).set(alice).expect(200);
      expect([stage, res.body.stageProgress]).toEqual([stage, progress]);
    }
  });

  it('CANCELLED → status CLOSED, keeps last progress, listed after active ones', async () => {
    const closed = await lead('Closed one', {
      customerId: fx.customerA,
      visible: true,
      stage: 'PROPOSAL',
    });
    await ctx
      .http()
      .patch(`/api/leads/${closed}/stage`)
      .set(admin)
      .send({ stage: 'CANCELLED' })
      .expect(200);
    const older = await lead('Active older', { customerId: fx.customerA, visible: true });
    const newer = await lead('Active newer', {
      customerId: fx.customerA,
      visible: true,
      stage: 'DEMO',
    });

    const res = await ctx.http().get('/api/portal/discussions').set(alice).expect(200);
    expect(res.body.map((d: { id: string }) => d.id)).toEqual([newer, older, closed]);
    expect(res.body[2]).toMatchObject({ status: 'CLOSED', stage: 'CANCELLED', stageProgress: 63 });

    const summary = await ctx.http().get('/api/portal/summary').set(alice).expect(200);
    expect(summary.body).toEqual({ projects: 0, activeDiscussions: 2 });
  });

  it('after conversion the discussion disappears and the project appears', async () => {
    const id = await lead('Becomes a project', {
      customerId: fx.customerA,
      visible: true,
      stage: 'PENDING',
    });
    expect((await ctx.http().get('/api/portal/summary').set(alice)).body).toEqual({
      projects: 0,
      activeDiscussions: 1,
    });

    await ctx
      .http()
      .post(`/api/leads/${id}/convert`)
      .set(admin)
      .send({
        contractValue: 150000,
        startDate: '2026-11-01',
        endDate: '2027-01-31',
        customerId: fx.customerA,
        staffIds: [],
      })
      .expect(201);

    expect((await ctx.http().get('/api/portal/discussions').set(alice)).body).toEqual([]);
    await ctx.http().get(`/api/portal/discussions/${id}`).set(alice).expect(404);
    const projects = await ctx.http().get('/api/portal/projects').set(alice).expect(200);
    expect(projects.body.map((p: { name: string }) => p.name)).toEqual(['Becomes a project']);
    expect((await ctx.http().get('/api/portal/summary').set(alice)).body).toEqual({
      projects: 1,
      activeDiscussions: 0,
    });
  });

  describe('PATCH /leads/:id/client-access', () => {
    it('shares, hides and unlinks a lead', async () => {
      const id = await lead('To share');
      const shared = await ctx
        .http()
        .patch(`/api/leads/${id}/client-access`)
        .set(admin)
        .send({ customerId: fx.customerA, visibleToClient: true, showValueToClient: true })
        .expect(200);
      expect(shared.body).toMatchObject({
        customerId: fx.customerA,
        visibleToClient: true,
        showValueToClient: true,
      });
      await ctx.http().get(`/api/portal/discussions/${id}`).set(alice).expect(200);

      // Clearing the customer resets both flags.
      const cleared = await ctx
        .http()
        .patch(`/api/leads/${id}/client-access`)
        .set(admin)
        .send({ customerId: null })
        .expect(200);
      expect(cleared.body).toMatchObject({
        customerId: null,
        visibleToClient: false,
        showValueToClient: false,
      });
      await ctx.http().get(`/api/portal/discussions/${id}`).set(alice).expect(404);
    });

    it('rejects visibleToClient without a customer, and unknown customers', async () => {
      const id = await lead('No customer');
      const res = await ctx
        .http()
        .patch(`/api/leads/${id}/client-access`)
        .set(admin)
        .send({ visibleToClient: true })
        .expect(400);
      expect(res.body.message).toMatch(/customerId/);
      await ctx
        .http()
        .patch(`/api/leads/${id}/client-access`)
        .set(admin)
        .send({ customerId: null, visibleToClient: true })
        .expect(400);
      await ctx
        .http()
        .patch(`/api/leads/${id}/client-access`)
        .set(admin)
        .send({ customerId: '507f1f77bcf86cd799439011', visibleToClient: true })
        .expect(400);
      await ctx
        .http()
        .post('/api/leads')
        .set(admin)
        .send({ title: 't', company: 'c', owner: fx.staffMemberId, visibleToClient: true })
        .expect(400);
      await ctx
        .http()
        .patch(`/api/leads/${id}/client-access`)
        .set(admin)
        .send({ customerId: 'nope' })
        .expect(400);
    });

    it('is ADMIN-only', async () => {
      const id = await lead('Admin only');
      await ctx
        .http()
        .patch(`/api/leads/${id}/client-access`)
        .set(alice)
        .send({ customerId: fx.customerA })
        .expect(403);
      await ctx
        .http()
        .patch(`/api/leads/${id}/client-access`)
        .send({ customerId: fx.customerA })
        .expect(401);
    });

    it('PATCH /leads/:id accepts the same fields and keeps them when omitted', async () => {
      const id = await lead('Via form');
      await ctx
        .http()
        .patch(`/api/leads/${id}`)
        .set(admin)
        .send({ customerId: fx.customerA, visibleToClient: true })
        .expect(200);
      const res = await ctx
        .http()
        .patch(`/api/leads/${id}`)
        .set(admin)
        .send({ notes: 'still private' })
        .expect(200);
      expect(res.body).toMatchObject({
        customerId: fx.customerA,
        visibleToClient: true,
        notes: 'still private',
      });
      const raw = await ctx.model<Lead>(Lead.name).findById(id).lean();
      expect(raw).toMatchObject({ visibleToClient: true, showValueToClient: false });
    });

    it("cannot move a converted lead to another customer's account", async () => {
      const id = await lead('Converted', { customerId: fx.customerA, visible: true });
      await ctx
        .http()
        .post(`/api/leads/${id}/convert`)
        .set(admin)
        .send({
          contractValue: 1000,
          startDate: '2026-11-01',
          endDate: '2026-12-01',
          customerId: fx.customerA,
          staffIds: [],
        })
        .expect(201);
      await ctx
        .http()
        .patch(`/api/leads/${id}/client-access`)
        .set(admin)
        .send({ customerId: fx.customerB })
        .expect(409);
      await ctx
        .http()
        .patch(`/api/leads/${id}/client-access`)
        .set(admin)
        .send({ showValueToClient: true })
        .expect(200);
    });
  });
});
