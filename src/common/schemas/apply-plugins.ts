import type { Schema } from 'mongoose';
import { softDeletePlugin } from '../plugins/soft-delete.plugin';
import { toJsonPlugin, ToJsonPluginOptions } from '../plugins/to-json.plugin';

/** Applies the conventions every collection shares: soft delete + `toJSON` transform. */
export function applyCommonPlugins(schema: Schema, options: ToJsonPluginOptions = {}): void {
  schema.plugin(softDeletePlugin);
  schema.plugin(toJsonPlugin, options);
}
