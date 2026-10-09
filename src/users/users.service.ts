import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import type { ClientSession, FilterQuery } from 'mongoose';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { paginated, PaginatedResult, skipFor } from '../common/dto/pagination.dto';
import type { SoftDeleteModel } from '../common/plugins/soft-delete.plugin';
import { idOf } from '../common/utils/object-id.util';
import { generateTemporaryPassword } from '../common/utils/password.util';
import { containsAny } from '../common/utils/regex.util';
import { Customer } from '../customers/schemas/customer.schema';
import { CreateUserDto, ListUsersQueryDto, ResetPasswordDto, UpdateUserDto } from './dto/user.dto';
import { User, UserDocument } from './schemas/user.schema';
import { toUserResponse, UserResponse } from './user.mapper';

export const BCRYPT_ROUNDS = 10;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: SoftDeleteModel<User>,
    @InjectModel(Customer.name) private readonly customerModel: SoftDeleteModel<Customer>,
  ) {}

  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  /** Includes the secret fields; for the auth flow only. */
  findByEmailWithSecrets(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.trim().toLowerCase() })
      .select('+passwordHash +refreshTokenHash')
      .exec();
  }

  findByIdWithSecrets(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).select('+passwordHash +refreshTokenHash').exec();
  }

  findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async emailExists(email: string, session?: ClientSession): Promise<boolean> {
    // Soft-deleted users still hold the unique email index entry.
    const count = await this.userModel
      .countDocuments({ email: email.trim().toLowerCase() })
      .setOptions({ withDeleted: true })
      .session(session ?? null);
    return count > 0;
  }

  async setRefreshTokenHash(id: string, hash: string | null): Promise<void> {
    await this.userModel.updateOne({ _id: id }, { $set: { refreshTokenHash: hash } });
  }

  async setPassword(id: string, password: string): Promise<void> {
    const passwordHash = await this.hashPassword(password);
    await this.userModel.updateOne({ _id: id }, { $set: { passwordHash, refreshTokenHash: null } });
  }

  async customerName(customerId: unknown): Promise<string | null> {
    const id = idOf(customerId as string);
    if (!id) return null;
    const customer = await this.customerModel.findById(id).select('name').lean();
    return customer?.name ?? null;
  }

  async list(query: ListUsersQueryDto): Promise<PaginatedResult<UserResponse>> {
    const filter: FilterQuery<User> = { ...(containsAny(['name', 'email'], query.search) ?? {}) };
    if (query.role) filter.role = query.role;
    const [rows, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skipFor(query))
        .limit(query.limit)
        .lean(),
      this.userModel.countDocuments(filter),
    ]);
    const customerIds = [...new Set(rows.map((u) => idOf(u.customerId)).filter(Boolean))];
    const customers = await this.customerModel
      .find({ _id: { $in: customerIds } })
      .select('name')
      .setOptions({ withDeleted: true })
      .lean();
    const names = new Map(customers.map((c) => [idOf(c._id), c.name]));
    return paginated(
      rows.map((u) => toUserResponse(u, names.get(idOf(u.customerId)) ?? null)),
      total,
      query,
    );
  }

  async get(id: string): Promise<UserResponse> {
    const user = await this.userModel.findById(id).lean();
    if (!user) throw new NotFoundException('User not found');
    return toUserResponse(user, await this.customerName(user.customerId));
  }

  async create(dto: CreateUserDto): Promise<UserResponse & { temporaryPassword?: string }> {
    if (dto.role === 'CUSTOMER') await this.assertCustomerExists(dto.customerId!);
    if (dto.role === 'ADMIN' && dto.customerId) {
      throw new BadRequestException('ADMIN users cannot be linked to a customer');
    }
    if (await this.emailExists(dto.email)) {
      throw new ConflictException('A user with this email already exists');
    }
    const password = dto.password ?? generateTemporaryPassword();
    const created = await this.userModel.create({
      name: dto.name,
      email: dto.email,
      role: dto.role,
      customerId: dto.role === 'CUSTOMER' ? dto.customerId : null,
      isActive: dto.isActive ?? true,
      passwordHash: await this.hashPassword(password),
    });
    this.logger.log(`User created: ${created.email} (${created.role})`);
    const response = await this.get(created.id);
    return dto.password ? response : { ...response, temporaryPassword: password };
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser): Promise<UserResponse> {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (dto.isActive === false && id === actor.id) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    if (dto.customerId !== undefined) {
      if (user.role !== 'CUSTOMER') {
        throw new BadRequestException('Only CUSTOMER users can be linked to a customer');
      }
      await this.assertCustomerExists(dto.customerId);
      user.customerId = dto.customerId as never;
    }
    if (dto.email !== undefined && dto.email.toLowerCase() !== user.email) {
      if (await this.emailExists(dto.email)) {
        throw new ConflictException('A user with this email already exists');
      }
      user.email = dto.email;
    }
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.isActive !== undefined) {
      user.isActive = dto.isActive;
      if (!dto.isActive) user.set('refreshTokenHash', null);
    }
    await user.save();
    return this.get(id);
  }

  async resetPassword(id: string, dto: ResetPasswordDto) {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('User not found');
    const password = dto.password ?? generateTemporaryPassword();
    await this.setPassword(id, password);
    this.logger.log(`Password reset for ${user.email}`);
    return dto.password
      ? { message: 'Password updated' }
      : { message: 'Password reset', temporaryPassword: password };
  }

  /** id → name lookup (includes soft-deleted users) for stage history "by" labels. */
  async namesByIds(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (unique.length === 0) return new Map();
    const users = await this.userModel
      .find({ _id: { $in: unique } })
      .select('name')
      .setOptions({ withDeleted: true })
      .lean();
    return new Map(users.map((u) => [u._id.toHexString(), u.name]));
  }

  /** Creates a CUSTOMER login inside the caller's transaction. */
  async createCustomerLogin(
    data: { name: string; email: string; customerId: string },
    password: string,
    session: ClientSession,
  ): Promise<UserDocument> {
    const [user] = await this.userModel.create(
      [
        {
          name: data.name,
          email: data.email,
          role: 'CUSTOMER',
          customerId: data.customerId,
          isActive: true,
          passwordHash: await this.hashPassword(password),
        },
      ],
      { session },
    );
    return user;
  }

  /** Invite e-mail stub: logs instead of sending. Wire a mail provider here. */
  sendInvite(email: string, customerName: string): void {
    this.logger.log(`[invite stub] Portal invite for ${customerName} sent to ${email}`);
  }

  private async assertCustomerExists(customerId: string): Promise<void> {
    const exists = await this.customerModel.exists({ _id: customerId });
    if (!exists)
      throw new BadRequestException('customerId does not reference an existing customer');
  }
}
