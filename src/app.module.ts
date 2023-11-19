import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GroupsModule } from './groups/groups.module';
import { UploadsModule } from './uploads/uploads.module';
import { APP_GUARD } from '@nestjs/core';
import { UserGuard } from './auth/user.guard';
import { PrayersModule } from './prayers/prayers.module';
import { FirebaseModule } from './firebase/firebase.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    AuthModule,
    UsersModule,
    GroupsModule,
    UploadsModule,
    PrayersModule,
    FirebaseModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: UserGuard }],
})
export class AppModule {}
