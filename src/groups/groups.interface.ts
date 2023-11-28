import {
  IsBoolean,
  IsBooleanString,
  IsIn,
  IsJSON,
  IsNotEmpty,
  IsOptional,
  MaxLength,
} from 'class-validator';

export class CreateGroupDto {
  @IsNotEmpty()
  @MaxLength(30)
  name: string;

  @IsNotEmpty()
  @MaxLength(300)
  description: string;

  @IsIn(['open', 'private', 'restricted'])
  membershipType: 'open' | 'private' | 'restricted';

  @IsNotEmpty()
  banner: string;
}

export class UpdateGroupDto {
  @IsOptional()
  @MaxLength(30)
  name: string;

  @IsOptional()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  banner?: string;
}

export class JoinGroupDto {
  @IsBooleanString()
  value: string;
}

export class AcceptRequestGroupDto {
  @IsNotEmpty()
  userId: string;

  @IsBoolean()
  value: boolean;
}

export class InviteUserToGroupDto {
  @IsJSON()
  value: string;
}
