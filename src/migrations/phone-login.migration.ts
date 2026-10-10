import type { Connection, mongo } from 'mongoose';
import { Customer } from '../customers/schemas/customer.schema';
import { normalizePhone } from '../common/utils/phone.util';
import { User } from '../users/schemas/user.schema';

export const PHONE_BACKUP_COLLECTION = 'migration_2026_10_customer_phones';

export interface PhoneChange {
  id: string;
  name: string;
  from: unknown;
  to: string | null;
  reason: 'normalized' | 'empty' | 'invalid' | 'duplicate';
  /** For duplicates: the (older) live customer that keeps the number. */
  keptBy?: string;
}

export interface PhoneMigrationReport {
  changes: PhoneChange[];
  /** Index changes made by syncIndexes (apply only). */
  droppedIndexes: { customers: string[]; users: string[] };
}

/**
 * Prepares existing data for phone-based customer login:
 * 1. customers.phone → digits with country code; '' / missing → null; unparseable → null.
 *    When several live customers share a number, the oldest keeps it and the rest are cleared
 *    (an admin must fix those by hand; the report lists them). Original values are copied to
 *    PHONE_BACKUP_COLLECTION first.
 * 2. Syncs indexes on customers and users: adds the unique live-phone index, and replaces the
 *    old unique `email_1` on users (which forbids two users without email) with a partial one.
 *
 * Idempotent. With `apply: false` nothing is written.
 */
export async function migratePhoneLogin(
  connection: Connection,
  opts: { apply: boolean },
): Promise<PhoneMigrationReport> {
  const customers = connection.collection('customers');
  const docs = await customers
    .find({}, { projection: { name: 1, phone: 1, deletedAt: 1, createdAt: 1 } })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();

  const owners = new Map<string, mongo.ObjectId>();
  const changes: PhoneChange[] = [];
  for (const doc of docs) {
    const raw: unknown = doc.phone;
    const base = { id: doc._id.toHexString(), name: String(doc.name ?? ''), from: raw };
    if (raw === null) continue;
    if (raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
      changes.push({ ...base, to: null, reason: 'empty' });
      continue;
    }
    const phone = normalizePhone(raw);
    if (!phone) {
      changes.push({ ...base, to: null, reason: 'invalid' });
      continue;
    }
    const live = !doc.deletedAt;
    const owner = live ? owners.get(phone) : undefined;
    if (owner) {
      changes.push({ ...base, to: null, reason: 'duplicate', keptBy: owner.toHexString() });
      continue;
    }
    if (live) owners.set(phone, doc._id);
    if (phone !== raw) changes.push({ ...base, to: phone, reason: 'normalized' });
  }

  const report: PhoneMigrationReport = { changes, droppedIndexes: { customers: [], users: [] } };
  if (!opts.apply) return report;

  const meaningful = changes.filter((c) => c.reason !== 'empty');
  if (meaningful.length) {
    const migratedAt = new Date();
    await connection.collection(PHONE_BACKUP_COLLECTION).insertMany(
      meaningful.map((c) => ({
        customerId: c.id,
        name: c.name,
        phone: c.from,
        newPhone: c.to,
        reason: c.reason,
        keptBy: c.keptBy ?? null,
        migratedAt,
      })),
    );
  }
  if (changes.length) {
    const ops: mongo.AnyBulkWriteOperation<mongo.Document>[] = changes.map((c) => ({
      updateOne: {
        filter: { _id: docs.find((d) => d._id.toHexString() === c.id)!._id },
        update: { $set: { phone: c.to } },
      },
    }));
    await customers.bulkWrite(ops, { ordered: true });
  }

  report.droppedIndexes.customers = await connection.model(Customer.name).syncIndexes();
  report.droppedIndexes.users = await connection.model(User.name).syncIndexes();
  return report;
}
