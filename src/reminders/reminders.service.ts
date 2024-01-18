import { Injectable } from '@nestjs/common';
import { BaseReminderDto } from './reminders.interface';
import { BadRequestError } from 'src/errors/common.error';

@Injectable()
export class RemindersService {
  minutesToString(minutes: number) {
    // Determine the sign
    const sign = minutes >= 0 ? '+' : '-';

    // Absolute value to handle negative minutes
    const absMinutes = Math.abs(minutes);

    // Calculate hours and minutes
    const hours = Math.floor(absMinutes / 60);
    const mins = absMinutes % 60;

    // Format hours and minutes with leading zeros if necessary
    const formattedHours = hours.toString().padStart(2, '0');
    const formattedMinutes = mins.toString().padStart(2, '0');

    // Return the formatted string
    return `${sign}${formattedHours}:${formattedMinutes}`;
  }

  validateParams(params: BaseReminderDto) {
    if (
      !!params.reminderTime != !!params.reminderText ||
      !!params.reminderText != !!params.reminderDays
    ) {
      throw new BadRequestError(
        `'reminderTime', 'reminderText', 'reminderDays' must be provided`,
      );
    }
  }

  buildDataForDb(
    params: BaseReminderDto | null | undefined,
    timezone?: number | null,
  ) {
    if (
      params == null ||
      timezone == null ||
      params.reminderDays == null ||
      params.reminderText == null ||
      params.reminderTime == null
    ) {
      return null;
    }
    return {
      days: JSON.stringify(params.reminderDays),
      time: params.reminderTime! + this.minutesToString(timezone!),
      value: params.reminderText!,
    };
  }
}
