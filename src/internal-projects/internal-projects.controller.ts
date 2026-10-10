import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ExpensesService } from '../expenses/expenses.service';
import {
  CreateInternalProjectDto,
  ListInternalProjectsQueryDto,
  UpdateInternalProjectDto,
} from './dto/internal-project.dto';
import { InternalProjectsService } from './internal-projects.service';

/** Internal only (ADMIN by default); never exposed under /portal. */
@ApiTags('Internal projects')
@ApiBearerAuth()
@Controller('internal-projects')
export class InternalProjectsController {
  constructor(
    private readonly internalProjects: InternalProjectsService,
    private readonly expenses: ExpensesService,
  ) {}

  @Get()
  list(@Query() query: ListInternalProjectsQueryDto) {
    return this.internalProjects.list(query);
  }

  @Post()
  create(@Body() dto: CreateInternalProjectDto) {
    return this.internalProjects.create(dto);
  }

  @Get(':id')
  get(@Param('id', ParseObjectIdPipe) id: string) {
    return this.internalProjects.get(id);
  }

  @Patch(':id')
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateInternalProjectDto) {
    return this.internalProjects.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete the project and its expenses' })
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.internalProjects.remove(id);
  }

  @Get(':id/expenses')
  @ApiOperation({ summary: "The project's expenses (full list)" })
  listExpenses(@Param('id', ParseObjectIdPipe) id: string) {
    return this.expenses.listForInternalProject(id);
  }
}
