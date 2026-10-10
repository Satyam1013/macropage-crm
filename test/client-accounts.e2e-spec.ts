import { Customer } from '../src/customers/schemas/customer.schema';
import { User } from '../src/users/schemas/user.schema';
import { WhatsappMessage } from '../src/whatsapp/schemas/whatsapp-message.schema';
import { WhatsappProvider } from '../src/whatsapp/whatsapp.provider';
import { WhatsappService } from '../src/whatsapp/whatsapp.service';
import {
  bearer,
  clearDatabase,
  createTestApp,
  Fixtures,
  seedFixtures,
  TestContext,
} from './utils/test-app';

describe('Phone-based client accounts & WhatsApp invites', () => {
  let ctx: TestContext;
  let fx: Fixtures;
  let admin: Record<string, string>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  beforeEach(async () => {
    jest.restoreAllMocks();
    await clearDatabase(ctx);
    fx = await seedFixtures(ctx);
    admin = bearer(fx.adminToken);
  });

  const rahul = { name: 'Rahul Shah', phone: '9876543210' };

  const createLead = (extra: Record<string, unknown> = {}) =>
    ctx
      .http()
      .post('/api/leads')
      .set(admin)
      .send({ title: 'Website', company: 'Shah Traders', owner: fx.staffMemberId, ...extra });

  const loginByPhone = (phone: string, password: string) =>
    ctx.http().post('/api/auth/login').send({ phone, password, role: 'CUSTOMER' });

  const messages = () => ctx.model<WhatsappMessage>(WhatsappMessage.name);

  it('newClient creates a customer + login, links the lead, and the client signs in by phone', async () => {
    const res = await createLead({
      customerId: null,
      newClient: rahul,
      visibleToClient: true,
      showValueToClient: false,
    }).expect(201);
    expect(res.body).toMatchObject({ visibleToClient: true, showValueToClient: false });
    expect(res.body.invite).toEqual({
      phone: '919876543210',
      email: null,
      temporaryPassword: expect.any(String),
    });

    const customer = await ctx.model<Customer>(Customer.name).findById(res.body.customerId).lean();
    expect(customer).toMatchObject({
      name: 'Shah Traders',
      contactName: 'Rahul Shah',
      phone: '919876543210',
    });
    const list = await ctx.http().get('/api/customers').set(admin).expect(200);
    expect(list.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: res.body.customerId,
          name: 'Shah Traders',
          contactName: 'Rahul Shah',
          phone: '919876543210',
          email: '',
        }),
      ]),
    );

    // Any common format of the same number works.
    for (const phone of ['9876543210', '+91 98765 43210', '098765-43210']) {
      const login = await loginByPhone(phone, res.body.invite.temporaryPassword).expect(200);
      expect(login.body.user).toMatchObject({
        role: 'CUSTOMER',
        customerId: res.body.customerId,
        email: null,
        name: 'Rahul Shah',
      });
    }
    await loginByPhone('9876543210', 'wrong-password').expect(401);
    await loginByPhone('9999999999', res.body.invite.temporaryPassword).expect(401);
  });

  it('dedupes newClient by phone and shows every shared lead in one portal login', async () => {
    const first = await createLead({ newClient: rahul, visibleToClient: true }).expect(201);
    const second = await createLead({
      title: 'Mobile app',
      newClient: { name: 'R. Shah', phone: '+91 98765-43210', email: 'rahul@shah.test' },
      visibleToClient: true,
    }).expect(201);
    expect(second.body.customerId).toBe(first.body.customerId);
    expect(second.body.invite).toBeUndefined();
    const third = await createLead({
      title: 'SEO',
      customerId: first.body.customerId,
      visibleToClient: true,
      showValueToClient: true,
      value: 5000,
    }).expect(201);
    expect(third.body.customerId).toBe(first.body.customerId);

    expect(await ctx.model<Customer>(Customer.name).countDocuments({ phone: '919876543210' })).toBe(
      1,
    );
    expect(
      await ctx.model<User>(User.name).countDocuments({ customerId: first.body.customerId }),
    ).toBe(1);

    const login = await loginByPhone('9876543210', first.body.invite.temporaryPassword).expect(200);
    const client = bearer(login.body.accessToken);
    const discussions = await ctx.http().get('/api/portal/discussions').set(client).expect(200);
    expect(discussions.body.map((d: { title: string }) => d.title).sort()).toEqual([
      'Mobile app',
      'SEO',
      'Website',
    ]);
    const seo = discussions.body.find((d: { title: string }) => d.title === 'SEO');
    expect(seo.value).toBe(5000);
    for (const d of discussions.body) {
      for (const k of ['notes', 'source', 'owner', 'ownerId']) expect(d).not.toHaveProperty(k);
    }

    // Another customer sees none of them.
    const alice = bearer(fx.customerAToken);
    expect((await ctx.http().get('/api/portal/discussions').set(alice).expect(200)).body).toEqual(
      [],
    );
    await ctx.http().get(`/api/portal/discussions/${first.body.id}`).set(alice).expect(404);
  });

  it('PATCH /leads/:id links a newClient on edit, and unlinks with customerId: null', async () => {
    const lead = (await createLead().expect(201)).body;
    const linked = await ctx
      .http()
      .patch(`/api/leads/${lead.id}`)
      .set(admin)
      .send({ customerId: null, newClient: rahul, visibleToClient: true, showValueToClient: true })
      .expect(200);
    expect(linked.body).toMatchObject({ visibleToClient: true, showValueToClient: true });
    expect(linked.body.customerId).toEqual(expect.any(String));

    const unlinked = await ctx
      .http()
      .patch(`/api/leads/${lead.id}`)
      .set(admin)
      .send({ customerId: null, newClient: null, visibleToClient: true, showValueToClient: true })
      .expect(200);
    expect(unlinked.body).toMatchObject({
      customerId: null,
      visibleToClient: false,
      showValueToClient: false,
    });
  });

  it('validates the access body', async () => {
    const bad: Record<string, unknown>[] = [
      { newClient: { phone: '9876543210' } },
      { newClient: { name: 'No phone' } },
      { newClient: { name: 'Bad phone', phone: '12345' } },
      { newClient: { name: 'Bad email', phone: '9876543210', email: 'nope' } },
      { customerId: fx.customerA, newClient: rahul },
      { customerId: fx.customerA, visibleToClient: false, showValueToClient: true },
      { sendWhatsapp: true },
      { customerId: fx.customerA, sendWhatsapp: true }, // fixture customer has no phone
    ];
    for (const body of bad) await createLead(body).expect(400);
    expect(await ctx.model<Customer>(Customer.name).countDocuments()).toBe(2);
    expect(await messages().countDocuments()).toBe(0);
  });

  it('rolls back the new customer and login when the lead save fails', async () => {
    const lead = (await createLead({ customerId: fx.customerA }).expect(201)).body;
    await ctx
      .http()
      .post(`/api/leads/${lead.id}/convert`)
      .set(admin)
      .send({ contractValue: 1000, plan: 'PRO', startDate: '2026-11-01', endDate: '2026-12-01' })
      .expect(201);
    // Converted leads can't move to another customer: 409 after the customer was created.
    await ctx
      .http()
      .patch(`/api/leads/${lead.id}`)
      .set(admin)
      .send({ newClient: rahul, sendWhatsapp: true })
      .expect(409);
    expect(await ctx.model<Customer>(Customer.name).countDocuments({ phone: '919876543210' })).toBe(
      0,
    );
    expect(await ctx.model<User>(User.name).countDocuments({ name: 'Rahul Shah' })).toBe(0);
    expect(await messages().countDocuments()).toBe(0);
  });

  describe('WhatsApp', () => {
    it('queues exactly one message when sendWhatsapp is true, none when false', async () => {
      await createLead({ newClient: rahul, sendWhatsapp: false }).expect(201);
      expect(await messages().countDocuments()).toBe(0);

      const res = await createLead({
        title: 'Mobile app',
        newClient: rahul,
        visibleToClient: true,
        sendWhatsapp: true,
      }).expect(201);
      expect(res.body.whatsapp).toEqual({ id: expect.any(String), status: 'PENDING' });
      const rows = await messages().find().lean();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        phone: '919876543210',
        template: 'CLIENT_PORTAL_INVITE',
        status: 'PENDING',
        params: expect.objectContaining({ title: 'Mobile app', newAccount: false }),
      });
      expect(String(rows[0].leadId)).toBe(res.body.id);
    });

    it('sends the portal link, phone login and new password, then forgets the password', async () => {
      const provider = ctx.moduleRef.get(WhatsappProvider);
      const send = jest.spyOn(provider, 'send');
      const res = await createLead({ newClient: rahul, sendWhatsapp: true }).expect(201);

      expect(await ctx.moduleRef.get(WhatsappService).processDue()).toBe(1);
      expect(send).toHaveBeenCalledTimes(1);
      const [phone, body] = send.mock.calls[0];
      expect(phone).toBe('919876543210');
      expect(body).toContain('Hi Rahul Shah');
      expect(body).toContain('"Website"');
      expect(body).toContain('http://localhost:5173');
      expect(body).toContain('+919876543210');
      expect(body).toContain(res.body.invite.temporaryPassword);

      const row = await messages().findById(res.body.whatsapp.id).lean();
      expect(row).toMatchObject({ status: 'SENT', attempts: 1, error: null });
      expect(row!.params.temporaryPassword).toBeNull();
      expect(row!.sentAt).toBeInstanceOf(Date);
    });

    it('a provider outage marks the message FAILED without failing the lead save; it can be retried', async () => {
      const provider = ctx.moduleRef.get(WhatsappProvider);
      jest.spyOn(provider, 'send').mockRejectedValueOnce(new Error('provider down'));
      const res = await createLead({ newClient: rahul, sendWhatsapp: true }).expect(201);
      const service = ctx.moduleRef.get(WhatsappService);
      await service.processDue();

      const list = await ctx
        .http()
        .get(`/api/whatsapp-messages?leadId=${res.body.id}`)
        .set(admin)
        .expect(200);
      expect(list.body).toEqual([
        expect.objectContaining({ status: 'FAILED', error: 'provider down', attempts: 1 }),
      ]);
      expect(JSON.stringify(list.body)).not.toContain(res.body.invite.temporaryPassword);
      // Backoff: not due yet.
      expect(await service.processDue()).toBe(0);

      const retried = await ctx
        .http()
        .post(`/api/whatsapp-messages/${list.body[0].id}/retry`)
        .set(admin)
        .expect(200);
      expect(retried.body.attempts).toBe(0);
      expect(await service.processDue()).toBe(1);
      const row = await messages().findById(list.body[0].id).lean();
      expect(row).toMatchObject({ status: 'SENT', error: null });
      await ctx
        .http()
        .post(`/api/whatsapp-messages/${list.body[0].id}/retry`)
        .set(admin)
        .expect(404);
    });

    it('is not available to customers', async () => {
      await ctx.http().get('/api/whatsapp-messages').set(bearer(fx.customerAToken)).expect(403);
    });
  });

  describe('customers & login', () => {
    it('normalises customer phones and keeps them unique among live customers', async () => {
      const a = await ctx
        .http()
        .patch(`/api/customers/${fx.customerA}`)
        .set(admin)
        .send({ phone: '+91 98765 43210' })
        .expect(200);
      expect(a.body.phone).toBe('919876543210');
      await ctx
        .http()
        .patch(`/api/customers/${fx.customerB}`)
        .set(admin)
        .send({ phone: '09876543210' })
        .expect(409);
      await ctx
        .http()
        .patch(`/api/customers/${fx.customerB}`)
        .set(admin)
        .send({ phone: 'call me' })
        .expect(400);
      const cleared = await ctx
        .http()
        .patch(`/api/customers/${fx.customerA}`)
        .set(admin)
        .send({ phone: '' })
        .expect(200);
      expect(cleared.body.phone).toBe('');
      // Several customers without a phone are fine.
      await ctx.http().post('/api/customers').set(admin).send({ name: 'No phone Ltd' }).expect(201);
    });

    it('existing customer logins can sign in by phone once the customer has one', async () => {
      await ctx
        .http()
        .patch(`/api/customers/${fx.customerA}`)
        .set(admin)
        .send({ phone: '9811122233' })
        .expect(200);
      const res = await loginByPhone('98111 22233', 'password123').expect(200);
      expect(res.body.user).toMatchObject({ customerId: fx.customerA, email: 'alice@alpha.test' });
      // Email still works for CUSTOMER, and ADMIN login is unchanged.
      await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: 'alice@alpha.test', password: 'password123', role: 'CUSTOMER' })
        .expect(200);
      await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: 'admin@test.dev', password: 'password123', role: 'ADMIN' })
        .expect(200);
      // ADMIN must use email.
      await ctx
        .http()
        .post('/api/auth/login')
        .send({ phone: '9811122233', password: 'password123', role: 'ADMIN' })
        .expect(400);
      await ctx
        .http()
        .post('/api/auth/login')
        .send({ phone: 'abc', password: 'password123', role: 'CUSTOMER' })
        .expect(400);
    });
  });
});
