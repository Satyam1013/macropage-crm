import { User } from '../src/users/schemas/user.schema';
import {
  bearer,
  clearDatabase,
  createTestApp,
  Fixtures,
  seedFixtures,
  TestContext,
} from './utils/test-app';

describe('Auth & users', () => {
  let ctx: TestContext;
  let fx: Fixtures;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await clearDatabase(ctx);
    fx = await seedFixtures(ctx);
  });

  const login = (email: string, password: string, role: 'ADMIN' | 'CUSTOMER') =>
    ctx.http().post('/api/auth/login').send({ email, password, role });

  it('logs in and never returns secret fields', async () => {
    const res = await login('admin@test.dev', 'password123', 'ADMIN').expect(200);
    expect(res.body).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      user: expect.objectContaining({ id: fx.adminId, email: 'admin@test.dev', role: 'ADMIN' }),
    });
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/passwordHash|refreshTokenHash|deletedAt|"_id"|__v/);

    const me = await ctx.http().get('/api/auth/me').set(bearer(res.body.accessToken)).expect(200);
    expect(JSON.stringify(me.body)).not.toMatch(/passwordHash|refreshTokenHash/);
    const users = await ctx.http().get('/api/users').set(bearer(res.body.accessToken)).expect(200);
    expect(JSON.stringify(users.body)).not.toMatch(/passwordHash|refreshTokenHash/);
  });

  it('rejects bad credentials and a role that does not match the account', async () => {
    const bad = await login('admin@test.dev', 'nope', 'ADMIN').expect(401);
    expect(bad.body).toEqual({
      statusCode: 401,
      message: 'Invalid email or password',
      error: 'Unauthorized',
    });
    await login('nobody@test.dev', 'password123', 'ADMIN').expect(401);
    await login('admin@test.dev', 'password123', 'CUSTOMER').expect(403);
    await login('alice@alpha.test', 'password123', 'ADMIN').expect(403);
    const res = await login('alice@alpha.test', 'password123', 'CUSTOMER').expect(200);
    expect(res.body.user).toMatchObject({
      role: 'CUSTOMER',
      customerId: fx.customerA,
      customerName: 'Alpha Corp',
    });
  });

  it('rotates refresh tokens and revokes the session on reuse', async () => {
    const first = (await login('admin@test.dev', 'password123', 'ADMIN').expect(200)).body;
    const second = (
      await ctx
        .http()
        .post('/api/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(200)
    ).body;
    expect(second.refreshToken).not.toBe(first.refreshToken);

    // Replaying the old token kills the session, including the newest token.
    await ctx
      .http()
      .post('/api/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(401);
    await ctx
      .http()
      .post('/api/auth/refresh')
      .send({ refreshToken: second.refreshToken })
      .expect(401);
  });

  it('logout invalidates the refresh token', async () => {
    const s = (await login('admin@test.dev', 'password123', 'ADMIN').expect(200)).body;
    await ctx.http().post('/api/auth/logout').set(bearer(s.accessToken)).expect(200);
    await ctx.http().post('/api/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
  });

  it('rejects an access token used as a refresh token and vice versa', async () => {
    const s = (await login('admin@test.dev', 'password123', 'ADMIN').expect(200)).body;
    await ctx.http().post('/api/auth/refresh').send({ refreshToken: s.accessToken }).expect(401);
    await ctx.http().get('/api/auth/me').set(bearer(s.refreshToken)).expect(401);
  });

  it('change-password verifies the current password', async () => {
    const s = (await login('alice@alpha.test', 'password123', 'CUSTOMER').expect(200)).body;
    await ctx
      .http()
      .post('/api/auth/change-password')
      .set(bearer(s.accessToken))
      .send({ currentPassword: 'wrong', newPassword: 'newpass123' })
      .expect(401);
    await ctx
      .http()
      .post('/api/auth/change-password')
      .set(bearer(s.accessToken))
      .send({ currentPassword: 'password123', newPassword: 'newpass123' })
      .expect(200);
    await login('alice@alpha.test', 'password123', 'CUSTOMER').expect(401);
    await login('alice@alpha.test', 'newpass123', 'CUSTOMER').expect(200);
  });

  it('deactivated users lose access immediately', async () => {
    const s = (await login('alice@alpha.test', 'password123', 'CUSTOMER').expect(200)).body;
    const aliceId = (await ctx.model<User>(User.name).findOne({ email: 'alice@alpha.test' }))!
      .id as string;
    await ctx
      .http()
      .patch(`/api/users/${aliceId}`)
      .set(bearer(fx.adminToken))
      .send({ isActive: false })
      .expect(200);
    await ctx.http().get('/api/portal/projects').set(bearer(s.accessToken)).expect(401);
    await login('alice@alpha.test', 'password123', 'CUSTOMER').expect(403);
  });

  it('admin manages customer logins (temporary passwords, reset, duplicate email → 409)', async () => {
    const admin = bearer(fx.adminToken);
    const created = await ctx
      .http()
      .post('/api/users')
      .set(admin)
      .send({
        name: 'Carol',
        email: 'Carol@Alpha.test',
        role: 'CUSTOMER',
        customerId: fx.customerA,
      })
      .expect(201);
    expect(created.body).toMatchObject({
      email: 'carol@alpha.test',
      role: 'CUSTOMER',
      temporaryPassword: expect.any(String),
    });
    await login('carol@alpha.test', created.body.temporaryPassword, 'CUSTOMER').expect(200);

    await ctx
      .http()
      .post('/api/users')
      .set(admin)
      .send({ name: 'Dup', email: 'carol@alpha.test', role: 'CUSTOMER', customerId: fx.customerA })
      .expect(409);
    await ctx
      .http()
      .post('/api/users')
      .set(admin)
      .send({ name: 'NoCust', email: 'x@y.test', role: 'CUSTOMER' })
      .expect(400);

    const reset = await ctx
      .http()
      .post(`/api/users/${created.body.id}/reset-password`)
      .set(admin)
      .send({})
      .expect(200);
    await login('carol@alpha.test', reset.body.temporaryPassword, 'CUSTOMER').expect(200);
    await ctx
      .http()
      .patch(`/api/users/${fx.adminId}`)
      .set(admin)
      .send({ isActive: false })
      .expect(400);
  });

  it('error responses share one shape (validation, cast, not found)', async () => {
    const admin = bearer(fx.adminToken);
    const v = await ctx
      .http()
      .post('/api/staff')
      .set(admin)
      .send({ name: '', type: 'ROBOT' })
      .expect(400);
    expect(v.body).toEqual({ statusCode: 400, message: expect.any(Array), error: 'Bad Request' });
    const nf = await ctx
      .http()
      .get('/api/customers/507f1f77bcf86cd799439011')
      .set(admin)
      .expect(404);
    expect(nf.body).toEqual({ statusCode: 404, message: 'Customer not found', error: 'Not Found' });
    const q = await ctx.http().get('/api/payments?projectId=abc').set(admin).expect(400);
    expect(q.body.error).toBe('Bad Request');
  });
});
