import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import {
  ConvertLeadDto,
  CreateLeadDto,
  ListLeadsQueryDto,
  UpdateLeadDto,
  UpdateLeadStageDto,
} from './dto/lead.dto';
import { LeadsService } from './leads.service';

@ApiTags('Leads')
@ApiBearerAuth()
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @ApiOperation({ summary: 'Full lead list for the Kanban board (no pagination)' })
  list(@Query() query: ListLeadsQueryDto) {
    return this.leads.list(query);
  }

  @Get('stats')
  stats() {
    return this.leads.stats();
  }

  @Post()
  create(@Body() dto: CreateLeadDto, @CurrentUser() user: AuthUser) {
    return this.leads.create(dto, user);
  }

  @Get(':id')
  get(@Param('id', ParseObjectIdPipe) id: string) {
    return this.leads.get(id);
  }

  @Patch(':id')
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateLeadDto) {
    return this.leads.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.leads.remove(id);
  }

  @Patch(':id/stage')
  @ApiOperation({ summary: 'Move a lead between pipeline stages (WON is not allowed here)' })
  changeStage(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateLeadStageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.leads.changeStage(id, dto.stage, user);
  }

  @Post(':id/convert')
  @ApiOperation({ summary: 'Deal won: convert the lead into a project (transactional)' })
  convert(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: ConvertLeadDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.leads.convert(id, dto, user);
  }
}
