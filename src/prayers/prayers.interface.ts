import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateOrUpdateCorporatePrayerDto {
  @IsOptional()
  @IsUUID()
  corporateId?: string;

  @IsUUID()
  groupId: string;

  @IsNotEmpty()
  title: string;

  @IsOptional()
  description?: string;

  @IsArray()
  @ArrayMaxSize(10)
  @ArrayMinSize(1)
  prayers: string[];

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  endedAt?: string;

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

export class CreatePrayerDto {
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsUUID()
  corporateId?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  anon?: boolean;

  @IsNotEmpty()
  value: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @ArrayMaxSize(5)
  contents?: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @ArrayMaxSize(5)
  verses?: number[];
}

export class CreatePrayerPrayDto {
  @IsUUID()
  prayerId: string;

  @IsOptional()
  @MaxLength(200)
  value?: string;
}
