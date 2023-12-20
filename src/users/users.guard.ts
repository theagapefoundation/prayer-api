import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { UserEntity } from 'src/auth/auth.decorator';
import { KyselyService } from 'src/kysely/kysely.service';

@Injectable()
export class MustUnbanned implements CanActivate {
  constructor(private readonly dbService: KyselyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request['user'] as UserEntity | null | undefined;
    if (user == null) {
      return false;
    }
    const banned = await this.dbService
      .selectFrom('user_bans')
      .where('user_bans.user_id', '=', user.sub)
      .select(['user_bans.created_at'])
      .executeTakeFirst();
    return banned == null;
  }
}
