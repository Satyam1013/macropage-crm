import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession } from 'mongoose';
import {
  paginated,
  PaginatedResult,
  PaginationQueryDto,
  skipFor,
} from '../common/dto/pagination.dto';
import type { SoftDeleteModel } from '../common/plugins/soft-delete.plugin';
import { containsAny } from '../common/utils/regex.util';
import { Project } from '../projects/schemas/project.schema';
import { User } from '../users/schemas/user.schema';
import { CustomerResponse, toCustomerResponse } from './customer.mapper';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { Customer, CustomerDocument } from './schemas/customer.schema';

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(Customer.name) private readonly customerModel: SoftDeleteModel<Customer>,
    @InjectModel(Project.name) private readonly projectModel: SoftDeleteModel<Project>,
    @InjectModel(User.name) private readonly userModel: SoftDeleteModel<User>,
  ) {}

  async list(query: PaginationQueryDto): Promise<PaginatedResult<CustomerResponse>> {
    const filter = containsAny(['name', 'contactName', 'email', 'phone'], query.search) ?? {};
    const [rows, total] = await Promise.all([
      this.customerModel
        .find(filter)
        .sort({ name: 1 })
        .skip(skipFor(query))
        .limit(query.limit)
        .lean(),
      this.customerModel.countDocuments(filter),
    ]);
    return paginated(rows.map(toCustomerResponse), total, query);
  }

  async get(id: string): Promise<CustomerResponse> {
    const customer = await this.customerModel.findById(id).lean();
    if (!customer) throw new NotFoundException('Customer not found');
    return toCustomerResponse(customer);
  }

  async create(dto: CreateCustomerDto, session?: ClientSession): Promise<CustomerDocument> {
    const [created] = await this.customerModel.create([dto], { session });
    return created;
  }

  async createAndMap(dto: CreateCustomerDto): Promise<CustomerResponse> {
    return toCustomerResponse(await this.create(dto));
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<CustomerResponse> {
    const updated = await this.customerModel
      .findOneAndUpdate({ _id: id }, { $set: dto }, { new: true, runValidators: true })
      .lean();
    if (!updated) throw new NotFoundException('Customer not found');
    return toCustomerResponse(updated);
  }

  /** Soft delete; refused while projects reference the customer. Linked logins are disabled. */
  async remove(id: string): Promise<{ id: string; deleted: true }> {
    const customer = await this.customerModel.findById(id).lean();
    if (!customer) throw new NotFoundException('Customer not found');
    const projects = await this.projectModel.countDocuments({ customerId: id });
    if (projects > 0) {
      throw new ConflictException(`Customer has ${projects} project(s) and cannot be deleted`);
    }
    await this.customerModel.softDelete(id);
    await this.userModel.updateMany(
      { customerId: id },
      { $set: { isActive: false, refreshTokenHash: null } },
    );
    return { id, deleted: true };
  }
}
