import { DateTime } from 'luxon';
import { config } from '../config';

export class SessionFilter {
  /**
   * Check if a timestamp is inside the configured Pakistan sessions.
   * Format of sessions: HH:MM-HH:MM (e.g. "12:00-14:00", "18:00-19:30")
   */
  public static isInPakistanSession(timestamp: number): boolean {
    const tz = config.sessionTimezone;
    const dt = DateTime.fromMillis(timestamp).setZone(tz);
    
    // Check day of week (typically FX/Gold only trade on weekdays, but we check based on time)
    // dt.weekday represents 1 (Monday) to 7 (Sunday)
    
    const minutesSinceMidnight = dt.hour * 60 + dt.minute;

    // Session 1: 12:00 PM to 2:00 PM (12:00 to 14:00 in Karachi timezone)
    // 12:00 is 720 minutes. 14:00 is 840 minutes.
    const s1Start = 12 * 60; // 720
    const s1End = 14 * 60;   // 840

    // Session 2: 6:00 PM to 7:30 PM (18:00 to 19:30 in Karachi timezone)
    // 18:00 is 1080 minutes. 19:30 is 1170 minutes.
    const s2Start = 18 * 60; // 1080
    const s2End = 19.5 * 60; // 1170

    const inS1 = minutesSinceMidnight >= s1Start && minutesSinceMidnight < s1End;
    const inS2 = minutesSinceMidnight >= s2Start && minutesSinceMidnight < s2End;

    return inS1 || inS2;
  }

  /**
   * Check if a session just ended when transitioning from previousTimestamp to currentTimestamp.
   */
  public static didSessionJustEnd(previousTimestamp: number, currentTimestamp: number): boolean {
    return this.isInPakistanSession(previousTimestamp) && !this.isInPakistanSession(currentTimestamp);
  }
}

export default SessionFilter;
