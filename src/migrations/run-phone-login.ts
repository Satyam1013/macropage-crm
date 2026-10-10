/* eslint-disable no-console */
/**
 * `npm run migrate:phone-login` (dry run) / `npm run migrate:phone-login -- --apply`.
 * See migratePhoneLogin for what it does.
 */
import 'reflect-metadata';
// Don't let this one-off process drain the WhatsApp outbox.
process.env.WHATSAPP_POLL_MS = '0';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { AppModule } from '../app.module';
import { migratePhoneLogin, PHONE_BACKUP_COLLECTION } from './phone-login.migration';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const report = await migratePhoneLogin(app.get<Connection>(getConnectionToken()), { apply });
    const by = (reason: string) => report.changes.filter((c) => c.reason === reason);
    console.log(apply ? 'Applied.' : 'Dry run (pass --apply to write).');
    console.log(`  normalized: ${by('normalized').length}`);
    console.log(`  empty → null: ${by('empty').length}`);
    for (const reason of ['invalid', 'duplicate']) {
      const rows = by(reason);
      console.log(`  ${reason} → cleared: ${rows.length}`);
      for (const c of rows) {
        console.log(
          `    ${c.id} ${c.name}: ${JSON.stringify(c.from)}` +
            (c.keptBy ? ` (number kept by ${c.keptBy})` : ''),
        );
      }
    }
    if (apply) {
      console.log(`  originals backed up to "${PHONE_BACKUP_COLLECTION}"`);
      console.log(`  dropped indexes: ${JSON.stringify(report.droppedIndexes)}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
