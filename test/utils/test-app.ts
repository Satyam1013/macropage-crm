import { INestApplication, Logger } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { Connection, Model } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { Customer } from '../../src/customers/schemas/customer.schema';
import { Staff } from '../../src/staff/schemas/staff.schema';
import { User } from '../../src/users/schemas/user.schema';

export interface TestContext {
  app: INestApplication;
  moduleRef: TestingModule;
  connection: Connection;
  http: () => ReturnType<typeof request>;
  model: <T>(name: string) => Model<T>;
  close: () => Promise<void>;
}

/** Boots the real AppModule against this test file's database (see test/setup-env.ts). */
export async function createTestApp(): Promise<TestContext> {
  Logger.overrideLogger(['error']);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  configureApp(app);
  await app.init();

  const connection = moduleRef.get<Connection>(getConnectionToken());
  // Create collections + indexes up front: DDL inside a transaction races with index builds.
  await Promise.all(Object.values(connection.models).map((m) => m.init()));

  return {
    app,
    moduleRef,
    connection,
    http: () => request(app.getHttpServer()),
    model: <T>(name: string) => moduleRef.get<Model<T>>(getModelToken(name)),
    close: async () => {
      await connection.dropDatabase();
      await app.close();
    },
  };
}

export async function clearDatabase(ctx: TestContext): Promise<void> {
  await Promise.all(Object.values(ctx.connection.collections).map((c) => c.deleteMany({})));
}

export interface Fixtures {
  adminId: string;
  adminToken: string;
  customerA: string;
  customerB: string;
  customerAToken: string;
  customerBToken: string;
  engineerId: string;
  staffMemberId: string;
}

/** Admin + two customers (each with a login) + two staff members; returns access tokens. */
export async function seedFixtures(ctx: TestContext): Promise<Fixtures> {
  const hash = await bcrypt.hash('password123', 4);
  const [a, b] = await ctx.model<Customer>(Customer.name).create([
    { name: 'Alpha Corp', contactName: 'Alice', email: 'alice@alpha.test' },
    { name: 'Beta Ltd', contactName: 'Bob', email: 'bob@beta.test' },
  ]);
  const [admin] = await ctx.model<User>(User.name).create([
    { name: 'Admin', email: 'admin@test.dev', passwordHash: hash, role: 'ADMIN' },
    {
      name: 'Alice',
      email: 'alice@alpha.test',
      passwordHash: hash,
      role: 'CUSTOMER',
      customerId: a._id,
    },
    {
      name: 'Bob',
      email: 'bob@beta.test',
      passwordHash: hash,
      role: 'CUSTOMER',
      customerId: b._id,
    },
  ]);
  const [eng, stf] = await ctx.model<Staff>(Staff.name).create([
    {
      name: 'Eve Engineer',
      role: 'Backend Engineer',
      type: 'ENGINEER',
      email: 'eve@internal.test',
    },
    { name: 'Sam Staff', role: 'Coordinator', type: 'STAFF' },
  ]);

  const login = async (email: string, role: 'ADMIN' | 'CUSTOMER') => {
    const res = await ctx
      .http()
      .post('/api/auth/login')
      .send({ email, password: 'password123', role })
      .expect(200);
    return res.body.accessToken as string;
  };
  return {
    adminId: admin.id as string,
    adminToken: await login('admin@test.dev', 'ADMIN'),
    customerA: a.id as string,
    customerB: b.id as string,
    customerAToken: await login('alice@alpha.test', 'CUSTOMER'),
    customerBToken: await login('bob@beta.test', 'CUSTOMER'),
    engineerId: eng.id as string,
    staffMemberId: stf.id as string,
  };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
