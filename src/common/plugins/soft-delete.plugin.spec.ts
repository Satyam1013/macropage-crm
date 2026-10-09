import mongoose, { Connection, Schema } from 'mongoose';
import { testMongoUri } from '../../../test/utils/mongo-uri';
import { softDeletePlugin, SoftDeleteModel } from './soft-delete.plugin';
import { toJsonPlugin } from './to-json.plugin';

interface Widget {
  name: string;
  qty: number;
  deletedAt?: Date | null;
}

describe('softDeletePlugin', () => {
  let conn: Connection;
  let Widget: SoftDeleteModel<Widget>;

  beforeAll(async () => {
    conn = await mongoose.createConnection(testMongoUri('softdelete')).asPromise();
    const schema = new Schema<Widget>({ name: String, qty: Number }, { timestamps: true });
    schema.plugin(softDeletePlugin);
    schema.plugin(toJsonPlugin);
    Widget = conn.model<Widget>('Widget', schema) as SoftDeleteModel<Widget>;
    await Widget.init();
  });

  afterAll(async () => {
    await conn.dropDatabase();
    await conn.close();
  });

  let liveId: string;
  let deletedId: string;

  beforeEach(async () => {
    await Widget.collection.deleteMany({});
    const [live, gone] = await Widget.create([
      { name: 'live', qty: 1 },
      { name: 'gone', qty: 2 },
    ]);
    liveId = live.id as string;
    deletedId = gone.id as string;
    await Widget.softDelete(deletedId);
  });

  it('adds deletedAt (null by default) and sets it on softDelete', async () => {
    const raw = await Widget.collection.find({}).toArray();
    expect(raw).toHaveLength(2);
    expect(raw.find((d) => d.name === 'live')!.deletedAt).toBeNull();
    expect(raw.find((d) => d.name === 'gone')!.deletedAt).toBeInstanceOf(Date);
  });

  it('excludes soft-deleted docs from find / findOne / findById / countDocuments', async () => {
    expect((await Widget.find()).map((w) => w.name)).toEqual(['live']);
    expect(await Widget.findOne({ name: 'gone' })).toBeNull();
    expect(await Widget.findById(deletedId)).toBeNull();
    expect(await Widget.countDocuments()).toBe(1);
  });

  it('includes them with { withDeleted: true }', async () => {
    expect(await Widget.find().setOptions({ withDeleted: true })).toHaveLength(2);
    expect(await Widget.findById(deletedId).setOptions({ withDeleted: true })).not.toBeNull();
    expect(await Widget.countDocuments({}, { withDeleted: true } as never)).toBe(2);
  });

  it('does not let findOneAndUpdate / updateOne touch soft-deleted docs', async () => {
    expect(
      await Widget.findOneAndUpdate({ _id: deletedId }, { qty: 99 }, { new: true }),
    ).toBeNull();
    const res = await Widget.updateOne({ _id: deletedId }, { qty: 99 });
    expect(res.matchedCount).toBe(0);
    const raw = await Widget.collection.findOne({ name: 'gone' });
    expect(raw!.qty).toBe(2);
  });

  it('injects the filter into aggregate pipelines (unless withDeleted)', async () => {
    const totals = await Widget.aggregate<{ total: number }>([
      { $group: { _id: null, total: { $sum: '$qty' } } },
    ]);
    expect(totals[0].total).toBe(1);
    const all = await Widget.aggregate<{ total: number }>([
      { $group: { _id: null, total: { $sum: '$qty' } } },
    ]).option({
      withDeleted: true,
    } as never);
    expect(all[0].total).toBe(3);
  });

  it('respects an explicit deletedAt filter', async () => {
    const trash = await Widget.find({ deletedAt: { $ne: null } });
    expect(trash.map((w) => w.name)).toEqual(['gone']);
  });

  it('softDelete is a no-op on already deleted docs; restore brings docs back', async () => {
    expect(await Widget.softDelete(deletedId)).toBeNull();
    const restored = await Widget.restore(deletedId);
    expect(restored?.deletedAt).toBeNull();
    expect(await Widget.countDocuments()).toBe(2);
    expect(await Widget.restore(liveId)).toBeNull();
  });

  it('toJSON exposes id and hides _id/__v/deletedAt', async () => {
    const json = (await Widget.findById(liveId))!.toJSON() as unknown as Record<string, unknown>;
    expect(json.id).toBe(liveId);
    expect(json).not.toHaveProperty('_id');
    expect(json).not.toHaveProperty('__v');
    expect(json).not.toHaveProperty('deletedAt');
  });
});
