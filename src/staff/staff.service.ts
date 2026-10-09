import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, FilterQuery } from 'mongoose';
import { paginated, PaginatedResult, skipFor } from '../common/dto/pagination.dto';
import type { SoftDeleteModel } from '../common/plugins/soft-delete.plugin';
import { containsAny } from '../common/utils/regex.util';
import { CreateStaffDto, ListStaffQueryDto, UpdateStaffDto } from './dto/staff.dto';
import { Staff } from './schemas/staff.schema';
import { StaffResponse, toStaffResponse } from './staff.mapper';

@Injectable()
export class StaffService {
  constructor(@InjectModel(Staff.name) private readonly staffModel: SoftDeleteModel<Staff>) {}

  async list(query: ListStaffQueryDto): Promise<PaginatedResult<StaffResponse>> {
    const filter: FilterQuery<Staff> = {
      ...(containsAny(['name', 'role', 'email'], query.search) ?? {}),
    };
    if (query.type) filter.type = query.type;
    if (query.isActive !== undefined) filter.isActive = query.isActive;
    const [rows, total] = await Promise.all([
      this.staffModel.find(filter).sort({ name: 1 }).skip(skipFor(query)).limit(query.limit).lean(),
      this.staffModel.countDocuments(filter),
    ]);
    return paginated(rows.map(toStaffResponse), total, query);
  }

  async get(id: string): Promise<StaffResponse> {
    const staff = await this.staffModel.findById(id).lean();
    if (!staff) throw new NotFoundException('Staff member not found');
    return toStaffResponse(staff);
  }

  async create(dto: CreateStaffDto): Promise<StaffResponse> {
    const created = await this.staffModel.create({ ...dto, isActive: dto.isActive ?? true });
    return toStaffResponse(created.toObject());
  }

  async update(id: string, dto: UpdateStaffDto): Promise<StaffResponse> {
    const updated = await this.staffModel
      .findOneAndUpdate({ _id: id }, { $set: dto }, { new: true, runValidators: true })
      .lean();
    if (!updated) throw new NotFoundException('Staff member not found');
    return toStaffResponse(updated);
  }

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    const deleted = await this.staffModel.softDelete(id);
    if (!deleted) throw new NotFoundException('Staff member not found');
    return { id, deleted: true };
  }

  /** Lean lookup by ids; `withDeleted` keeps historical team members visible. */
  findByIds(ids: string[], opts: { withDeleted?: boolean } = {}): Promise<Staff[]> {
    return this.staffModel
      .find({ _id: { $in: ids } })
      .setOptions({ withDeleted: !!opts.withDeleted })
      .lean()
      .exec();
  }

  /** Ensures every id references a live staff member; returns them in the given order. */
  async assertExist(ids: string[], session?: ClientSession, label = 'staffIds'): Promise<Staff[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const found = await this.staffModel
      .find({ _id: { $in: unique } })
      .session(session ?? null)
      .lean();
    if (found.length !== unique.length) {
      const foundIds = new Set(found.map((s) => s._id.toHexString()));
      const missing = unique.filter((id) => !foundIds.has(id));
      throw new BadRequestException(`${label} contains unknown staff: ${missing.join(', ')}`);
    }
    return found;
  }
}
