import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class BaseReminderDto {
  @IsOptional()
  @Matches(/^([0-1]?[0-9]|2[0-3]):([0-5]?[0-9]):([0-5]?[0-9])$/)
  reminderTime?: string;

  @IsOptional()
  reminderText?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  @ArrayMaxSize(7)
  reminderDays?: number[];
}
