import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { RequestChangesDto } from './dto/request-changes.dto';
import { PortalService } from './portal.service';

@ApiTags('Client portal')
@ApiBearerAuth()
@Roles('CUSTOMER')
@Controller('portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('projects')
  @ApiOperation({ summary: "The signed-in customer's projects" })
  list(@CurrentUser() user: AuthUser) {
    return this.portal.list(user);
  }

  @Get('projects/:id')
  get(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.portal.get(id, user);
  }

  @Post('projects/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve delivery (CLIENT_CONFIRMATION → CLOSED)' })
  approve(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.portal.approve(id, user);
  }

  @Post('projects/:id/request-changes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request changes (CLIENT_CONFIRMATION → CONFIRMATION_TESTING)' })
  requestChanges(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: RequestChangesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.portal.requestChanges(id, dto.note, user);
  }
}
