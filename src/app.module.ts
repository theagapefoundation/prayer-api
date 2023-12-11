import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GroupsModule } from './groups/groups.module';
import { UploadsModule } from './uploads/uploads.module';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { UserGuard } from './auth/user.guard';
import { PrayersModule } from './prayers/prayers.module';
import { FirebaseModule } from './firebase/firebase.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BiblesModule } from './bibles/bibles.module';
import { HttpExceptionFilter } from './exception.filter';
import { RavenInterceptor, RavenModule } from 'nest-raven';

@Module({
  imports: [
    ConfigModule.forRoot(),
    AuthModule,
    UsersModule,
    GroupsModule,
    UploadsModule,
    PrayersModule,
    FirebaseModule,
    NotificationsModule,
    BiblesModule,
    RavenModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: UserGuard },
    { provide: APP_INTERCEPTOR, useFactory: () => new RavenInterceptor() },
    { provide: APP_FILTER, useFactory: () => new HttpExceptionFilter() },
  ],
})
export class AppModule {}
