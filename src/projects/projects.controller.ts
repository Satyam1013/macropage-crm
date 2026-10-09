import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ExpensesService } from '../expenses/expenses.service';
import { PaymentsService } from '../payments/payments.service';
import {
  ListProjectsQueryDto,
  SetTeamDto,
  UpdateProgressDto,
  UpdateProjectDto,
  UpdateProjectStageDto,
} from './dto/project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly paymentsService: PaymentsService,
    private readonly expensesService: ExpensesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Full project list for the board (no pagination)' })
  list(@Query() query: ListProjectsQueryDto) {
    return this.projects.list(query);
  }

  @Get(':id')
  detail(@Param('id', ParseObjectIdPipe) id: string) {
    return this.projects.detail(id);
  }

  @Patch(':id')
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(id, dto);
  }

  @Patch(':id/stage')
  @ApiOperation({ summary: 'Move to any stage; CLOSED requires client approval' })
  changeStage(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateProjectStageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projects.changeStage(id, dto.stage, user);
  }

  @Patch(':id/progress')
  @ApiOperation({ summary: 'Update IN_PROGRESS dev tracks (each clamped to 0–100)' })
  updateProgress(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateProgressDto) {
    return this.projects.updateProgress(id, dto);
  }

  @Put(':id/team')
  setTeam(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: SetTeamDto) {
    return this.projects.setTeam(id, dto.staffIds);
  }

  @Post(':id/record-client-approval')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record an offline client approval (CLIENT_CONFIRMATION → CLOSED)' })
  async recordClientApproval(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.projects.approve(id, user);
    return this.projects.detail(id);
  }

  @Get(':id/payments')
  listPayments(@Param('id', ParseObjectIdPipe) id: string) {
    return this.paymentsService.listForProject(id);
  }

  @Get(':id/expenses')
  listExpenses(@Param('id', ParseObjectIdPipe) id: string) {
    return this.expensesService.listForProject(id);
  }
}
