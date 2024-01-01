import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
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

  @IsNumber()
  @IsNotEmpty()
  banner: number;
}

export class UpdateGroupDto {
  @IsOptional()
  @MaxLength(30)
  name: string;

  @IsOptional()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsNumber()
  banner?: number;
}

export class AcceptRequestGroupDto {
  @IsNotEmpty()
  userId: string;
}

export class InviteUserToGroupDto {
  @IsArray()
  value: string[];
}
