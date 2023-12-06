import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(30)
  name?: string;

  @IsOptional()
  @Matches(/^[a-zA-Z0-9._]{1,30}$/)
  @IsNotEmpty()
  username?: string;

  @IsOptional()
  @MaxLength(200)
  bio?: string;

  @IsNumber()
  @IsOptional()
  profile?: number;

  @IsNumber()
  @IsOptional()
  banner?: number;
}

export class CreateFcmDto {
  @IsNotEmpty()
  value: string;
}

export class FollowUserDto {
  @IsBoolean()
  value: boolean;
}

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MaxLength(30)
  name: string;

  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9._]{1,30}$/)
  username: string;

  @IsOptional()
  @MaxLength(200)
  bio?: string;
}
