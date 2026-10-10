import {
  migratePhoneLogin,
  PHONE_BACKUP_COLLECTION,
} from '../src/migrations/phone-login.migration';
import { clearDatabase, createTestApp, TestContext } from './utils/test-app';

describe('migration: phone-based customer login', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  it('normalises, clears empty/invalid/duplicate phones, backs up, and fixes the indexes', async () => {
    await clearDatabase(ctx);
    const customers = ctx.connection.collection('customers');
    const users = ctx.connection.collection('users');
    // Legacy shape: no phone index, unique non-partial email index on users.
    await customers.dropIndexes();
    await users.dropIndexes();
    await users.createIndex({ email: 1 }, { unique: true, name: 'email_1' });

    const t = (n: number) => new Date(Date.UTC(2026, 0, n));
    const { insertedIds } = await customers.insertMany([
      { name: 'Oldest', phone: '+91 98000 20001', createdAt: t(1), deletedAt: null },
      { name: 'Same number', phone: '098000-20001', createdAt: t(2), deletedAt: null },
      { name: 'Deleted same number', phone: '9800020001', createdAt: t(3), deletedAt: t(4) },
      { name: 'Empty', phone: '', createdAt: t(5), deletedAt: null },
      { name: 'Empty too', phone: '', createdAt: t(6), deletedAt: null },
      { name: 'Missing', createdAt: t(7), deletedAt: null },
      { name: 'Garbage', phone: 'ask reception', createdAt: t(8), deletedAt: null },
      { name: 'Already fine', phone: '14155550100', createdAt: t(9), deletedAt: null },
    ]);
    const id = (i: number) => insertedIds[i].toHexString();

    const dry = await migratePhoneLogin(ctx.connection, { apply: false });
    expect(dry.changes.map((c) => [c.name, c.reason, c.to])).toEqual([
      ['Oldest', 'normalized', '919800020001'],
      ['Same number', 'duplicate', null],
      ['Deleted same number', 'normalized', '919800020001'],
      ['Empty', 'empty', null],
      ['Empty too', 'empty', null],
      ['Missing', 'empty', null],
      ['Garbage', 'invalid', null],
    ]);
    expect(dry.changes[1].keptBy).toBe(id(0));
    expect((await customers.findOne({ _id: insertedIds[0] }))!.phone).toBe('+91 98000 20001');

    await migratePhoneLogin(ctx.connection, { apply: true });
    const phones = (await customers.find().sort({ createdAt: 1 }).toArray()).map((c) => c.phone);
    expect(phones).toEqual([
      '919800020001',
      null,
      '919800020001',
      null,
      null,
      null,
      null,
      '14155550100',
    ]);
    const backup = await ctx.connection.collection(PHONE_BACKUP_COLLECTION).find().toArray();
    expect(backup.map((b) => [b.name, b.phone, b.reason])).toEqual(
      expect.arrayContaining([
        ['Same number', '098000-20001', 'duplicate'],
        ['Garbage', 'ask reception', 'invalid'],
      ]),
    );

    const userIndexes = (await users.indexes()).map((i) => i.name);
    expect(userIndexes).toContain('email_unique');
    expect(userIndexes).not.toContain('email_1');
    expect((await customers.indexes()).map((i) => i.name)).toContain('phone_unique_live');
    // Two users without email are now allowed.
    await users.insertMany([
      { name: 'a', role: 'CUSTOMER', email: null, deletedAt: null },
      { name: 'b', role: 'CUSTOMER', email: null, deletedAt: null },
    ]);

    // Idempotent.
    expect((await migratePhoneLogin(ctx.connection, { apply: true })).changes).toEqual([]);
  });
});
