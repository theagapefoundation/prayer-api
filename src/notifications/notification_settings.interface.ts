import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

export class CreateGroupNotificationSettingsDto {
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  onModeratorPost: boolean;

  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  onMemberPost: boolean;
}

export class CreateCorporateNotificationSettingsDto {
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  onReminder: boolean;

  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  onMemberPost: boolean;
}
