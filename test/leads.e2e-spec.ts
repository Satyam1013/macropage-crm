import { Logger } from '@nestjs/common';
import { Customer } from '../src/customers/schemas/customer.schema';
import { Lead } from '../src/leads/schemas/lead.schema';
import { LeadsService } from '../src/leads/leads.service';
import { Project } from '../src/projects/schemas/project.schema';
import { User } from '../src/users/schemas/user.schema';
import {
  bearer,
  clearDatabase,
  createTestApp,
  Fixtures,
  seedFixtures,
  TestContext,
} from './utils/test-app';

describe('Leads: stage rules & Deal Won → Project conversion', () => {
  let ctx: TestContext;
  let fx: Fixtures;
  let admin: Record<string, string>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  beforeEach(async () => {
    await clearDatabase(ctx);
    fx = await seedFixtures(ctx);
    admin = bearer(fx.adminToken);
  });

  const createLead = async (overrides: Record<string, unknown> = {}) => {
    const res = await ctx
      .http()
      .post('/api/leads')
      .set(admin)
      .send({
        title: 'CRM build',
        company: 'Gamma Industries',
        contactName: 'Gita',
        email: 'gita@gamma.test',
        phone: '+91 90000 00000',
        source: 'Website',
        value: 100000,
        owner: fx.staffMemberId, // frontend alias for ownerId
        expectedClose: '2026-12-31',
        ...overrides,
      })
      .expect(201);
    return res.body as { id: string; stage: string; owner: string; stageHistory: unknown[] };
  };

  const convertBody = (overrides: Record<string, unknown> = {}) => ({
    contractValue: 250000,
    startDate: '2026-11-01',
    endDate: '2027-01-31',
    customerId: 'NEW',
    staffIds: [fx.engineerId, fx.staffMemberId],
    description: 'Build it',
    requirements: '- login\n- reports',
    ...overrides,
  });

  describe('stage changes', () => {
    it('starts at LEAD with an initial history entry and the frontend field names', async () => {
      const lead = await createLead();
      expect(lead).toMatchObject({
        stage: 'LEAD',
        owner: fx.staffMemberId,
        expectedClose: '2026-12-31',
        projectId: null,
      });
      expect(lead.stageHistory).toEqual([
        expect.objectContaining({ from: null, to: 'LEAD', by: fx.adminId, byName: 'Admin' }),
      ]);
    });

    it('moves freely forward/backward and to CANCELLED, recording history and stageUpdatedAt', async () => {
      const lead = await createLead();
      for (const stage of ['PROPOSAL', 'QUALIFIED', 'CANCELLED', 'DEMO']) {
        const res = await ctx
          .http()
          .patch(`/api/leads/${lead.id}/stage`)
          .set(admin)
          .send({ stage })
          .expect(200);
        expect(res.body.stage).toBe(stage);
      }
      const res = await ctx.http().get(`/api/leads/${lead.id}`).set(admin).expect(200);
      expect(
        res.body.stageHistory.map((h: { from: string; to: string }) => `${h.from}→${h.to}`),
      ).toEqual([
        'null→LEAD',
        'LEAD→PROPOSAL',
        'PROPOSAL→QUALIFIED',
        'QUALIFIED→CANCELLED',
        'CANCELLED→DEMO',
      ]);
      expect(new Date(res.body.stageUpdatedAt).getTime()).toBeGreaterThan(
        new Date(res.body.createdAt).getTime() - 1,
      );
    });

    it('refuses WON through the stage endpoint and on create', async () => {
      const lead = await createLead();
      const res = await ctx
        .http()
        .patch(`/api/leads/${lead.id}/stage`)
        .set(admin)
        .send({ stage: 'WON' })
        .expect(400);
      expect(res.body).toEqual({
        statusCode: 400,
        message: expect.stringMatching(/convert/),
        error: 'Bad Request',
      });
      await ctx
        .http()
        .post('/api/leads')
        .set(admin)
        .send({ title: 't', company: 'c', ownerId: fx.staffMemberId, stage: 'WON' })
        .expect(400);
    });

    it('validates stage values and ids', async () => {
      const lead = await createLead();
      await ctx
        .http()
        .patch(`/api/leads/${lead.id}/stage`)
        .set(admin)
        .send({ stage: 'NOPE' })
        .expect(400);
      await ctx
        .http()
        .patch('/api/leads/not-an-id/stage')
        .set(admin)
        .send({ stage: 'DEMO' })
        .expect(400);
      await ctx
        .http()
        .patch('/api/leads/507f1f77bcf86cd799439011/stage')
        .set(admin)
        .send({ stage: 'DEMO' })
        .expect(404);
    });

    it('soft-deletes unconverted leads', async () => {
      const lead = await createLead();
      await ctx.http().delete(`/api/leads/${lead.id}`).set(admin).expect(200);
      await ctx.http().get(`/api/leads/${lead.id}`).set(admin).expect(404);
      const raw = await ctx.model<Lead>(Lead.name).collection.findOne({ title: 'CRM build' });
      expect(raw?.deletedAt).toBeInstanceOf(Date);
    });

    it('filters the board and computes stats', async () => {
      await createLead({ title: 'A', value: 1000 });
      const b = await createLead({ title: 'B', value: 2000, source: 'Referral' });
      const c = await createLead({ title: 'C', value: 4000 });
      await ctx
        .http()
        .patch(`/api/leads/${b.id}/stage`)
        .set(admin)
        .send({ stage: 'CANCELLED' })
        .expect(200);
      await ctx
        .http()
        .post(`/api/leads/${c.id}/convert`)
        .set(admin)
        .send(convertBody({ contractValue: 5000 }))
        .expect(201);

      const referral = await ctx.http().get('/api/leads?source=referral').set(admin).expect(200);
      expect(referral.body.map((l: { title: string }) => l.title)).toEqual(['B']);
      const search = await ctx.http().get('/api/leads?search=gAmMa').set(admin).expect(200);
      expect(search.body).toHaveLength(3);

      const stats = await ctx.http().get('/api/leads/stats').set(admin).expect(200);
      expect(stats.body).toEqual({
        total: 3,
        inPipeline: 1,
        pipelineValue: 1000,
        won: 1,
        wonValue: 5000,
        cancelled: 1,
        winRate: 33,
      });
    });
  });

  describe('POST /leads/:id/convert', () => {
    it('creates customer, customer login and project; marks the lead WON and locks it', async () => {
      const lead = await createLead();
      const res = await ctx
        .http()
        .post(`/api/leads/${lead.id}/convert`)
        .set(admin)
        .send(convertBody())
        .expect(201);
      const project = res.body;
      expect(project).toMatchObject({
        leadId: lead.id,
        name: 'CRM build',
        clientName: 'Gamma Industries',
        stage: 'INITIATE',
        startDate: '2026-11-01',
        endDate: '2027-01-31',
        contractValue: 250000,
        dev: { requirement: 0, ui: 0, frontend: 0, backend: 0 },
        team: [fx.engineerId, fx.staffMemberId],
        clientApproved: false,
        progress: 5,
      });
      // Temporary password is exposed outside production only.
      expect(project.invite).toEqual({
        email: 'gita@gamma.test',
        temporaryPassword: expect.any(String),
      });

      const customer = await ctx.model<Customer>(Customer.name).findById(project.customerId).lean();
      expect(customer).toMatchObject({
        name: 'Gamma Industries',
        contactName: 'Gita',
        email: 'gita@gamma.test',
      });
      const user = await ctx.model<User>(User.name).findOne({ email: 'gita@gamma.test' }).lean();
      expect(user).toMatchObject({ role: 'CUSTOMER' });
      expect(String(user!.customerId)).toBe(project.customerId);

      // The invited customer can sign in with the temporary password.
      await ctx
        .http()
        .post('/api/auth/login')
        .send({
          email: 'gita@gamma.test',
          password: project.invite.temporaryPassword,
          role: 'CUSTOMER',
        })
        .expect(200);

      const leadAfter = (await ctx.http().get(`/api/leads/${lead.id}`).set(admin).expect(200)).body;
      expect(leadAfter).toMatchObject({
        stage: 'WON',
        projectId: project.id,
        customerId: project.customerId,
        value: 250000,
      });
      expect(leadAfter.wonAt).toEqual(expect.any(String));
      expect(leadAfter.stageHistory.at(-1)).toMatchObject({
        from: 'LEAD',
        to: 'WON',
        by: fx.adminId,
      });

      const detail = (await ctx.http().get(`/api/projects/${project.id}`).set(admin).expect(200))
        .body;
      expect(detail.stageHistory).toEqual([
        expect.objectContaining({ from: null, to: 'INITIATE' }),
      ]);
      expect(detail).toMatchObject({ engineerCount: 1, staffCount: 1 });

      // Locked afterwards.
      await ctx
        .http()
        .patch(`/api/leads/${lead.id}/stage`)
        .set(admin)
        .send({ stage: 'DEMO' })
        .expect(409);
      await ctx.http().delete(`/api/leads/${lead.id}`).set(admin).expect(409);
      await ctx
        .http()
        .post(`/api/leads/${lead.id}/convert`)
        .set(admin)
        .send(convertBody())
        .expect(409);
    });

    it('uses an existing customer and does not create a login', async () => {
      const lead = await createLead({ email: 'someone@new.test' });
      const res = await ctx
        .http()
        .post(`/api/leads/${lead.id}/convert`)
        .set(admin)
        .send(convertBody({ customerId: fx.customerA }))
        .expect(201);
      expect(res.body).toMatchObject({ customerId: fx.customerA, clientName: 'Alpha Corp' });
      expect(res.body.invite).toBeUndefined();
      expect(await ctx.model<User>(User.name).countDocuments({ email: 'someone@new.test' })).toBe(
        0,
      );
    });

    it('skips the login when a user with the lead email already exists', async () => {
      const lead = await createLead({ email: 'alice@alpha.test' });
      const res = await ctx
        .http()
        .post(`/api/leads/${lead.id}/convert`)
        .set(admin)
        .send(convertBody())
        .expect(201);
      expect(res.body.invite).toBeUndefined();
      expect(await ctx.model<User>(User.name).countDocuments({ email: 'alice@alpha.test' })).toBe(
        1,
      );
    });

    it.each([
      [{ contractValue: 0 }, /contractValue/],
      [{ contractValue: -5 }, /contractValue/],
      [{ startDate: '2027-02-01', endDate: '2027-01-31' }, /endDate/],
      [{ startDate: '2027-02-30' }, /startDate/],
      [{ customerId: 'bogus' }, /customerId/],
      [{ staffIds: ['507f1f77bcf86cd799439011'] }, /unknown staff/],
      [{ customerId: '507f1f77bcf86cd799439011' }, /customer/],
    ])('rejects invalid input %j', async (override, message) => {
      const lead = await createLead();
      const res = await ctx
        .http()
        .post(`/api/leads/${lead.id}/convert`)
        .set(admin)
        .send(convertBody(override))
        .expect(400);
      expect(JSON.stringify(res.body.message)).toMatch(message);
      expect(await ctx.model<Project>(Project.name).countDocuments()).toBe(0);
    });

    it('refuses cancelled leads', async () => {
      const lead = await createLead();
      await ctx
        .http()
        .patch(`/api/leads/${lead.id}/stage`)
        .set(admin)
        .send({ stage: 'CANCELLED' })
        .expect(200);
      await ctx
        .http()
        .post(`/api/leads/${lead.id}/convert`)
        .set(admin)
        .send(convertBody())
        .expect(409);
    });

    it('rolls back every write when the project insert fails (duplicate key)', async () => {
      const lead = await createLead();
      // A soft-deleted project still owns the unique leadId → the insert inside the transaction fails.
      await ctx.model<Project>(Project.name).create({
        leadId: lead.id,
        customerId: fx.customerA,
        name: 'ghost',
        startDate: new Date(),
        endDate: new Date(),
        contractValue: 1,
        deletedAt: new Date(),
      });
      const customersBefore = await ctx.model<Customer>(Customer.name).countDocuments();
      const usersBefore = await ctx.model<User>(User.name).countDocuments();

      const res = await ctx
        .http()
        .post(`/api/leads/${lead.id}/convert`)
        .set(admin)
        .send(convertBody())
        .expect(409);
      expect(res.body.error).toBe('Conflict');

      expect(await ctx.model<Customer>(Customer.name).countDocuments()).toBe(customersBefore);
      expect(await ctx.model<User>(User.name).countDocuments()).toBe(usersBefore);
      expect(await ctx.model<User>(User.name).countDocuments({ email: 'gita@gamma.test' })).toBe(0);
      const leadAfter = await ctx.model<Lead>(Lead.name).findById(lead.id).lean();
      expect(leadAfter).toMatchObject({ stage: 'LEAD', wonAt: null });
      expect(leadAfter!.projectId).toBeUndefined();
      expect(leadAfter!.stageHistory).toHaveLength(1);
    });

    it('rolls back customer + login when a later step throws', async () => {
      const lead = await createLead();
      const service = ctx.moduleRef.get(LeadsService);
      const projectModel = (
        service as unknown as { projectModel: { create: (...a: unknown[]) => Promise<unknown> } }
      ).projectModel;
      const spy = jest
        .spyOn(projectModel, 'create')
        .mockRejectedValueOnce(new Error('disk on fire'));
      const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await ctx
        .http()
        .post(`/api/leads/${lead.id}/convert`)
        .set(admin)
        .send(convertBody())
        .expect(500);
      spy.mockRestore();
      logSpy.mockRestore();

      expect(
        await ctx.model<Customer>(Customer.name).countDocuments({ name: 'Gamma Industries' }),
      ).toBe(0);
      expect(await ctx.model<User>(User.name).countDocuments({ email: 'gita@gamma.test' })).toBe(0);
      expect((await ctx.model<Lead>(Lead.name).findById(lead.id).lean())!.stage).toBe('LEAD');

      // And the same request succeeds afterwards.
      await ctx
        .http()
        .post(`/api/leads/${lead.id}/convert`)
        .set(admin)
        .send(convertBody())
        .expect(201);
    });
  });
});
