/* eslint-disable no-console */
/**
 * `npm run migrate:expense-scope` (dry run) / `npm run migrate:expense-scope -- --apply`.
 * See migrateExpenseScope for what it does.
 */
import 'reflect-metadata';
// Don't let this one-off process drain the WhatsApp outbox.
process.env.WHATSAPP_POLL_MS = '0';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { AppModule } from '../app.module';
import { migrateExpenseScope } from './expense-scope.migration';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const report = await migrateExpenseScope(app.get<Connection>(getConnectionToken()), { apply });
    console.log(apply ? 'Applied.' : 'Dry run (pass --apply to write).');
    console.log(`  → PROJECT: ${report.project}`);
    console.log(`  → INTERNAL_PROJECT: ${report.internalProject}`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
