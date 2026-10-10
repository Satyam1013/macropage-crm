import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { CreateWorkLogsDto, ListWorkLogsQueryDto, UpdateWorkLogDto } from './dto/work-log.dto';
import { WorkLogsService } from './work-logs.service';

/** Internal only (ADMIN by default); never exposed under /portal. */
@ApiTags('Work logs')
@ApiBearerAuth()
@Controller()
export class WorkLogsController {
  constructor(private readonly workLogs: WorkLogsService) {}

  @Post('projects/:projectId/work-logs')
  @ApiOperation({ summary: 'Log work for one team member: one row per (scope, type) item' })
  create(@Param('projectId', ParseObjectIdPipe) projectId: string, @Body() dto: CreateWorkLogsDto) {
    return this.workLogs.createForProject(projectId, dto);
  }

  @Get('projects/:projectId/work-logs')
  @ApiOperation({ summary: "The project's PROJECT logs plus its lead's LEAD logs" })
  listForProject(@Param('projectId', ParseObjectIdPipe) projectId: string) {
    return this.workLogs.listForProject(projectId);
  }

  @Get('work-logs')
  list(@Query() query: ListWorkLogsQueryDto) {
    return this.workLogs.list(query);
  }

  @Patch('work-logs/:id')
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateWorkLogDto) {
    return this.workLogs.update(id, dto);
  }

  @Delete('work-logs/:id')
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.workLogs.remove(id);
  }
}
