import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { BaseReminderDto } from 'src/reminders/reminders.interface';

export class CreateGroupDto extends BaseReminderDto {
  @IsNotEmpty()
  @MaxLength(30)
  name: string;

  @IsNotEmpty()
  @MaxLength(300)
  description: string;

  @IsIn(['open', 'private', 'restricted'])
  membershipType: 'open' | 'private' | 'restricted';

  @IsNumber()
  @IsNotEmpty()
  banner: number;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  @ArrayMaxSize(10)
  rules: any[];

  @IsOptional()
  @IsNotEmpty()
  @MaxLength(300)
  welcomeTitle?: string;

  @IsOptional()
  @IsNotEmpty()
  @MaxLength(300)
  welcomeMessage?: string;
}

export class UpdateGroupDto extends BaseReminderDto {
  @IsOptional()
  @MaxLength(30)
  name: string;

  @IsOptional()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsNumber()
  banner?: number;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  @ArrayMaxSize(10)
  rules: any[];

  @IsOptional()
  @IsNotEmpty()
  @MaxLength(300)
  welcomeTitle?: string;

  @IsOptional()
  @IsNotEmpty()
  @MaxLength(300)
  welcomeMessage?: string;
}

export class AcceptRequestGroupDto {
  @IsNotEmpty()
  userId: string;
}

export class InviteUserToGroupDto {
  @IsArray()
  value: string[];
}
