import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { FilterQuery } from 'mongoose';
import { paginated, PaginatedResult, skipFor } from '../common/dto/pagination.dto';
import type { SoftDeleteModel } from '../common/plugins/soft-delete.plugin';
import { parseDateOnly } from '../common/utils/date.util';
import { dateRange } from '../common/utils/date-range.util';
import { idOf } from '../common/utils/object-id.util';
import { containsAny } from '../common/utils/regex.util';
import { Project } from '../projects/schemas/project.schema';
import { CreatePaymentDto, ListPaymentsQueryDto, UpdatePaymentDto } from './dto/payment.dto';
import { PaymentResponse, toPaymentResponse } from './payment.mapper';
import { Payment } from './schemas/payment.schema';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name) private readonly paymentModel: SoftDeleteModel<Payment>,
    @InjectModel(Project.name) private readonly projectModel: SoftDeleteModel<Project>,
  ) {}

  async list(query: ListPaymentsQueryDto): Promise<PaginatedResult<PaymentResponse>> {
    const filter: FilterQuery<Payment> = { ...(containsAny(['note', 'mode'], query.search) ?? {}) };
    if (query.projectId) filter.projectId = query.projectId;
    const range = dateRange(query.from, query.to);
    if (range) filter.paidOn = range;
    const [rows, total] = await Promise.all([
      this.paymentModel
        .find(filter)
        .sort({ paidOn: -1, createdAt: -1 })
        .skip(skipFor(query))
        .limit(query.limit)
        .lean(),
      this.paymentModel.countDocuments(filter),
    ]);
    const names = await this.projectNames(rows.map((r) => idOf(r.projectId)));
    return paginated(
      rows.map((r) => toPaymentResponse(r, names.get(idOf(r.projectId)!) ?? null)),
      total,
      query,
    );
  }

  /** Full list for a project's detail page. */
  async listForProject(projectId: string): Promise<PaymentResponse[]> {
    await this.assertProject(projectId);
    const rows = await this.paymentModel
      .find({ projectId })
      .sort({ paidOn: -1, createdAt: -1 })
      .lean();
    return rows.map((r) => toPaymentResponse(r));
  }

  async create(dto: CreatePaymentDto): Promise<PaymentResponse> {
    await this.assertProject(dto.projectId, BadRequestException);
    const created = await this.paymentModel.create({
      projectId: dto.projectId,
      amount: dto.amount,
      paidOn: parseDateOnly(dto.date),
      mode: dto.mode,
      note: dto.note ?? null,
    });
    return toPaymentResponse(created.toObject());
  }

  async update(id: string, dto: UpdatePaymentDto): Promise<PaymentResponse> {
    const set: Record<string, unknown> = {};
    if (dto.amount !== undefined) set.amount = dto.amount;
    if (dto.date !== undefined) set.paidOn = parseDateOnly(dto.date);
    if (dto.mode !== undefined) set.mode = dto.mode;
    if (dto.note !== undefined) set.note = dto.note;
    const updated = await this.paymentModel
      .findOneAndUpdate({ _id: id }, { $set: set }, { new: true, runValidators: true })
      .lean();
    if (!updated) throw new NotFoundException('Payment not found');
    return toPaymentResponse(updated);
  }

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    const deleted = await this.paymentModel.softDelete(id);
    if (!deleted) throw new NotFoundException('Payment not found');
    return { id, deleted: true };
  }

  private async assertProject(
    projectId: string,
    Err: typeof NotFoundException | typeof BadRequestException = NotFoundException,
  ): Promise<void> {
    if (!(await this.projectModel.exists({ _id: projectId }))) {
      throw new Err('Project not found');
    }
  }

  private async projectNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (!unique.length) return new Map();
    const projects = await this.projectModel
      .find({ _id: { $in: unique } })
      .select('name')
      .setOptions({ withDeleted: true })
      .lean();
    return new Map(projects.map((p) => [p._id.toHexString(), p.name]));
  }
}
