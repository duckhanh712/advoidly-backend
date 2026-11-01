import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CorrelationId, CurrentUser, PaginatedResult, Roles } from '@app/common';
import { AuthenticatedUser, UserRole } from '@app/contracts';
import {
  ApproveReportDto,
  ListCasesQueryDto,
  ModerationCaseDto,
  RejectReportDto,
  RequestInfoDto,
} from './dto/moderation.dto';
import { ModerationService } from './moderation.service';

@ApiTags('moderation')
@Roles(UserRole.MODERATOR, UserRole.ADMIN)
@Controller('moderation/reports')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get()
  @ApiOperation({ summary: 'Review queue (oldest first)' })
  @ApiOkResponse({ type: [ModerationCaseDto] })
  list(@Query() query: ListCasesQueryDto): Promise<PaginatedResult<ModerationCaseDto>> {
    return this.moderation.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ModerationCaseDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ModerationCaseDto> {
    return this.moderation.get(id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve: the incident becomes VERIFIED and incident.verified is published',
  })
  @ApiOkResponse({ type: ModerationCaseDto })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveReportDto,
    @CurrentUser() moderator: AuthenticatedUser,
    @CorrelationId() correlationId: string,
  ): Promise<ModerationCaseDto> {
    return this.moderation.approve(id, moderator, dto, correlationId);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject with a mandatory reason: the incident becomes REJECTED' })
  @ApiOkResponse({ type: ModerationCaseDto })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectReportDto,
    @CurrentUser() moderator: AuthenticatedUser,
    @CorrelationId() correlationId: string,
  ): Promise<ModerationCaseDto> {
    return this.moderation.reject(id, moderator, dto, correlationId);
  }

  @Post(':id/request-info')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ask the reporter for more information (notifies the reporter)' })
  @ApiOkResponse({ type: ModerationCaseDto })
  requestInfo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestInfoDto,
    @CurrentUser() moderator: AuthenticatedUser,
    @CorrelationId() correlationId: string,
  ): Promise<ModerationCaseDto> {
    return this.moderation.requestInfo(id, moderator, dto, correlationId);
  }
}
