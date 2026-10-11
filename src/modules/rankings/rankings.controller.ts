import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedRequestGuard } from '@common/guards/authenticated-request.guard';
import { ListRankingsQueryDto } from './dto/list-rankings-query.dto';
import { RankingsService } from './rankings.service';

@Controller('rankings')
@UseGuards(AuthenticatedRequestGuard)
export class RankingsController {
  constructor(private readonly rankingsService: RankingsService) {}

  @Get('individual')
  listIndividualRankings(@Query() query: ListRankingsQueryDto) {
    return this.rankingsService.listIndividualRankings(query.limit);
  }

  @Get('teams')
  listTeamRankings(@Query() query: ListRankingsQueryDto) {
    return this.rankingsService.listTeamRankings(query.limit);
  }
}
