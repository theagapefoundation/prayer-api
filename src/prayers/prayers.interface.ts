import {
  IsBoolean,
  IsJSON,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateCorporatePrayerDto {
  @IsUUID()
  groupId: string;

  @IsNotEmpty()
  title: string;

  @IsOptional()
  description?: string;

  @IsJSON()
  prayers?: string;

  @IsOptional()
  startedAt?: string;

  @IsOptional()
  endedAt?: string;
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
  anon?: boolean;

  @IsNotEmpty()
  value: string;

  @IsOptional()
  media?: string;
}

export class CreatePrayerPrayDto {
  @IsUUID()
  prayerId: string;

  @IsOptional()
  @MaxLength(200)
  value?: string;
}
