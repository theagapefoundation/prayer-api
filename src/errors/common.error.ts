import { HttpException, HttpStatus } from '@nestjs/common';

export class BaseError extends HttpException {
  code?: string;

  constructor(
    response: string | Record<string, any>,
    status: number,
    code?: string,
  ) {
    super(response, status);
    this.code = code;
  }
}

export class TargetNotFoundError extends BaseError {
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST, 'target-not-found');
  }
}

export class UsernameDuplicatedError extends BaseError {
  constructor() {
    super(
      'Username has already taken',
      HttpStatus.BAD_REQUEST,
      'username-already-exists',
    );
  }
}

export class FollowMyselfError extends BaseError {
  constructor() {
    super('You cannot follow you', HttpStatus.BAD_REQUEST, 'invalid-uid');
  }
}

export class OperationNotAllowedError extends BaseError {
  constructor(message: string) {
    super(message, HttpStatus.FORBIDDEN, 'operation-not-allowed');
  }
}

export class PrivateGroupError extends BaseError {
  constructor(message: string) {
    super(message, HttpStatus.FORBIDDEN, 'insufficient-permission');
  }
}

export class BadRequestError extends BaseError {
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST, 'invalid-parameters');
  }
}

export class NotEmptyResource extends BaseError {
  constructor() {
    super(
      'User must delete all groups, leave all groups, and have no corporate prayers',
      HttpStatus.BAD_REQUEST,
      'not-empty-resource',
    );
  }
}

export class TooManyPray extends BaseError {
  constructor() {
    super(
      'You must wait to pray silently',
      HttpStatus.BAD_REQUEST,
      'too-many-pray',
    );
  }
}
