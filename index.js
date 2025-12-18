const Discord = require("discord.js");
const express = require("express");

const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID;
const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY;
const JSONBIN_BIN_ID2 = process.env.JSONBIN_BIN_ID2;

const client = new Discord.Client({
  intents: [
    Discord.GatewayIntentBits.Guilds,
    Discord.GatewayIntentBits.GuildMessages,
    Discord.GatewayIntentBits.MessageContent,
    Discord.GatewayIntentBits.GuildMembers,
  ],
});

// Reminder storage
const reminders = new Map();
let reminderCounter = 1;

// Schedules storage
const schedules = new Map();

async function saveReminders() {
  if (!JSONBIN_BIN_ID || !JSONBIN_API_KEY) {
    console.error("JSONBin credentials not configured, cannot save");
    return false;
  }

  try {
    const data = Array.from(reminders.entries()).map(([id, reminder]) => {
      const {
        intervalId,
        preWarningTimeoutId,
        oneTimeTimeoutId,
        ...safeReminder
      } = reminder;
      return {
        id,
        ...safeReminder,
        startDate: reminder.startDate ? reminder.startDate.toISOString() : null,
        endDate: reminder.endDate ? reminder.endDate.toISOString() : null,
      };
    });

    const response = await fetch(
      `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": JSONBIN_API_KEY,
        },
        body: JSON.stringify({ reminders: data, counter: reminderCounter }),
      },
    );

    if (!response.ok) {
      console.error(
        "Failed to save to JSONBin:",
        response.status,
        response.statusText,
      );
      return false;
    }

    console.log(`Saved ${data.length} reminders to JSONBin`);
    return true;
  } catch (error) {
    console.error("Error saving reminders:", error);
    return false;
  }
}

async function loadRemindersFromJsonBin() {
  if (!JSONBIN_BIN_ID || !JSONBIN_API_KEY) {
    console.error("JSONBin credentials not configured");
    return;
  }

  try {
    const response = await fetch(
      `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`,
      {
        headers: {
          "X-Master-Key": JSONBIN_API_KEY,
        },
      },
    );

    if (!response.ok) {
      console.error(
        "Failed to load from JSONBin:",
        response.status,
        response.statusText,
      );
      return;
    }

    const jsonData = await response.json();
    const data = jsonData.record;

    if (data.counter) {
      reminderCounter = data.counter;
    }

    if (data.reminders && Array.isArray(data.reminders)) {
      data.reminders.forEach((savedReminder) => {
        const reminder = {
          ...savedReminder,
          id: parseInt(savedReminder.id) || savedReminder.id,
          intervalMinutes: parseInt(savedReminder.intervalMinutes) || 0,
          preWarningMinutes: savedReminder.preWarningMinutes
            ? parseInt(savedReminder.preWarningMinutes)
            : null,
          timezoneOffset: parseInt(savedReminder.timezoneOffset) || 0,
          startDate: savedReminder.startDate
            ? new Date(savedReminder.startDate)
            : null,
          endDate: savedReminder.endDate
            ? new Date(savedReminder.endDate)
            : null,
          daysOfWeek: savedReminder.daysOfWeek
            ? savedReminder.daysOfWeek.map((d) => parseInt(d))
            : null,
          useSpecificTimes: savedReminder.useSpecificTimes || false,
          specificTimes: savedReminder.specificTimes || null,
          repeatWeeks: savedReminder.repeatWeeks || 1,
          dateRangeMode: savedReminder.dateRangeMode || "none",
          frequencyMode: savedReminder.frequencyMode || "daily",
          intervalId: null,
          preWarningTimeoutId: null,
          oneTimeTimeoutId: null,
        };
        reminders.set(savedReminder.id, reminder);
      });
      console.log(`Loaded ${reminders.size} reminders from JSONBin`);
    } else {
      console.log("No saved reminders found in JSONBin");
    }
  } catch (error) {
    console.error("Error loading reminders from JSONBin:", error);
  }
}

// Schedule functions
async function saveSchedules() {
  if (!JSONBIN_BIN_ID2 || !JSONBIN_API_KEY) {
    console.error(
      "JSONBin BIN_ID2 credentials not configured, cannot save schedules",
    );
    return false;
  }

  try {
    const data = Array.from(schedules.entries()).map(([id, schedule]) => ({
      id,
      ...schedule,
    }));

    const response = await fetch(
      `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID2}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": JSONBIN_API_KEY,
        },
        body: JSON.stringify({ schedules: data }),
      },
    );

    if (!response.ok) {
      console.error(
        "Failed to save schedules to JSONBin:",
        response.status,
        response.statusText,
      );
      return false;
    }

    console.log(`Saved ${data.length} schedules to JSONBin`);
    return true;
  } catch (error) {
    console.error("Error saving schedules:", error);
    return false;
  }
}

async function loadSchedulesFromJsonBin() {
  if (!JSONBIN_BIN_ID2 || !JSONBIN_API_KEY) {
    console.error("JSONBin BIN_ID2 credentials not configured");
    return;
  }

  try {
    const response = await fetch(
      `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID2}/latest`,
      {
        headers: {
          "X-Master-Key": JSONBIN_API_KEY,
        },
      },
    );

    if (!response.ok) {
      console.error(
        "Failed to load schedules from JSONBin:",
        response.status,
        response.statusText,
      );
      return;
    }

    const jsonData = await response.json();
    const data = jsonData.record;

    if (data.schedules && Array.isArray(data.schedules)) {
      data.schedules.forEach((savedSchedule) => {
        schedules.set(savedSchedule.id, {
          title: savedSchedule.title,
          items: savedSchedule.items || [],
          createdAt: savedSchedule.createdAt || Date.now(),
        });
      });
      console.log(`Loaded ${schedules.size} schedules from JSONBin`);
    } else {
      console.log("No saved schedules found in JSONBin");
    }
  } catch (error) {
    console.error("Error loading schedules from JSONBin:", error);
  }
}

function rescheduleAllReminders() {
  console.log("Rescheduling all reminders...");
  reminders.forEach((reminder, id) => {
    // Recalculate nextRun and isActive for each reminder
    // This handles reminders with future start dates that should now be active
    reminder.nextRun = calculateNextRunTime(reminder);
    reminder.isActive = reminder.nextRun !== null;
    scheduleReminder(id, reminder);
  });
  console.log(`Rescheduled ${reminders.size} reminders`);
  // Save updated reminders
  saveReminders();
}

// Helper function to calculate next run time
function calculateNextRunTime(reminder) {
  const now = new Date();
  const timezoneOffset = reminder.timezoneOffset || 0;
  const userNow = new Date(now.getTime() - timezoneOffset * 60 * 1000);
  const daysOfWeek = reminder.daysOfWeek || [];
  const repeatWeeks = reminder.repeatWeeks || 1;
  const hasSpecificDays = daysOfWeek.length > 0;

  // Helper to parse a date (string, Date, or timestamp) in the user's timezone
  const parseDateInUserTimezone = (dateInput) => {
    if (!dateInput) return null;

    let dateObj;
    if (typeof dateInput === "string") {
      // Parse the date string as midnight in user's timezone
      // dateStr is like "2025-12-17"
      const [year, month, day] = dateInput.split("-").map(Number);
      // Create date at midnight in user's timezone, then convert to server time
      const userMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      // Add timezone offset to get server time equivalent
      return new Date(userMidnight.getTime() + timezoneOffset * 60 * 1000);
    } else if (dateInput instanceof Date) {
      dateObj = dateInput;
    } else if (typeof dateInput === "number") {
      dateObj = new Date(dateInput);
    } else {
      return null;
    }

    // For Date objects or timestamps, convert to user's timezone midnight, then back to server time
    const dateInUserTz = new Date(
      dateObj.getTime() - timezoneOffset * 60 * 1000,
    );
    dateInUserTz.setUTCHours(0, 0, 0, 0);
    return new Date(dateInUserTz.getTime() + timezoneOffset * 60 * 1000);
  };

  // Helper to check if a candidate time is valid given date range (including start date)
  const isValidNextRun = (candidateTimestamp) => {
    const candidateDate = new Date(candidateTimestamp);
    const candidateInUserTz = new Date(
      candidateTimestamp - timezoneOffset * 60 * 1000,
    );

    // Check start date constraint - compare in user's timezone
    if (
      reminder.dateRangeMode === "start" ||
      reminder.dateRangeMode === "range"
    ) {
      if (reminder.startDate) {
        const startDateInServerTime = parseDateInUserTimezone(
          reminder.startDate,
        );
        if (startDateInServerTime && candidateDate < startDateInServerTime) {
          return false; // Before start date
        }
      }
    }

    // Check dateRangeMode restrictions
    if (reminder.dateRangeMode === "today") {
      const userToday = new Date(userNow);
      userToday.setUTCHours(0, 0, 0, 0);
      const userTomorrow = new Date(userToday);
      userTomorrow.setUTCDate(userTomorrow.getUTCDate() + 1);

      const candidateDay = new Date(candidateInUserTz);
      candidateDay.setUTCHours(0, 0, 0, 0);

      if (candidateDay.getTime() >= userTomorrow.getTime()) {
        return false; // Can't schedule for tomorrow in "today only" mode
      }
    } else if (
      reminder.dateRangeMode === "range" ||
      reminder.dateRangeMode === "end"
    ) {
      if (reminder.endDate) {
        const endDateInServerTime = parseDateInUserTimezone(reminder.endDate);
        if (endDateInServerTime) {
          // End of day = start of next day - 1ms
          const endOfDay = new Date(
            endDateInServerTime.getTime() + 24 * 60 * 60 * 1000 - 1,
          );
          if (candidateDate > endOfDay) {
            return false; // Past end date
          }
        }
      }
    }

    return true;
  };

  // Helper to check if a specific day (in user's timezone) is valid for specific days + week intervals
  const isDayValidForReminder = (candidateTimestamp) => {
    if (!hasSpecificDays) return true;

    const candidateInUserTz = new Date(
      candidateTimestamp - timezoneOffset * 60 * 1000,
    );
    const candidateDay = candidateInUserTz.getUTCDay();

    // Check if day of week matches
    if (!daysOfWeek.includes(candidateDay)) {
      return false;
    }

    // Check week interval
    if (repeatWeeks > 1) {
      // Use start date as anchor if available, otherwise use creation date
      // This ensures the first valid day after start date is always week 0
      let anchorTimestamp;
      if (
        reminder.startDate &&
        (reminder.dateRangeMode === "start" ||
          reminder.dateRangeMode === "range")
      ) {
        anchorTimestamp = new Date(reminder.startDate).getTime();
      } else if (reminder.createdAt) {
        anchorTimestamp = new Date(reminder.createdAt).getTime();
      } else {
        anchorTimestamp = now.getTime();
      }
      const anchorInUserTz = new Date(
        anchorTimestamp - timezoneOffset * 60 * 1000,
      );
      anchorInUserTz.setUTCHours(0, 0, 0, 0);

      const checkDate = new Date(candidateInUserTz);
      checkDate.setUTCHours(0, 0, 0, 0);

      const msPerWeek = 7 * 24 * 60 * 60 * 1000;
      const weeksDiff = Math.floor(
        (checkDate.getTime() - anchorInUserTz.getTime()) / msPerWeek,
      );

      if (weeksDiff < 0 || weeksDiff % repeatWeeks !== 0) {
        return false;
      }
    }

    return true;
  };

  // Helper to find the next valid day considering specific days and week intervals
  // Returns the number of days to add to get to the next valid day
  const findNextValidDay = (startTimestamp, maxDays = 365) => {
    if (!hasSpecificDays) return 0;

    for (let daysToAdd = 0; daysToAdd <= maxDays; daysToAdd++) {
      const candidateTimestamp =
        startTimestamp + daysToAdd * 24 * 60 * 60 * 1000;
      if (
        isDayValidForReminder(candidateTimestamp) &&
        isValidNextRun(candidateTimestamp)
      ) {
        return daysToAdd;
      }
    }
    return -1; // No valid day found
  };

  // For specific times
  if (
    reminder.useSpecificTimes &&
    reminder.specificTimes &&
    reminder.specificTimes.length > 0
  ) {
    const currentMinutes = userNow.getUTCHours() * 60 + userNow.getUTCMinutes();

    // Get user's midnight
    const userMidnight = new Date(userNow);
    userMidnight.setUTCHours(0, 0, 0, 0);

    // If using specific days, we need to find the next valid day first
    if (hasSpecificDays) {
      // Check today first - is it a valid day?
      const todayTimestamp =
        userMidnight.getTime() + timezoneOffset * 60 * 1000;
      const isTodayValid =
        isDayValidForReminder(todayTimestamp) && isValidNextRun(todayTimestamp);

      if (isTodayValid) {
        // Find next specific time today
        for (const specificTime of reminder.specificTimes) {
          const targetMinutes = specificTime.hours * 60 + specificTime.minutes;
          if (targetMinutes > currentMinutes) {
            const nextRunUserTime = new Date(
              userMidnight.getTime() + targetMinutes * 60 * 1000,
            );
            const candidateTime =
              nextRunUserTime.getTime() + timezoneOffset * 60 * 1000;
            return candidateTime;
          }
        }
      }

      // No valid time today, find next valid day
      const tomorrowTimestamp = todayTimestamp + 24 * 60 * 60 * 1000;
      const daysToAdd = findNextValidDay(tomorrowTimestamp, 365);

      if (daysToAdd >= 0) {
        const nextValidDayMidnight = new Date(
          userMidnight.getTime() + (daysToAdd + 1) * 24 * 60 * 60 * 1000,
        );
        const firstTime = reminder.specificTimes[0];
        const nextRunUserTime = new Date(
          nextValidDayMidnight.getTime() +
            (firstTime.hours * 60 + firstTime.minutes) * 60 * 1000,
        );
        const candidateTime =
          nextRunUserTime.getTime() + timezoneOffset * 60 * 1000;
        return candidateTime;
      }

      return null; // No valid day found
    }

    // Original logic for non-specific-days mode
    let nextTime = null;

    // Find next specific time today
    for (const specificTime of reminder.specificTimes) {
      const targetMinutes = specificTime.hours * 60 + specificTime.minutes;
      if (targetMinutes > currentMinutes) {
        nextTime = specificTime;
        break;
      }
    }

    if (nextTime) {
      const nextRunUserTime = new Date(
        userMidnight.getTime() +
          (nextTime.hours * 60 + nextTime.minutes) * 60 * 1000,
      );
      const candidateTime =
        nextRunUserTime.getTime() + timezoneOffset * 60 * 1000;
      if (isValidNextRun(candidateTime)) {
        return candidateTime;
      }
    }

    // Check if we can schedule for tomorrow (first specific time)
    if (reminder.specificTimes.length > 0) {
      const firstTime = reminder.specificTimes[0];
      const nextRunUserTime = new Date(
        userMidnight.getTime() +
          (24 * 60 + firstTime.hours * 60 + firstTime.minutes) * 60 * 1000,
      );
      const candidateTime =
        nextRunUserTime.getTime() + timezoneOffset * 60 * 1000;
      if (isValidNextRun(candidateTime)) {
        return candidateTime;
      }
    }

    // No valid next run time
    return null;
  }

  // For interval reminders
  if (reminder.intervalMinutes > 0 && reminder.startTime && reminder.endTime) {
    // If using specific days, find next valid day first
    if (hasSpecificDays) {
      const userMidnight = new Date(userNow);
      userMidnight.setUTCHours(0, 0, 0, 0);
      const todayTimestamp =
        userMidnight.getTime() + timezoneOffset * 60 * 1000;
      const isTodayValid =
        isDayValidForReminder(todayTimestamp) && isValidNextRun(todayTimestamp);

      if (isTodayValid) {
        const candidateTime = getNextScheduledTime(
          reminder.startTime,
          reminder.endTime,
          reminder.intervalMinutes,
          timezoneOffset,
        ).getTime();

        // Check if candidate is still today
        const candidateInUserTz = new Date(
          candidateTime - timezoneOffset * 60 * 1000,
        );
        const candidateMidnight = new Date(candidateInUserTz);
        candidateMidnight.setUTCHours(0, 0, 0, 0);

        if (candidateMidnight.getTime() === userMidnight.getTime()) {
          return candidateTime;
        }
      }

      // Find next valid day
      const tomorrowTimestamp = todayTimestamp + 24 * 60 * 60 * 1000;
      const daysToAdd = findNextValidDay(tomorrowTimestamp, 365);

      if (daysToAdd >= 0) {
        const nextValidDayMidnight = new Date(
          userMidnight.getTime() + (daysToAdd + 1) * 24 * 60 * 60 * 1000,
        );
        const nextRunUserTime = new Date(
          nextValidDayMidnight.getTime() +
            (reminder.startTime.hours * 60 + reminder.startTime.minutes) *
              60 *
              1000,
        );
        const candidateTime =
          nextRunUserTime.getTime() + timezoneOffset * 60 * 1000;
        return candidateTime;
      }

      return null;
    }

    const candidateTime = getNextScheduledTime(
      reminder.startTime,
      reminder.endTime,
      reminder.intervalMinutes,
      timezoneOffset,
    ).getTime();

    if (isValidNextRun(candidateTime)) {
      return candidateTime;
    }
    return null;
  }

  // For one-time reminders
  if (reminder.startTime) {
    const targetMinutes =
      reminder.startTime.hours * 60 + reminder.startTime.minutes;
    const currentMinutes = userNow.getUTCHours() * 60 + userNow.getUTCMinutes();

    const userMidnight = new Date(userNow);
    userMidnight.setUTCHours(0, 0, 0, 0);

    let nextRunUserTime;
    if (currentMinutes < targetMinutes) {
      nextRunUserTime = new Date(
        userMidnight.getTime() + targetMinutes * 60 * 1000,
      );
    } else {
      nextRunUserTime = new Date(
        userMidnight.getTime() + (targetMinutes + 24 * 60) * 60 * 1000,
      );
    }

    const candidateTime =
      nextRunUserTime.getTime() + timezoneOffset * 60 * 1000;
    if (isValidNextRun(candidateTime)) {
      return candidateTime;
    }
    return null;
  }

  return null;
}

// Express app setup
const app = express();
app.use(express.json());
app.use(express.static("public"));

// Disable caching for API routes to ensure fresh data
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  next();
});

// Helper functions
function getDiscordTimestamp(timestamp, format = "R") {
  return `<t:${Math.floor(timestamp / 1000)}:${format}>`;
}

function parseTimeString(timeStr) {
  // Parse "HH:MM" format (24-hour)
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return { hours, minutes };
}

function getNextScheduledTime(
  startTime,
  endTime,
  intervalMinutes,
  timezoneOffset = 0,
) {
  // Get current time adjusted for user's timezone
  const now = new Date();
  // timezoneOffset is in minutes (positive = behind UTC, e.g., UTC-8 = 480)
  // We need to calculate what time it is in the user's timezone
  const userNow = new Date(now.getTime() - timezoneOffset * 60 * 1000);

  // Get hours and minutes in user's timezone
  const userHours = userNow.getUTCHours();
  const userMinutes = userNow.getUTCMinutes();
  const currentMinutes = userHours * 60 + userMinutes;

  const startMinutes = startTime.hours * 60 + startTime.minutes;
  const endMinutes = endTime.hours * 60 + endTime.minutes;

  // Calculate next run time in user's timezone
  let nextRunMinutes;

  // If current time is before start time today
  if (currentMinutes < startMinutes) {
    nextRunMinutes = startMinutes;
  }
  // If current time is after end time today
  else if (currentMinutes >= endMinutes) {
    // Return start time tomorrow - we'll handle this below
    nextRunMinutes = startMinutes + 24 * 60; // Add a day
  }
  // We're between start and end time
  else {
    const minutesSinceStart = currentMinutes - startMinutes;
    const intervalsCompleted = Math.floor(minutesSinceStart / intervalMinutes);
    nextRunMinutes = startMinutes + (intervalsCompleted + 1) * intervalMinutes;

    // If next interval is past end time, schedule for tomorrow's start
    if (nextRunMinutes > endMinutes) {
      nextRunMinutes = startMinutes + 24 * 60;
    }
  }

  // Convert back to actual timestamp
  // Start with today at midnight in user's timezone
  const userMidnight = new Date(userNow);
  userMidnight.setUTCHours(0, 0, 0, 0);

  // Add the calculated minutes
  const nextRunUserTime = new Date(
    userMidnight.getTime() + nextRunMinutes * 60 * 1000,
  );

  // Convert back to server time (add back the offset)
  const nextRunServerTime = new Date(
    nextRunUserTime.getTime() + timezoneOffset * 60 * 1000,
  );

  return nextRunServerTime;
}

function isWithinDateRange(
  date,
  startDate,
  endDate,
  dateRangeMode,
  timezoneOffset = 0,
) {
  // Convert to user's timezone for comparison
  const dateInUserTz = new Date(
    new Date(date).getTime() - timezoneOffset * 60 * 1000,
  );
  const checkDate = new Date(dateInUserTz);
  checkDate.setUTCHours(0, 0, 0, 0);

  // Helper to parse date in user's timezone
  const parseDateInUserTz = (dateInput) => {
    if (!dateInput) return null;
    if (typeof dateInput === "string") {
      const [year, month, day] = dateInput.split("-").map(Number);
      return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    }
    const d = new Date(dateInput);
    const dInUserTz = new Date(d.getTime() - timezoneOffset * 60 * 1000);
    dInUserTz.setUTCHours(0, 0, 0, 0);
    return dInUserTz;
  };

  // Handle different date range modes
  switch (dateRangeMode) {
    case "today":
      const now = new Date();
      const todayInUserTz = new Date(
        now.getTime() - timezoneOffset * 60 * 1000,
      );
      todayInUserTz.setUTCHours(0, 0, 0, 0);
      return checkDate.getTime() === todayInUserTz.getTime();

    case "start":
      if (!startDate) return true;
      const start = parseDateInUserTz(startDate);
      return checkDate >= start;

    case "end":
      if (!endDate) return true;
      const end = parseDateInUserTz(endDate);
      end.setUTCHours(23, 59, 59, 999);
      return checkDate <= end;

    case "range":
      if (!startDate && !endDate) return true;
      if (startDate) {
        const start = parseDateInUserTz(startDate);
        if (checkDate < start) return false;
      }
      if (endDate) {
        const end = parseDateInUserTz(endDate);
        end.setUTCHours(23, 59, 59, 999);
        if (checkDate > end) return false;
      }
      return true;

    case "none":
    default:
      return true;
  }
}

function isValidWeekForReminder(date, reminder) {
  const repeatWeeks = reminder.repeatWeeks || 1;
  const daysOfWeek = reminder.daysOfWeek || [];
  const timezoneOffset = reminder.timezoneOffset || 0;

  // If repeatWeeks is 1, always valid (every week)
  if (repeatWeeks === 1) return true;

  // If no days selected, it's not a weekly reminder
  if (daysOfWeek.length === 0) return true;

  // Use start date as anchor if available, otherwise use creation date
  // This ensures the first valid day after start date is always week 0
  let anchorTimestamp;
  if (
    reminder.startDate &&
    (reminder.dateRangeMode === "start" || reminder.dateRangeMode === "range")
  ) {
    anchorTimestamp = new Date(reminder.startDate).getTime();
  } else if (reminder.createdAt) {
    anchorTimestamp = new Date(reminder.createdAt).getTime();
  } else {
    anchorTimestamp = new Date().getTime();
  }
  const anchorInUserTz = new Date(anchorTimestamp - timezoneOffset * 60 * 1000);
  anchorInUserTz.setUTCHours(0, 0, 0, 0);

  const checkDateInUserTz = new Date(
    new Date(date).getTime() - timezoneOffset * 60 * 1000,
  );
  checkDateInUserTz.setUTCHours(0, 0, 0, 0);

  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksDiff = Math.floor(
    (checkDateInUserTz.getTime() - anchorInUserTz.getTime()) / msPerWeek,
  );

  return weeksDiff >= 0 && weeksDiff % repeatWeeks === 0;
}

function isDayValid(date, reminder) {
  const daysOfWeek = reminder.daysOfWeek || [];
  const timezoneOffset = reminder.timezoneOffset || 0;

  // If no days specified, it's valid every day
  if (daysOfWeek.length === 0) return true;

  // Convert to user's timezone to get correct day of week
  const dateInUserTz = new Date(
    new Date(date).getTime() - timezoneOffset * 60 * 1000,
  );
  const userDay = dateInUserTz.getUTCDay();

  return daysOfWeek.includes(userDay);
}

function scheduleReminder(reminderId, reminder) {
  // Clear existing schedules
  if (reminder.intervalId) clearInterval(reminder.intervalId);
  if (reminder.preWarningTimeoutId) clearTimeout(reminder.preWarningTimeoutId);
  if (reminder.oneTimeTimeoutId) clearTimeout(reminder.oneTimeTimeoutId);

  // Skip if reminder is inactive (one-time that already fired)
  if (reminder.isActive === false) {
    console.log(`Reminder ${reminderId} is inactive, skipping scheduling`);
    return;
  }

  const channel = client.channels.cache.get(reminder.channelId);
  if (!channel) {
    console.error(`Channel ${reminder.channelId} not found`);
    return;
  }

  // Get role mention if specified
  let roleMention = "";
  if (reminder.roleId) {
    const guild = channel.guild;
    const role = guild.roles.cache.get(reminder.roleId);
    if (role) {
      roleMention = `<@&${reminder.roleId}> `;
    }
  }

  const sendMainReminder = async (isOneTimeFire = false) => {
    // Check date range
    const now = new Date();
    const timezoneOffset = reminder.timezoneOffset || 0;
    if (
      !isWithinDateRange(
        now,
        reminder.startDate,
        reminder.endDate,
        reminder.dateRangeMode,
        timezoneOffset,
      )
    ) {
      console.log(`Reminder ${reminderId} outside date range, skipping`);
      return;
    }

    // Check day validity
    if (!isDayValid(now, reminder)) {
      console.log(`Reminder ${reminderId} not valid for today, skipping`);
      return;
    }

    // Check week validity
    if (!isValidWeekForReminder(now, reminder)) {
      console.log(`Reminder ${reminderId} not valid for this week, skipping`);
      return;
    }

    // Replace placeholders in main message (for embed)
    let embedMessage = reminder.message; // Renamed to embedMessage
    const nowTime = new Date().getTime();
    embedMessage = embedMessage.replace(
      /\{time\}/g,
      getDiscordTimestamp(nowTime, "t"),
    );
    embedMessage = embedMessage.replace(
      /\{relative\}/g,
      getDiscordTimestamp(nowTime, "R"),
    );

    // Role mention goes in message CONTENT, not in embed
    const messageContent = roleMention ? roleMention : ""; // Only role mention here

    const mainColor = parseInt(
      (reminder.mainColor || "#00ff00").replace("#", ""),
      16,
    );
    const embed = new Discord.EmbedBuilder()
      .setColor(mainColor)
      .setTitle(reminder.mainTitle || "🔔 Reminder!")
      .setDescription(embedMessage) // <-- No role mention in embed
      .setTimestamp();

    // Set footer based on reminder type
    if (reminder.useSpecificTimes && reminder.specificTimes) {
      const timesDisplay = reminder.specificTimes
        .map((t) => formatTime(t))
        .join(", ");
      embed.setFooter({
        text: `Reminder ID: ${reminderId} | Times: ${timesDisplay}`,
      });
    } else if (reminder.intervalMinutes > 0) {
      embed.setFooter({
        text: `Reminder ID: ${reminderId} | Interval: ${reminder.intervalMinutes} minutes`,
      });
      embed.addFields({
        name: "Active Hours",
        value: `${formatTime(reminder.startTime)} - ${formatTime(reminder.endTime)}`,
      });
    } else {
      embed.setFooter({
        text: `Reminder ID: ${reminderId} | One-time reminder`,
      });
    }

    // Send role mention in content, embed separately
    await channel.send({
      content: messageContent, // Role mention here
      embeds: [embed],
    });

    // Record that reminder fired
    reminder.firedAt = Date.now();
  };

  // Shared function to schedule the next pre-warning (available for all reminder types)
  const scheduleNextPreWarning = (nextRunTime) => {
    if (!reminder.preWarningMinutes || !reminder.preWarningMessage) return;

    // Clear any existing pre-warning timeout
    if (reminder.preWarningTimeoutId) {
      clearTimeout(reminder.preWarningTimeoutId);
      reminder.preWarningTimeoutId = null;
    }

    const now = Date.now();
    const preWarningTime = nextRunTime - reminder.preWarningMinutes * 60 * 1000;

    if (preWarningTime > now) {
      const delay = preWarningTime - now;
      reminder.preWarningTimeoutId = setTimeout(async () => {
        const checkDate = new Date();
        const tz = reminder.timezoneOffset || 0;
        if (
          !isWithinDateRange(
            checkDate,
            reminder.startDate,
            reminder.endDate,
            reminder.dateRangeMode,
            tz,
          )
        )
          return;
        if (!isDayValid(checkDate, reminder)) return;
        if (!isValidWeekForReminder(checkDate, reminder)) return;

        let preWarningContent = reminder.preWarningMessage;
        preWarningContent = preWarningContent.replace(
          /\{time\}/g,
          getDiscordTimestamp(nextRunTime, "t"),
        );
        preWarningContent = preWarningContent.replace(
          /\{relative\}/g,
          getDiscordTimestamp(nextRunTime, "R"),
        );

        // Pre-warning message without role mention (for embed)
        let preWarningEmbedMessage = preWarningContent; // Renamed

        const preColor = parseInt(
          (reminder.preWarningColor || "#ffaa00").replace("#", ""),
          16,
        );
        const preEmbed = new Discord.EmbedBuilder()
          .setColor(preColor)
          .setTitle(reminder.preWarningTitle || "⚠️ Upcoming Event")
          .setDescription(preWarningEmbedMessage) // <-- No role mention in embed
          .setFooter({ text: `Reminder ID: ${reminderId}` })
          .setTimestamp();

        preEmbed.addFields({
          name: "Main Event",
          value: `${getDiscordTimestamp(nextRunTime, "R")} (${getDiscordTimestamp(nextRunTime, "t")})`,
        });

        // Send role mention in content, embed separately
        await channel.send({
          content: roleMention ? roleMention : "", // Role mention here
          embeds: [preEmbed],
        });
      }, delay);
    }
  };

  // Shared function to update nextRun after a trigger and check for deactivation
  const updateNextRunAfterTrigger = async () => {
    const newNextRun = calculateNextRunTime(reminder);
    reminder.nextRun = newNextRun;

    if (newNextRun === null) {
      // No more valid triggers - deactivate the reminder
      reminder.isActive = false;
      if (reminder.intervalId) {
        clearInterval(reminder.intervalId);
        reminder.intervalId = null;
      }
      if (reminder.preWarningTimeoutId) {
        clearTimeout(reminder.preWarningTimeoutId);
        reminder.preWarningTimeoutId = null;
      }
      console.log(
        `Reminder ${reminderId} has no more valid triggers, marked inactive`,
      );
    } else {
      // Schedule next pre-warning
      scheduleNextPreWarning(newNextRun);
    }

    await saveReminders();
  };

  // Handle specific times mode
  if (
    reminder.useSpecificTimes &&
    reminder.specificTimes &&
    reminder.specificTimes.length > 0
  ) {
    const triggeredSlots = new Map();

    reminder.intervalId = setInterval(async () => {
      const now = new Date();
      const timezoneOffset = reminder.timezoneOffset || 0;
      if (
        !isWithinDateRange(
          now,
          reminder.startDate,
          reminder.endDate,
          reminder.dateRangeMode,
          timezoneOffset,
        )
      ) {
        return; // Outside date range, skip (don't thrash with saveReminders)
      }
      if (!isDayValid(now, reminder)) return;
      if (!isValidWeekForReminder(now, reminder)) return;

      const userNow = new Date(now.getTime() - timezoneOffset * 60 * 1000);
      const userHours = userNow.getUTCHours();
      const userMinutes = userNow.getUTCMinutes();
      const currentMinutes = userHours * 60 + userMinutes;
      const userDate = userNow.getUTCDate();
      const userMonth = userNow.getUTCMonth();
      const userYear = userNow.getUTCFullYear();

      // Check each specific time
      for (const specificTime of reminder.specificTimes) {
        const targetMinutes = specificTime.hours * 60 + specificTime.minutes;
        const timeKey = `${userYear}-${userMonth}-${userDate}-${targetMinutes}`;

        // Trigger at exact time, once per calendar day per time slot
        if (currentMinutes === targetMinutes && !triggeredSlots.has(timeKey)) {
          triggeredSlots.set(timeKey, true);

          // Clean up old entries (keep only today's)
          const todayPrefix = `${userYear}-${userMonth}-${userDate}-`;
          for (const key of triggeredSlots.keys()) {
            if (!key.startsWith(todayPrefix)) {
              triggeredSlots.delete(key);
            }
          }

          await sendMainReminder(false);
          // Update nextRun and schedule next pre-warning
          await updateNextRunAfterTrigger();
          break; // Only fire one at a time
        }
      }
    }, 10000);

    console.log(
      `Scheduled specific times reminder ${reminderId} with ${reminder.specificTimes.length} time(s)`,
    );
    reminder.nextRun = calculateNextRunTime(reminder);

    // Check if reminder should be inactive from the start
    if (reminder.nextRun === null) {
      reminder.isActive = false;
      if (reminder.intervalId) {
        clearInterval(reminder.intervalId);
        reminder.intervalId = null;
      }
      saveReminders();
      console.log(
        `Reminder ${reminderId} has no valid triggers, marked inactive`,
      );
      return;
    }

    // Schedule initial pre-warning for specific times mode
    if (reminder.nextRun && reminder.preWarningMinutes) {
      scheduleNextPreWarning(reminder.nextRun);
    }
    return;
  }

  // Handle interval mode
  if (reminder.intervalMinutes > 0) {
    let lastTriggeredMinute = -1;

    reminder.intervalId = setInterval(async () => {
      const now = new Date();
      const timezoneOffset = reminder.timezoneOffset || 0;
      if (
        !isWithinDateRange(
          now,
          reminder.startDate,
          reminder.endDate,
          reminder.dateRangeMode,
          timezoneOffset,
        )
      ) {
        return; // Outside date range, skip (don't thrash with saveReminders)
      }
      if (!isDayValid(now, reminder)) return;
      if (!isValidWeekForReminder(now, reminder)) return;

      const userNow = new Date(now.getTime() - timezoneOffset * 60 * 1000);
      const userHours = userNow.getUTCHours();
      const userMinutes = userNow.getUTCMinutes();
      const currentMinutes = userHours * 60 + userMinutes;

      const startMinutes =
        reminder.startTime.hours * 60 + reminder.startTime.minutes;
      const endMinutes = reminder.endTime.hours * 60 + reminder.endTime.minutes;

      // Check if current time is within active hours
      if (currentMinutes < startMinutes || currentMinutes > endMinutes) return;

      const minutesSinceStart = currentMinutes - startMinutes;

      // Check if it's time to trigger (interval reached)
      if (
        minutesSinceStart >= 0 &&
        minutesSinceStart % reminder.intervalMinutes === 0 &&
        currentMinutes !== lastTriggeredMinute
      ) {
        lastTriggeredMinute = currentMinutes;

        await sendMainReminder(false);
        // Update nextRun and schedule next pre-warning
        await updateNextRunAfterTrigger();
      }
    }, 10000);

    // Calculate initial next run time
    reminder.nextRun = calculateNextRunTime(reminder);

    // Check if reminder should be inactive from the start
    if (reminder.nextRun === null) {
      reminder.isActive = false;
      if (reminder.intervalId) {
        clearInterval(reminder.intervalId);
        reminder.intervalId = null;
      }
      saveReminders();
      console.log(
        `Reminder ${reminderId} has no valid triggers, marked inactive`,
      );
      return;
    }

    // Schedule initial pre-warning if there's a next run time
    if (reminder.nextRun && reminder.preWarningMinutes) {
      scheduleNextPreWarning(reminder.nextRun);
    }

    console.log(
      `Scheduled interval reminder ${reminderId}: Every ${reminder.intervalMinutes} minutes`,
    );
    return;
  }

  // Handle one-time reminders (interval=0 and not specific times)
  const now = new Date();
  const timezoneOffset = reminder.timezoneOffset || 0;
  const userNow = new Date(now.getTime() - timezoneOffset * 60 * 1000);

  // Calculate when the reminder should fire
  const targetMinutes =
    reminder.startTime.hours * 60 + reminder.startTime.minutes;
  const currentMinutes = userNow.getUTCHours() * 60 + userNow.getUTCMinutes();

  let delayMinutes = targetMinutes - currentMinutes;
  if (delayMinutes < 0) delayMinutes += 24 * 60; // Tomorrow if already passed

  const delayMs = delayMinutes * 60 * 1000 - userNow.getUTCSeconds() * 1000;

  reminder.nextRun = calculateNextRunTime(reminder);

  // Check if reminder should be inactive (e.g., today only and time passed)
  if (reminder.nextRun === null) {
    reminder.isActive = false;
    saveReminders();
    console.log(
      `One-time reminder ${reminderId} has no valid trigger, marked inactive`,
    );
    return;
  }

  // Schedule pre-warning for one-time reminder
  if (reminder.nextRun && reminder.preWarningMinutes) {
    scheduleNextPreWarning(reminder.nextRun);
  }

  reminder.oneTimeTimeoutId = setTimeout(
    async () => {
      await sendMainReminder(true);
      // Mark as inactive after firing
      reminder.isActive = false;
      reminder.nextRun = null;
      await saveReminders();
      console.log(`One-time reminder ${reminderId} fired and marked inactive`);
    },
    Math.max(delayMs, 0),
  );

  console.log(
    `Scheduled one-time reminder ${reminderId}: fires in ${delayMinutes} minutes`,
  );
}

function formatTime(time) {
  if (!time) return "";
  let hours = time.hours;
  const minutes = time.minutes.toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

// API Routes
app.get("/api/status", (req, res) => {
  res.json({
    online: client.isReady(),
    username: client.user?.tag || "Not connected",
    servers: client.guilds.cache.size,
    reminders: reminders.size,
    schedules: schedules.size,
  });
});

app.get("/api/channels", (req, res) => {
  if (!client.isReady()) {
    return res.json({ error: "Bot not connected" });
  }

  const channels = [];
  client.guilds.cache.forEach((guild) => {
    guild.channels.cache.forEach((channel) => {
      if (channel.type === Discord.ChannelType.GuildText) {
        channels.push({
          id: channel.id,
          name: channel.name,
          guild: guild.name,
          guildId: guild.id,
        });
      }
    });
  });

  res.json(channels);
});

app.get("/api/roles/:guildId", (req, res) => {
  if (!client.isReady()) {
    return res.json({ error: "Bot not connected" });
  }

  const guild = client.guilds.cache.get(req.params.guildId);
  if (!guild) {
    return res.status(404).json({ error: "Guild not found" });
  }

  const roles = Array.from(guild.roles.cache.values())
    .filter((role) => role.name !== "@everyone")
    .map((role) => ({
      id: role.id,
      name: role.name,
      color: role.hexColor,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json(roles);
});

app.get("/api/reminders", (req, res) => {
  try {
    const reminderList = Array.from(reminders.entries()).map(
      ([id, reminder]) => {
        const channel = client.channels.cache.get(reminder.channelId);

        // NEW: Get role name if roleId exists
        let roleName = null;
        let guildId = null;
        if (reminder.roleId && channel?.guild) {
          guildId = channel.guild.id;
          const role = channel.guild.roles.cache.get(reminder.roleId);
          roleName = role ? role.name : null;
        }

        // Safely extract time objects
        const safeStartTime = reminder.startTime
          ? {
              hours: reminder.startTime.hours,
              minutes: reminder.startTime.minutes,
            }
          : null;
        const safeEndTime = reminder.endTime
          ? { hours: reminder.endTime.hours, minutes: reminder.endTime.minutes }
          : null;
        const safeSpecificTimes = reminder.specificTimes
          ? reminder.specificTimes.map((t) => ({
              hours: t.hours,
              minutes: t.minutes,
            }))
          : null;

        // Calculate next run time if not already set
        if (!reminder.nextRun && reminder.isActive !== false) {
          reminder.nextRun = calculateNextRunTime(reminder);
        }

        // Build a clean object without non-serializable properties
        const returnData = {
          id,
          channelId: reminder.channelId,
          channelName: channel?.name || "Unknown",
          guildName: channel?.guild?.name || "Unknown",
          guildId: guildId, // NEW: Include guild ID
          message: reminder.message,
          intervalMinutes: reminder.intervalMinutes,
          preWarningMinutes: reminder.preWarningMinutes,
          preWarningMessage: reminder.preWarningMessage,
          roleId: reminder.roleId,
          roleName: roleName, // NEW: Include role name
          startTime: safeStartTime,
          endTime: safeEndTime,
          timezoneOffset: reminder.timezoneOffset,
          daysOfWeek: reminder.daysOfWeek ? [...reminder.daysOfWeek] : null,
          mainTitle: reminder.mainTitle,
          mainColor: reminder.mainColor,
          preWarningTitle: reminder.preWarningTitle,
          preWarningColor: reminder.preWarningColor,
          useSpecificTimes: reminder.useSpecificTimes,
          specificTimes: safeSpecificTimes,
          dateRangeMode: reminder.dateRangeMode || "none",
          frequencyMode: reminder.frequencyMode || "daily",
          repeatWeeks: reminder.repeatWeeks || 1,
          nextRun: reminder.nextRun,
          createdAt: reminder.createdAt,
          isActive: reminder.isActive,
          firedAt: reminder.firedAt,
        };

        // Convert dates to ISO strings for JSON safely
        try {
          if (reminder.startDate && reminder.startDate instanceof Date) {
            returnData.startDate = reminder.startDate.toISOString();
          }
          if (reminder.endDate && reminder.endDate instanceof Date) {
            returnData.endDate = reminder.endDate.toISOString();
          }
        } catch (dateError) {
          console.error(
            `Error converting dates for reminder ${id}:`,
            dateError,
          );
        }

        return returnData;
      },
    );
    res.json(reminderList);
  } catch (error) {
    console.error("Error fetching reminders:", error);
    res
      .status(500)
      .json({ error: "Failed to load reminders: " + error.message });
  }
});

app.post("/api/reminders", async (req, res) => {
  try {
    console.log(
      "Received reminder creation request:",
      JSON.stringify(req.body, null, 2),
    );

    const {
      channelId,
      intervalMinutes,
      message,
      preWarningMinutes,
      preWarningMessage,
      roleId,
      startTime,
      endTime,
      startDate,
      endDate,
      dateRangeMode,
      frequencyMode,
      repeatWeeks,
      specificTimes,
      useSpecificTimes,
      daysOfWeek,
      mainTitle,
      mainColor,
      preWarningTitle,
      preWarningColor,
    } = req.body;

    // Validation
    if (!channelId || !message) {
      console.log("Validation failed: Missing channelId or message");
      return res.status(400).json({
        error: "Missing required fields: channelId, message",
      });
    }

    // Parse times based on reminder type
    const parsedStartTime = startTime ? parseTimeString(startTime) : null;
    const parsedEndTime = endTime ? parseTimeString(endTime) : null;

    // Validate interval mode
    if (!useSpecificTimes) {
      if (!parsedStartTime) {
        return res
          .status(400)
          .json({ error: "Start time is required for interval mode" });
      }

      const parsedIntervalMinutes = parseInt(intervalMinutes) || 15;
      if (parsedIntervalMinutes > 0 && parsedIntervalMinutes < 5) {
        return res.status(400).json({
          error: "Interval must be at least 5 minutes",
        });
      }

      if (parsedIntervalMinutes > 0 && !parsedEndTime) {
        return res
          .status(400)
          .json({ error: "End time is required for interval reminders" });
      }
    }

    // Validate specific times mode
    if (useSpecificTimes) {
      if (
        !specificTimes ||
        !Array.isArray(specificTimes) ||
        specificTimes.length === 0
      ) {
        return res
          .status(400)
          .json({ error: "At least one specific time is required" });
      }
    }

    // Validate date range mode
    if (dateRangeMode === "range") {
      if (!startDate || !endDate) {
        return res.status(400).json({
          error: "Both start and end dates are required for date range mode",
        });
      }
      if (new Date(startDate) > new Date(endDate)) {
        return res
          .status(400)
          .json({ error: "Start date must be before end date" });
      }
    }

    // Validate frequency and repeat weeks
    const parsedDaysOfWeek =
      daysOfWeek && Array.isArray(daysOfWeek)
        ? daysOfWeek.map((d) => parseInt(d))
        : [];
    if (
      dateRangeMode !== "today" &&
      frequencyMode === "specific" &&
      parsedDaysOfWeek.length === 0
    ) {
      return res.status(400).json({
        error: "At least one day must be selected for specific days frequency",
      });
    }

    const parsedRepeatWeeks = Math.min(
      Math.max(parseInt(repeatWeeks) || 1, 1),
      5,
    );

    // Parse specific times if provided
    let parsedSpecificTimes = null;
    if (useSpecificTimes && specificTimes && Array.isArray(specificTimes)) {
      parsedSpecificTimes = specificTimes
        .map((t) => parseTimeString(t))
        .filter((t) => t !== null);
      parsedSpecificTimes.sort(
        (a, b) => a.hours * 60 + a.minutes - (b.hours * 60 + b.minutes),
      );
    }

    const reminderId = reminderCounter++;
    const reminder = {
      id: reminderId,
      channelId,
      message,
      intervalMinutes: useSpecificTimes ? 0 : parseInt(intervalMinutes) || 0,
      preWarningMinutes: preWarningMinutes ? parseInt(preWarningMinutes) : null,
      preWarningMessage: preWarningMessage || null,
      roleId: roleId || null,
      startTime: parsedStartTime,
      endTime: parsedEndTime,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      timezoneOffset:
        req.body.timezoneOffset !== undefined
          ? req.body.timezoneOffset
          : new Date().getTimezoneOffset(),
      daysOfWeek: parsedDaysOfWeek,
      mainTitle: mainTitle || null,
      mainColor: mainColor || null,
      preWarningTitle: preWarningTitle || null,
      preWarningColor: preWarningColor || null,
      specificTimes: parsedSpecificTimes,
      useSpecificTimes: useSpecificTimes || false,
      dateRangeMode: dateRangeMode || "none",
      frequencyMode: frequencyMode || "daily",
      repeatWeeks: parsedRepeatWeeks,
      nextRun: null,
      intervalId: null,
      preWarningTimeoutId: null,
      createdAt: Date.now(),
      isActive: true,
      firedAt: null,
    };

    // Calculate next run time - this determines if reminder should be active
    // A reminder is active if it has a valid future trigger time
    reminder.nextRun = calculateNextRunTime(reminder);
    reminder.isActive = reminder.nextRun !== null;

    reminders.set(reminderId, reminder);
    if (reminder.isActive) {
      scheduleReminder(reminderId, reminder);
    }
    await saveReminders();

    // Return reminder without circular references
    const { intervalId, preWarningTimeoutId, ...safeReminder } = reminder;
    res.json({ success: true, id: reminderId, reminder: safeReminder });
  } catch (error) {
    console.error("Error creating reminder:", error);
    res.status(500).json({ error: "Internal server error: " + error.message });
  }
});

app.put("/api/reminders/:id", async (req, res) => {
  try {
    const reminderId = parseInt(req.params.id);
    const reminder = reminders.get(reminderId);

    if (!reminder) {
      return res.status(404).json({ error: "Reminder not found" });
    }

    // Update reminder fields
    const fields = [
      "intervalMinutes",
      "message",
      "preWarningMinutes",
      "preWarningMessage",
      "roleId",
      "startTime",
      "endTime",
      "startDate",
      "endDate",
      "dateRangeMode",
      "frequencyMode",
      "repeatWeeks",
      "specificTimes",
      "useSpecificTimes",
      "daysOfWeek",
      "mainTitle",
      "mainColor",
      "preWarningTitle",
      "preWarningColor",
    ];

    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === "startTime" || field === "endTime") {
          reminder[field] = req.body[field]
            ? parseTimeString(req.body[field])
            : null;
        } else if (field === "startDate" || field === "endDate") {
          reminder[field] = req.body[field] ? new Date(req.body[field]) : null;
        } else if (field === "specificTimes" && req.body[field]) {
          reminder[field] = req.body[field]
            .map((t) => parseTimeString(t))
            .filter((t) => t !== null);
          reminder[field].sort(
            (a, b) => a.hours * 60 + a.minutes - (b.hours * 60 + b.minutes),
          );
        } else if (field === "daysOfWeek" && req.body[field]) {
          reminder[field] = req.body[field].map((d) => parseInt(d));
        } else if (field === "repeatWeeks") {
          reminder[field] = Math.min(
            Math.max(parseInt(req.body[field]) || 1, 1),
            5,
          );
        } else {
          reminder[field] = req.body[field];
        }
      }
    });

    // Update timezone offset from client
    if (req.body.timezoneOffset !== undefined) {
      reminder.timezoneOffset = req.body.timezoneOffset;
    }

    // Calculate next run time - this determines if reminder should be active
    // A reminder is active if it has a valid future trigger time
    reminder.nextRun = calculateNextRunTime(reminder);
    reminder.isActive = reminder.nextRun !== null;

    // Reschedule reminder
    if (reminder.isActive) {
      scheduleReminder(reminderId, reminder);
    } else {
      // Clear existing schedules
      if (reminder.intervalId) clearInterval(reminder.intervalId);
      if (reminder.preWarningTimeoutId)
        clearTimeout(reminder.preWarningTimeoutId);
      if (reminder.oneTimeTimeoutId) clearTimeout(reminder.oneTimeTimeoutId);
    }

    await saveReminders();

    // Return reminder without circular references
    const { intervalId, preWarningTimeoutId, ...safeReminder } = reminder;
    res.json({ success: true, reminder: safeReminder });
  } catch (error) {
    console.error("Error updating reminder:", error);
    res.status(500).json({ error: "Internal server error: " + error.message });
  }
});

app.delete("/api/reminders/:id", async (req, res) => {
  const reminderId = parseInt(req.params.id);
  const reminder = reminders.get(reminderId);

  if (!reminder) {
    return res.status(404).json({ error: "Reminder not found" });
  }

  if (reminder.intervalId) clearInterval(reminder.intervalId);
  if (reminder.preWarningTimeoutId) clearTimeout(reminder.preWarningTimeoutId);
  if (reminder.oneTimeTimeoutId) clearTimeout(reminder.oneTimeTimeoutId);

  reminders.delete(reminderId);
  await saveReminders();

  res.json({ success: true });
});

app.post("/api/reminders/:id/reactivate", async (req, res) => {
  const reminderId = parseInt(req.params.id);
  const reminder = reminders.get(reminderId);

  if (!reminder) {
    return res.status(404).json({ error: "Reminder not found" });
  }

  if (reminder.isActive !== false) {
    return res.status(400).json({ error: "Reminder is already active" });
  }

  // Calculate next run time - this determines if reminder should be active
  // A reminder is active if it has a valid future trigger time
  reminder.firedAt = null;
  reminder.nextRun = calculateNextRunTime(reminder);
  reminder.isActive = reminder.nextRun !== null;

  if (reminder.isActive) {
    scheduleReminder(reminderId, reminder);
  }

  await saveReminders();

  res.json({ success: true, message: "Reminder reactivated" });
});

// Schedules API Routes
app.get("/api/schedules", (req, res) => {
  const scheduleList = Array.from(schedules.entries()).map(
    ([id, schedule]) => ({
      id,
      ...schedule,
    }),
  );
  res.json(scheduleList);
});

app.post("/api/schedules", async (req, res) => {
  try {
    const { title, items } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Title is required" });
    }

    const scheduleId = title.toLowerCase().replace(/[^a-z0-9]/g, "_");

    if (schedules.has(scheduleId)) {
      return res
        .status(400)
        .json({ error: "A schedule with this title already exists" });
    }

    const schedule = {
      title: title.trim(),
      items: items || [],
      createdAt: Date.now(),
    };

    schedules.set(scheduleId, schedule);
    await saveSchedules();

    if (client.isReady()) {
      await registerCommands();
    }

    res.json({ success: true, id: scheduleId, schedule });
  } catch (error) {
    console.error("Error creating schedule:", error);
    res.status(500).json({ error: "Internal server error: " + error.message });
  }
});

app.put("/api/schedules/:id", async (req, res) => {
  try {
    const scheduleId = req.params.id;
    const schedule = schedules.get(scheduleId);

    if (!schedule) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    const { title, items } = req.body;

    if (title !== undefined) {
      schedule.title = title.trim();
    }
    if (items !== undefined) {
      schedule.items = items;
    }

    schedules.set(scheduleId, schedule);
    await saveSchedules();

    if (client.isReady()) {
      await registerCommands();
    }

    res.json({ success: true, schedule });
  } catch (error) {
    console.error("Error updating schedule:", error);
    res.status(500).json({ error: "Internal server error: " + error.message });
  }
});

app.delete("/api/schedules/:id", async (req, res) => {
  const scheduleId = req.params.id;

  if (!schedules.has(scheduleId)) {
    return res.status(404).json({ error: "Schedule not found" });
  }

  schedules.delete(scheduleId);
  await saveSchedules();

  if (client.isReady()) {
    await registerCommands();
  }

  res.json({ success: true });
});

// Discord bot commands - dynamically generated based on schedules
async function getCommands() {
  const scheduleChoices = Array.from(schedules.entries()).map(
    ([id, schedule]) => ({
      name: schedule.title,
      value: id,
    }),
  );

  return [
    {
      name: "reminder",
      description: "View schedules",
      options: [
        {
          name: "schedule",
          description: "The schedule name to view",
          type: Discord.ApplicationCommandOptionType.String,
          required: true,
          choices: scheduleChoices.slice(0, 25),
        },
      ],
    },
  ];
}

async function registerCommands() {
  try {
    const commands = await getCommands();
    await client.application.commands.set(commands);
    console.log("✅ Slash commands registered");
  } catch (error) {
    console.error("❌ Error registering commands:", error);
  }
}

// HTML Interface
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Discord Reminder Bot - Control Panel</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
    }

    .header {
      background: white;
      border-radius: 16px;
      padding: 30px;
      margin-bottom: 20px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
    }

    .header h1 {
      color: #667eea;
      font-size: 32px;
      margin-bottom: 10px;
    }

    .status {
      display: flex;
      gap: 20px;
      margin-top: 15px;
      flex-wrap: wrap;
    }

    .status-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: #f7fafc;
      border-radius: 8px;
    }

    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    .status-dot.online { background: #48bb78; }
    .status-dot.offline { background: #f56565; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .card {
      background: white;
      border-radius: 16px;
      padding: 30px;
      margin-bottom: 20px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
    }

    .card h2 {
      color: #2d3748;
      font-size: 24px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .form-group {
      margin-bottom: 20px;
    }

    .form-group label {
      display: block;
      margin-bottom: 8px;
      color: #4a5568;
      font-weight: 500;
    }

    .form-group input,
    .form-group select,
    .form-group textarea {
      width: 100%;
      padding: 12px;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      font-size: 14px;
      transition: border-color 0.3s;
    }

    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #667eea;
    }

    .form-group textarea {
      resize: vertical;
      min-height: 80px;
    }

    .checkbox-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .checkbox-group input[type="checkbox"] {
      width: auto;
    }

    .btn {
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
    }

    .btn-primary {
      background: #667eea;
      color: white;
    }

    .btn-primary:hover {
      background: #5568d3;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    .btn-danger {
      background: #f56565;
      color: white;
    }

    .btn-danger:hover {
      background: #e53e3e;
    }

    .btn-secondary {
      background: #edf2f7;
      color: #4a5568;
    }

    .btn-secondary:hover {
      background: #e2e8f0;
    }

    .btn-success {
      background: #48bb78;
      color: white;
    }

    .btn-success:hover {
      background: #38a169;
    }

    .alert {
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: none;
    }

    .alert.success {
      background: #c6f6d5;
      color: #22543d;
      border: 1px solid #9ae6b4;
    }

    .alert.error {
      background: #fed7d7;
      color: #742a2a;
      border: 1px solid #fc8181;
    }

    .reminder-item {
      background: #f7fafc;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 15px;
      border-left: 4px solid #667eea;
    }

    .reminder-item.inactive {
      border-left-color: #a0aec0;
      opacity: 0.8;
    }

    .reminder-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-bottom: 10px;
    }

    .reminder-title {
      font-weight: 600;
      color: #2d3748;
      font-size: 16px;
    }

    .reminder-actions {
      display: flex;
      gap: 10px;
    }

    .reminder-info {
      color: #4a5568;
      font-size: 14px;
      line-height: 1.6;
    }

    .reminder-badge {
      display: inline-block;
      padding: 4px 12px;
      background: #667eea;
      color: white;
      border-radius: 12px;
      font-size: 12px;
      margin-right: 8px;
      margin-top: 8px;
    }

    .role-badge {
      background: #ed8936;
    }

    .date-badge {
      background: #9f7aea;
    }

    .time-badge {
      background: #38b2ac;
    }

    .frequency-badge {
      background: #4299e1;
    }

    .week-badge {
      background: #ed64a6;
    }

    .time-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
    }

    .date-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
    }

    .days-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 8px;
    }

    .day-checkbox {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
      background: #f7fafc;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 14px;
    }

    .day-checkbox:hover {
      border-color: #667eea;
    }

    .day-checkbox input:checked + span,
    .day-checkbox:has(input:checked) {
      background: #667eea;
      color: white;
      border-color: #667eea;
    }

    .day-checkbox input {
      width: auto;
      margin: 0;
    }

    .embed-customization {
      background: #f7fafc;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 20px;
    }

    .embed-customization > label {
      display: block;
      font-weight: 600;
      color: #4a5568;
      margin-bottom: 12px;
    }

    .embed-grid {
      display: grid;
      grid-template-columns: 1fr 100px;
      gap: 15px;
      align-items: end;
    }

    .embed-grid input[type="color"] {
      width: 100%;
      height: 42px;
      padding: 4px;
      cursor: pointer;
    }

    .help-text {
      font-size: 12px;
      color: #718096;
      margin-top: 4px;
    }

    .info-box {
      background: #eef2ff;
      border: 2px solid #667eea;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 20px;
    }

    .info-box h3 {
      color: #667eea;
      margin-bottom: 8px;
      font-size: 16px;
    }

    .info-box p {
      color: #4a5568;
      font-size: 14px;
      line-height: 1.6;
    }

    .specific-times-container {
      background: #f0fff4;
      border: 2px solid #48bb78;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 20px;
    }

    .specific-times-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }

    .specific-time-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: #48bb78;
      color: white;
      border-radius: 20px;
      font-size: 14px;
    }

    .specific-time-tag button {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      font-size: 16px;
      padding: 0;
      line-height: 1;
    }

    .tabs {
      display: flex;
      gap: 10px;
      margin-top: 20px;
    }

    .tab-btn {
      padding: 12px 24px;
      border: none;
      border-radius: 8px 8px 0 0;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      background: #e2e8f0;
      color: #4a5568;
      transition: all 0.3s;
    }

    .tab-btn.active {
      background: #667eea;
      color: white;
    }

    .tab-btn:hover:not(.active) {
      background: #cbd5e0;
    }

    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
    }

    .schedule-item {
      background: #f7fafc;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 15px;
      border-left: 4px solid #9f7aea;
    }

    .schedule-item-row {
      display: flex;
      gap: 10px;
      align-items: center;
      margin-bottom: 10px;
      padding: 10px;
      background: white;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }

    .schedule-item-row input[type="time"] {
      width: 150px;
    }

    .schedule-item-row input[type="text"] {
      flex: 1;
    }

    @media (max-width: 768px) {
      .time-grid,
      .date-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🤖 Discord Reminder Bot</h1>
      <div class="status">
        <div class="status-item">
          <div class="status-dot" id="statusDot"></div>
          <span id="statusText">Checking...</span>
        </div>
        <div class="status-item">
          <span>👥 <strong id="serverCount">0</strong> Servers</span>
        </div>
        <div class="status-item">
          <span>⏰ <strong id="reminderCount">0</strong> Reminders</span>
        </div>
        <div class="status-item">
          <span>📋 <strong id="scheduleCount">0</strong> Schedules</span>
        </div>
      </div>
      <div class="tabs" style="margin-top: 20px;">
        <button class="tab-btn active" onclick="switchTab('reminders')">Reminders</button>
        <button class="tab-btn" onclick="switchTab('schedules')">Schedules</button>
      </div>
    </div>

    <div id="reminders-tab" class="tab-content active">
      <div class="card">
        <h2>➕ Create Scheduled Reminder</h2>

        <form id="reminderForm" onsubmit="event.preventDefault(); return handleSubmit();">
          <!-- A. Discord Configuration -->
          <div class="info-box">
            <h3>📱 Discord Configuration</h3>
          </div>

          <div class="form-group">
            <label for="channel">Target Channel *</label>
            <select id="channel" required>
              <option value="">Select a channel...</option>
            </select>
          </div>

          <div class="form-group">
            <label for="role">Role to Mention (Optional)</label>
            <select id="role">
              <option value="">No role - plain message</option>
            </select>
            <div class="help-text">The role will be mentioned before the message</div>
          </div>

          <!-- B. Reminder Configuration -->
          <div class="info-box">
            <h3>⚙️ Reminder Configuration</h3>
          </div>

          <div class="form-group">
            <label for="dateRangeMode">Active Date Range</label>
            <select id="dateRangeMode">
              <option value="none">None (default)</option>
              <option value="today">Today Only</option>
              <option value="start">Start Date</option>
              <option value="end">End Date</option>
              <option value="range">Start–End Date</option>
            </select>
          </div>

          <div id="dateRangeFields" style="display: none;">
            <div class="date-grid">
              <div class="form-group" id="startDateGroup">
                <label for="startDate">Start Date</label>
                <input type="date" id="startDate">
              </div>
              <div class="form-group" id="endDateGroup">
                <label for="endDate">End Date</label>
                <input type="date" id="endDate">
              </div>
            </div>
          </div>

          <div class="form-group">
            <label for="reminderType">Reminder Type</label>
            <select id="reminderType">
              <option value="specific">Specific Time (default)</option>
              <option value="interval">Interval</option>
            </select>
          </div>

          <div id="intervalFields" style="display: none;">
            <div class="form-group">
              <label for="interval">Interval Minutes</label>
              <input type="number" id="interval" min="5" value="15">
              <div class="help-text">Minimum: 5 minutes</div>
            </div>

            <div class="time-grid">
              <div class="form-group">
                <label for="intervalStartTime">Start Time *</label>
                <input type="time" id="intervalStartTime">
              </div>
              <div class="form-group">
                <label for="intervalEndTime">End Time *</label>
                <input type="time" id="intervalEndTime">
                <div class="help-text">Active time range for interval reminders</div>
              </div>
            </div>
          </div>

          <div id="specificTimeFields">
            <div class="specific-times-container">
              <label>Specific Times</label>
              <div class="help-text">Add one or more specific trigger times</div>
              <div style="display: flex; gap: 10px; margin-top: 10px;">
                <input type="time" id="newSpecificTime" style="width: 150px;">
                <button type="button" class="btn btn-success" onclick="addSpecificTime()">Add Time</button>
              </div>
              <div id="specificTimesList" class="specific-times-list"></div>
            </div>
          </div>

          <div id="frequencySection">
            <div class="form-group">
              <label for="frequencyMode">Frequency</label>
              <select id="frequencyMode">
                <option value="daily">Every Day (default)</option>
                <option value="today">Today Only</option>
                <option value="specific">Specific Days</option>
              </select>
            </div>

            <div id="specificDaysFields" style="display: none;">
              <div class="form-group">
                <label>Select Days</label>
                <div class="days-grid">
                  <label class="day-checkbox"><input type="checkbox" name="daysOfWeek" value="0"> Sun</label>
                  <label class="day-checkbox"><input type="checkbox" name="daysOfWeek" value="1"> Mon</label>
                  <label class="day-checkbox"><input type="checkbox" name="daysOfWeek" value="2"> Tue</label>
                  <label class="day-checkbox"><input type="checkbox" name="daysOfWeek" value="3"> Wed</label>
                  <label class="day-checkbox"><input type="checkbox" name="daysOfWeek" value="4"> Thu</label>
                  <label class="day-checkbox"><input type="checkbox" name="daysOfWeek" value="5"> Fri</label>
                  <label class="day-checkbox"><input type="checkbox" name="daysOfWeek" value="6"> Sat</label>
                </div>
              </div>
            </div>

            <div id="repeatWeeksField" style="display: none;">
              <div class="form-group">
                <label for="repeatWeeks">Every X Weeks</label>
                <select id="repeatWeeks">
                  <option value="1">1 week (default)</option>
                  <option value="2">2 weeks</option>
                  <option value="3">3 weeks</option>
                  <option value="4">4 weeks</option>
                  <option value="5">5 weeks</option>
                </select>
              </div>
            </div>
          </div>

          <!-- C. Message Configuration -->
          <div class="info-box">
            <h3>💬 Message Configuration</h3>
          </div>

          <div class="form-group">
            <label for="message">Main Reminder Message *</label>
            <textarea id="message" required>Boss will spawn now!</textarea>
            <div class="help-text">Sent as an embed. Use {time} for timestamp and {relative} for countdown</div>
          </div>

          <div class="embed-customization">
            <label>Main Reminder Embed Style</label>
            <div class="embed-grid">
              <div class="form-group">
                <label for="mainTitle">Title (with emoji)</label>
                <input type="text" id="mainTitle" value="🔔 Boss will spawn">
              </div>
              <div class="form-group">
                <label for="mainColor">Color</label>
                <input type="color" id="mainColor" value="#00ff00">
              </div>
            </div>
          </div>

          <div class="form-group">
            <div class="checkbox-group">
              <input type="checkbox" id="enablePreWarning">
              <label for="enablePreWarning">Enable Pre-Warning</label>
            </div>
          </div>

          <div id="preWarningFields" style="display: none;">
            <div class="form-group">
              <label for="preWarningMinutes">Pre-Warning Time (minutes)</label>
              <input type="number" id="preWarningMinutes" min="1" value="15">
              <div class="help-text">Warn this many minutes before the main reminder</div>
          </div>

            <div class="form-group">
              <label for="preWarningMessage">Pre-Warning Message</label>
              <textarea id="preWarningMessage">Boss will spawn at {time} ({relative}). Get ready!</textarea>
              <div class="help-text">Use {time} for specific time and {relative} for countdown</div>
            </div>

            <div class="embed-customization">
              <label>Pre-Warning Embed Style</label>
              <div class="embed-grid">
                <div class="form-group">
                  <label for="preWarningTitle">Title (with emoji)</label>
                  <input type="text" id="preWarningTitle" value="⚠️ Upcoming Boss Spawn">
                </div>
                <div class="form-group">
                  <label for="preWarningColor">Color</label>
                  <input type="color" id="preWarningColor" value="#ffaa00">
                </div>
              </div>
            </div>
          </div>

          <button type="submit" class="btn btn-primary">Create Reminder</button>
          <div id="alert" class="alert" style="margin-top: 15px;"></div>
        </form>
      </div>

      <!-- E. Reminder List -->
      <div class="card">
        <h2>📋 Active Reminders</h2>
        <div id="reminders">
          <p style="color: #718096;">No active reminders yet. Create one above!</p>
        </div>
      </div>

      <div class="card" id="inactiveSection" style="display: none;">
        <h2>💤 Inactive Reminders</h2>
        <p class="help-text" style="margin-bottom: 15px;">Reminders that have expired or are outside their active date range.</p>
        <div id="inactiveReminders">
        </div>
      </div>
    </div>

    <div id="schedules-tab" class="tab-content">
      <div class="card">
        <h2>📅 Create Schedule</h2>
        <div class="info-box">
          <h3>Schedule System</h3>
          <p>Create schedules that can be viewed in Discord using /reminder {schedule-name}. Each schedule can have multiple time entries with optional messages.</p>
        </div>

        <div id="scheduleAlert" class="alert"></div>

        <form id="scheduleForm">
          <div class="form-group">
            <label for="scheduleTitle">Schedule Title *</label>
            <input type="text" id="scheduleTitle" placeholder="e.g., Boss Spawn, Bounty, Reset" required>
            <div class="help-text">This will be the command name (e.g., /reminder boss_spawn)</div>
          </div>

          <div class="form-group">
            <label>Schedule Items</label>
            <div id="scheduleItems">
              <div class="schedule-item-row">
                <input type="time" name="scheduleTime" required>
                <input type="text" name="scheduleMessage" placeholder="Optional message (e.g., World Boss spawns!)">
                <button type="button" class="btn btn-danger" onclick="removeScheduleItem(this)" style="padding: 8px 12px;">X</button>
              </div>
            </div>
            <button type="button" class="btn btn-secondary" onclick="addScheduleItem()" style="margin-top: 10px;">+ Add Time Entry</button>
          </div>

          <button type="submit" class="btn btn-primary">Create Schedule</button>
        </form>
      </div>

      <div class="card">
        <h2>📋 Existing Schedules</h2>
        <div id="schedulesList">
          <p style="color: #718096;">No schedules yet. Create one above!</p>
        </div>
      </div>
    </div>
  </div>

  <script>
    let editingId = null;
    let specificTimes = [];
    let editingScheduleId = null;

    // Initialize form on page load
    document.addEventListener('DOMContentLoaded', function() {
      // Set up initial state for required attributes
      const intervalStartTime = document.getElementById('intervalStartTime');
      const intervalEndTime = document.getElementById('intervalEndTime');
      const startDate = document.getElementById('startDate');
      const endDate = document.getElementById('endDate');

      // Initially, interval fields are hidden and shouldn't be required
      intervalStartTime.required = false;
      intervalEndTime.required = false;

      // Date fields are also hidden initially
      startDate.required = false;
      endDate.required = false;

      // Set minimum date to today for date inputs
      const today = new Date().toISOString().split('T')[0];
      if (startDate) startDate.min = today;
      if (endDate) endDate.min = today;

      // Trigger initial UI updates
      updateDateRangeFields();
      updateReminderTypeFields();
      updateFrequencyFields();
    });

    // Load roles when channel changes
    document.getElementById('channel').addEventListener('change', async (e) => {
      const channelId = e.target.value;
      if (!channelId) return;

      try {
        const channels = await fetch('/api/channels').then(r => r.json());
        const channel = channels.find(c => c.id === channelId);

        if (channel && channel.guildId) {
          const roles = await fetch(\`/api/roles/\${channel.guildId}\`).then(r => r.json());
          const roleSelect = document.getElementById('role');

          roleSelect.innerHTML = '<option value="">No role - plain message</option>';

          if (roles.error) {
            console.error('Error loading roles:', roles.error);
            return;
          }

          roles.forEach(role => {
            const option = document.createElement('option');
            option.value = role.id;
            option.textContent = \`@\${role.name}\`;
            roleSelect.appendChild(option);
          });
        }
      } catch (error) {
        console.error('Error loading roles:', error);
      }
    });

    // Date range mode change handler
    document.getElementById('dateRangeMode').addEventListener('change', updateDateRangeFields);

    function updateDateRangeFields() {
      const mode = document.getElementById('dateRangeMode').value;
      const dateRangeFields = document.getElementById('dateRangeFields');
      const startDateGroup = document.getElementById('startDateGroup');
      const endDateGroup = document.getElementById('endDateGroup');
      const startDate = document.getElementById('startDate');
      const endDate = document.getElementById('endDate');
      const frequencyMode = document.getElementById('frequencyMode');

      if (mode === 'today') {
        dateRangeFields.style.display = 'none';
        // Set today's date automatically
        const today = new Date().toISOString().split('T')[0];
        if (startDate) startDate.value = today;
        if (endDate) endDate.value = today;
        // Remove required attribute
        if (startDate) startDate.required = false;
        if (endDate) endDate.required = false;
        // Set frequency to "Today Only" and disable it
        frequencyMode.value = 'today';
        frequencyMode.disabled = true;
      } else {
        dateRangeFields.style.display = mode !== 'none' ? 'block' : 'none';
        frequencyMode.disabled = false;

        if (mode === 'start') {
          startDateGroup.style.display = 'block';
          endDateGroup.style.display = 'none';
          // Set required for start date
          if (startDate) startDate.required = true;
          if (endDate) endDate.required = false;
          // Clear end date
          if (endDate) endDate.value = '';
        } else if (mode === 'end') {
          startDateGroup.style.display = 'none';
          endDateGroup.style.display = 'block';
          // Set required for end date
          if (startDate) startDate.required = false;
          if (endDate) endDate.required = true;
          // Clear start date
          if (startDate) startDate.value = '';
        } else if (mode === 'range') {
          startDateGroup.style.display = 'block';
          endDateGroup.style.display = 'block';
          // Both dates are required
          if (startDate) startDate.required = true;
          if (endDate) endDate.required = true;
        } else {
          // "None" mode
          if (startDate) {
            startDate.value = '';
            startDate.required = false;
          }
          if (endDate) {
            endDate.value = '';
            endDate.required = false;
          }
        }
      }

      updateFrequencyFields();
    }

    // Reminder type change handler
    document.getElementById('reminderType').addEventListener('change', updateReminderTypeFields);

    function updateReminderTypeFields() {
      const type = document.getElementById('reminderType').value;
      const intervalFields = document.getElementById('intervalFields');
      const specificTimeFields = document.getElementById('specificTimeFields');
      const intervalStartTime = document.getElementById('intervalStartTime');
      const intervalEndTime = document.getElementById('intervalEndTime');
      const intervalInput = document.getElementById('interval');

      if (type === 'interval') {
        intervalFields.style.display = 'block';
        specificTimeFields.style.display = 'none';
        // Add required attribute back
        intervalStartTime.required = true;
        intervalEndTime.required = true;
        // Set interval minimum based on mode
        if (intervalInput.value === '0') {
          intervalInput.value = '15';
        }
      } else {
        intervalFields.style.display = 'none';
        specificTimeFields.style.display = 'block';
        // Remove required attribute when hidden
        intervalStartTime.required = false;
        intervalEndTime.required = false;
        // Clear interval fields
        intervalStartTime.value = '';
        intervalEndTime.value = '';
      }
    }

    // Frequency mode change handler
    document.getElementById('frequencyMode').addEventListener('change', updateFrequencyFields);

    function updateFrequencyFields() {
      const frequencyMode = document.getElementById('frequencyMode').value;
      const dateRangeMode = document.getElementById('dateRangeMode').value;
      const specificDaysFields = document.getElementById('specificDaysFields');
      const repeatWeeksField = document.getElementById('repeatWeeksField');

      // Handle "Today Only" in frequency dropdown
      if (frequencyMode === 'today' || dateRangeMode === 'today') {
        specificDaysFields.style.display = 'none';
        repeatWeeksField.style.display = 'none';
        // Clear selected days
        document.querySelectorAll('input[name="daysOfWeek"]').forEach(cb => cb.checked = false);
      } else if (frequencyMode === 'specific') {
        specificDaysFields.style.display = 'block';
        repeatWeeksField.style.display = 'block';
      } else {
        specificDaysFields.style.display = 'none';
        repeatWeeksField.style.display = 'none';
        // Clear selected days
        document.querySelectorAll('input[name="daysOfWeek"]').forEach(cb => cb.checked = false);
      }
    }

    // Pre-warning checkbox handler
    document.getElementById('enablePreWarning').addEventListener('change', (e) => {
      document.getElementById('preWarningFields').style.display = e.target.checked ? 'block' : 'none';
    });

    function showAlert(message, type) {
      const alert = document.getElementById('alert');
      alert.textContent = message;
      alert.className = \`alert \${type}\`;
      alert.style.display = 'block';
      setTimeout(() => {
        alert.style.display = 'none';
      }, 5000);
    }

    async function loadStatus() {
      try {
        const status = await fetch('/api/status').then(r => r.json());
        document.getElementById('statusDot').className = \`status-dot \${status.online ? 'online' : 'offline'}\`;
        document.getElementById('statusText').textContent = status.online ? \`Online as \${status.username}\` : 'Offline';
        document.getElementById('serverCount').textContent = status.servers;
        document.getElementById('reminderCount').textContent = status.reminders;
        document.getElementById('scheduleCount').textContent = status.schedules || 0;
      } catch (error) {
        console.error('Failed to load status:', error);
      }
    }

    async function loadChannels() {
      try {
        const channels = await fetch('/api/channels').then(r => r.json());
        const select = document.getElementById('channel');
        select.innerHTML = '<option value="">Select a channel...</option>';

        if (channels.error) {
          showAlert(channels.error, 'error');
          return;
        }

        channels.forEach(channel => {
          const option = document.createElement('option');
          option.value = channel.id;
          option.textContent = \`\${channel.guild} - #\${channel.name}\`;
          select.appendChild(option);
        });
      } catch (error) {
        showAlert('Failed to load channels', 'error');
      }
    }

    async function loadReminders() {
      try {
        const response = await fetch('/api/reminders');
        if (!response.ok) {
          throw new Error('Failed to fetch reminders');
        }
        const reminders = await response.json();
        const container = document.getElementById('reminders');
        const inactiveContainer = document.getElementById('inactiveReminders');
        const inactiveSection = document.getElementById('inactiveSection');

        const activeReminders = reminders.filter(r => r.isActive !== false);
        const inactiveReminders = reminders.filter(r => r.isActive === false);

        if (activeReminders.length === 0) {
          container.innerHTML = '<p style="color: #718096;">No active reminders yet. Create one above!</p>';
        } else {
          container.innerHTML = activeReminders.map(r => renderReminderItem(r, false)).join('');
        }

        if (inactiveReminders.length > 0) {
          inactiveSection.style.display = 'block';
          inactiveContainer.innerHTML = inactiveReminders.map(r => renderReminderItem(r, true)).join('');
        } else {
          inactiveSection.style.display = 'none';
        }
      } catch (error) {
        console.error('Error loading reminders:', error);
        showAlert('Failed to load reminders', 'error');
      }
    }

    function renderReminderItem(r, isInactive) {
      let nextRunText = 'Calculating...';
      if (r.nextRun) {
        const nextRunDate = new Date(r.nextRun);
        nextRunText = nextRunDate.toLocaleString();

        // Add relative time if it's in the future
        const now = new Date();
        if (nextRunDate > now) {
          const diffMs = nextRunDate - now;
          const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
          const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

          if (diffHours > 0) {
            nextRunText += \` (in \${diffHours}h \${diffMinutes}m)\`;
          } else if (diffMinutes > 0) {
            nextRunText += \` (in \${diffMinutes}m)\`;
          } else {
            nextRunText += ' (now)';
          }
        }
      }

      const roleText = r.roleName ? \`<span class="reminder-badge role-badge">@\${r.roleName}</span>\` : (r.roleId ? \`<span class="reminder-badge role-badge" title="Role ID: \${r.roleId}">@Unknown Role</span>\` : '');

      // Date range badge
      let dateRangeText = '';
      switch(r.dateRangeMode) {
        case 'today':
          dateRangeText = '<span class="reminder-badge date-badge">Today Only</span>';
          break;
        case 'start':
          dateRangeText = \`<span class="reminder-badge date-badge">From: \${new Date(r.startDate).toLocaleDateString()}</span>\`;
          break;
        case 'end':
          dateRangeText = \`<span class="reminder-badge date-badge">Until: \${new Date(r.endDate).toLocaleDateString()}</span>\`;
          break;
        case 'range':
          dateRangeText = \`<span class="reminder-badge date-badge">\${new Date(r.startDate).toLocaleDateString()} - \${new Date(r.endDate).toLocaleDateString()}</span>\`;
          break;
      }

      // Time badge
      let timeText = '';
      if (r.useSpecificTimes && r.specificTimes && r.specificTimes.length > 0) {
        const timesDisplay = r.specificTimes.map(t => formatTime(t)).join(', ');
        timeText = \`<span class="reminder-badge time-badge">Times: \${timesDisplay}</span>\`;
      } else if (r.intervalMinutes > 0) {
        timeText = \`<span class="reminder-badge time-badge">Interval: \${r.intervalMinutes}min (\${formatTime(r.startTime)}-\${formatTime(r.endTime)})</span>\`;
      } else if (r.startTime) {
        timeText = \`<span class="reminder-badge time-badge">Time: \${formatTime(r.startTime)}</span>\`;
      }

      // Frequency badge
      let frequencyText = '';
      if (r.frequencyMode === 'specific' && r.daysOfWeek && r.daysOfWeek.length > 0) {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const days = r.daysOfWeek.map(d => dayNames[d]).join(', ');
        frequencyText = \`<span class="reminder-badge frequency-badge">Days: \${days}</span>\`;
      } else if (r.frequencyMode === 'today') {
        frequencyText = '<span class="reminder-badge frequency-badge">Today Only</span>';
      } else {
        frequencyText = '<span class="reminder-badge frequency-badge">Every Day</span>';
      }

      // Week badge
      let weekText = '';
      if (r.repeatWeeks > 1 && r.frequencyMode === 'specific') {
        weekText = \`<span class="reminder-badge week-badge">Every \${r.repeatWeeks} weeks</span>\`;
      }

      const firedAtText = r.firedAt ? \`<br><strong>Last Trigger:</strong> \${new Date(r.firedAt).toLocaleString()}\` : '';

      const actionButtons = isInactive 
        ? \`<button class="btn btn-success" onclick="reactivateReminder(\${r.id})">Reactivate</button>
           <button class="btn btn-danger" onclick="deleteReminder(\${r.id})">Delete</button>\`
        : \`<button class="btn btn-secondary" onclick="editReminder(\${r.id})">Edit</button>
           <button class="btn btn-danger" onclick="deleteReminder(\${r.id})">Delete</button>\`;

      return \`
        <div class="reminder-item\${isInactive ? ' inactive' : ''}">
          <div class="reminder-header">
            <div>
              <div class="reminder-title">#\${r.id} - \${r.guildName} - #\${r.channelName}</div>
            </div>
            <div class="reminder-actions">
              \${actionButtons}
            </div>
          </div>
          <div class="reminder-info">
            <strong>Message:</strong> \${r.message}
            \${isInactive ? '' : \`<br><strong>Next Run:</strong> \${nextRunText}\`}
            \${r.preWarningMinutes ? \`<br><strong>Pre-Warning:</strong> \${r.preWarningMinutes} min - "\${r.preWarningMessage}"\` : ''}
            \${firedAtText}
          </div>
          <div>
            \${dateRangeText}
            \${roleText}
            \${timeText}
            \${frequencyText}
            \${weekText}
          </div>
        </div>
      \`;
    }

    function formatTime(time) {
      if (!time) return '';
      let hours = time.hours;
      const minutes = time.minutes.toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      return \`\${hours}:\${minutes} \${ampm}\`;
    }

    async function handleSubmit() {
      const dateRangeMode = document.getElementById('dateRangeMode').value;
      const reminderType = document.getElementById('reminderType').value;
      const useSpecificTimes = reminderType === 'specific';
      const frequencyMode = document.getElementById('frequencyMode').value;

      // Basic validation
      const channel = document.getElementById('channel').value;
      const message = document.getElementById('message').value;

      if (!channel) {
        showAlert('Please select a channel', 'error');
        return false;
      }

      if (!message || message.trim() === '') {
        showAlert('Please enter a message', 'error');
        return false;
      }

      // Collect data based on reminder type
      const data = {
        channelId: channel,
        roleId: document.getElementById('role').value || null,
        message: message.trim(),
        mainTitle: document.getElementById('mainTitle').value,
        mainColor: document.getElementById('mainColor').value,
        dateRangeMode: dateRangeMode,
        frequencyMode: frequencyMode,
        repeatWeeks: document.getElementById('repeatWeeks').value,
        useSpecificTimes: useSpecificTimes,
        timezoneOffset: new Date().getTimezoneOffset(),
      };

      // Date range data - handle "Today Only" specially
      if (dateRangeMode === 'today') {
        const today = new Date().toISOString().split('T')[0];
        data.startDate = today;
        data.endDate = today;
      } else {
        if (dateRangeMode === 'start' || dateRangeMode === 'range') {
          const startDateVal = document.getElementById('startDate').value;
          if (startDateVal) {
            data.startDate = startDateVal;
          } else if (dateRangeMode === 'range') {
            showAlert('Start date is required for date range mode', 'error');
            return false;
          }
        }
        if (dateRangeMode === 'end' || dateRangeMode === 'range') {
          const endDateVal = document.getElementById('endDate').value;
          if (endDateVal) {
            data.endDate = endDateVal;
          } else if (dateRangeMode === 'range') {
            showAlert('End date is required for date range mode', 'error');
            return false;
          }
        }

        // Validate date range if both dates exist
        if (data.startDate && data.endDate && new Date(data.startDate) > new Date(data.endDate)) {
          showAlert('Start date must be before end date', 'error');
          return false;
        }
      }

      // Reminder type data
      if (useSpecificTimes) {
        if (specificTimes.length === 0) {
          showAlert('Please add at least one specific time', 'error');
          return false;
        }
        data.specificTimes = specificTimes;
      } else {
        data.intervalMinutes = document.getElementById('interval').value;
        data.startTime = document.getElementById('intervalStartTime').value;
        data.endTime = document.getElementById('intervalEndTime').value;

        // Validate interval mode
        if (!data.startTime) {
          showAlert('Start time is required for interval mode', 'error');
          return false;
        }

        const interval = parseInt(data.intervalMinutes);
        if (interval > 0) {
          if (!data.endTime) {
            showAlert('End time is required for interval reminders', 'error');
            return false;
          }
          if (interval < 5) {
            showAlert('Interval must be at least 5 minutes', 'error');
            return false;
          }
        }
      }

      // Frequency data
      if (frequencyMode === 'specific') {
        const selectedDays = Array.from(document.querySelectorAll('input[name="daysOfWeek"]:checked')).map(cb => parseInt(cb.value));
        if (selectedDays.length === 0) {
          showAlert('Please select at least one day for specific frequency', 'error');
          return false;
        }
        data.daysOfWeek = selectedDays;
      } else {
        data.daysOfWeek = null;
      }

      // Pre-warning data
      if (document.getElementById('enablePreWarning').checked) {
        const preWarningMinutes = document.getElementById('preWarningMinutes').value;
        const preWarningMessage = document.getElementById('preWarningMessage').value;

        if (!preWarningMinutes || preWarningMinutes < 1) {
          showAlert('Pre-warning time must be at least 1 minute', 'error');
          return false;
        }

        data.preWarningMinutes = preWarningMinutes;
        data.preWarningMessage = preWarningMessage;
        data.preWarningTitle = document.getElementById('preWarningTitle').value;
        data.preWarningColor = document.getElementById('preWarningColor').value;
      }

      try {
        const url = editingId ? \`/api/reminders/\${editingId}\` : '/api/reminders';
        const method = editingId ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        const result = await res.json();

        if (!res.ok || result.error) {
          showAlert(result.error || 'Failed to save reminder', 'error');
        } else {
          showAlert(editingId ? 'Reminder updated successfully!' : 'Reminder created successfully!', 'success');
          resetForm();
          editingId = null;
          loadReminders();
        }
      } catch (error) {
        console.error('Error saving reminder:', error);
        showAlert('Failed to save reminder: ' + error.message, 'error');
      }

      return false;
    }

    function resetForm() {
      document.getElementById('reminderForm').reset();
      document.getElementById('dateRangeMode').value = 'none';
      document.getElementById('reminderType').value = 'specific';
      document.getElementById('frequencyMode').value = 'daily';
      document.getElementById('enablePreWarning').checked = false;
      document.getElementById('interval').value = '15';
      document.getElementById('mainTitle').value = '🔔 Boss will spawn';
      document.getElementById('mainColor').value = '#00ff00';
      document.getElementById('preWarningTitle').value = '⚠️ Upcoming Boss Spawn';
      document.getElementById('preWarningColor').value = '#ffaa00';

      // Reset UI state
      updateDateRangeFields();
      updateReminderTypeFields();
      updateFrequencyFields();
      document.getElementById('preWarningFields').style.display = 'none';

      // Reset specific times
      specificTimes = [];
      renderSpecificTimes();
    }

    async function editReminder(id) {
      try {
        const res = await fetch('/api/reminders');
        const reminders = await res.json();
        const reminder = reminders.find(r => r.id === id);

        if (reminder) {
          editingId = id;

          // Load channel and role
          document.getElementById('channel').value = reminder.channelId;
          const changeEvent = new Event('change');
          document.getElementById('channel').dispatchEvent(changeEvent);

          setTimeout(() => {
            if (reminder.roleId) {
              document.getElementById('role').value = reminder.roleId;
            }
          }, 500);

          // Set date range mode
          document.getElementById('dateRangeMode').value = reminder.dateRangeMode || 'none';
          updateDateRangeFields();

          if (reminder.startDate) {
            document.getElementById('startDate').value = new Date(reminder.startDate).toISOString().split('T')[0];
          }
          if (reminder.endDate) {
            document.getElementById('endDate').value = new Date(reminder.endDate).toISOString().split('T')[0];
          }

          // Set reminder type
          const reminderType = reminder.useSpecificTimes ? 'specific' : 'interval';
          document.getElementById('reminderType').value = reminderType;
          updateReminderTypeFields();

          if (reminderType === 'interval') {
            document.getElementById('interval').value = reminder.intervalMinutes;
            if (reminder.startTime) {
              document.getElementById('intervalStartTime').value = \`\${reminder.startTime.hours.toString().padStart(2, '0')}:\${reminder.startTime.minutes.toString().padStart(2, '0')}\`;
            }
            if (reminder.endTime) {
              document.getElementById('intervalEndTime').value = \`\${reminder.endTime.hours.toString().padStart(2, '0')}:\${reminder.endTime.minutes.toString().padStart(2, '0')}\`;
            }
          } else {
            specificTimes = reminder.specificTimes ? reminder.specificTimes.map(t => 
              \`\${t.hours.toString().padStart(2, '0')}:\${t.minutes.toString().padStart(2, '0')}\`
            ) : [];
            renderSpecificTimes();
          }

          // Set frequency
          document.getElementById('frequencyMode').value = reminder.frequencyMode || 'daily';
          updateFrequencyFields();

          if (reminder.frequencyMode === 'specific' && reminder.daysOfWeek) {
            document.querySelectorAll('input[name="daysOfWeek"]').forEach(cb => {
              cb.checked = reminder.daysOfWeek.includes(parseInt(cb.value));
            });
          }

          // Set repeat weeks
          document.getElementById('repeatWeeks').value = reminder.repeatWeeks || 1;

          // Set messages
          document.getElementById('message').value = reminder.message;
          document.getElementById('mainTitle').value = reminder.mainTitle || '';
          document.getElementById('mainColor').value = reminder.mainColor || '#00ff00';

          // Set pre-warning
          if (reminder.preWarningMinutes) {
            document.getElementById('enablePreWarning').checked = true;
            document.getElementById('preWarningFields').style.display = 'block';
            document.getElementById('preWarningMinutes').value = reminder.preWarningMinutes;
            document.getElementById('preWarningMessage').value = reminder.preWarningMessage || '';
            document.getElementById('preWarningTitle').value = reminder.preWarningTitle || '';
            document.getElementById('preWarningColor').value = reminder.preWarningColor || '#ffaa00';
          } else {
            document.getElementById('enablePreWarning').checked = false;
            document.getElementById('preWarningFields').style.display = 'none';
          }

          window.scrollTo({ top: 0, behavior: 'smooth' });
          showAlert('Editing reminder #' + id, 'success');
        }
      } catch (error) {
        showAlert('Failed to load reminder', 'error');
      }
    }

    async function deleteReminder(id) {
      if (!confirm('Are you sure you want to delete this reminder?')) return;

      try {
        const res = await fetch(\`/api/reminders/\${id}\`, { method: 'DELETE' });
        if (res.ok) {
          showAlert('Reminder deleted successfully!', 'success');
          loadReminders();
        } else {
          showAlert('Failed to delete reminder', 'error');
        }
      } catch (error) {
        showAlert('Failed to delete reminder', 'error');
      }
    }

    async function reactivateReminder(id) {
      try {
        const res = await fetch(\`/api/reminders/\${id}/reactivate\`, { method: 'POST' });
        const result = await res.json();
        if (res.ok) {
          showAlert('Reminder reactivated!', 'success');
          loadReminders();
        } else {
          showAlert(result.error || 'Failed to reactivate reminder', 'error');
        }
      } catch (error) {
        showAlert('Failed to reactivate reminder', 'error');
      }
    }

    // Specific times handling
    function addSpecificTime() {
      const timeInput = document.getElementById('newSpecificTime');
      const time = timeInput.value;
      if (!time) {
        showAlert('Please select a time', 'error');
        return;
      }

      if (specificTimes.includes(time)) {
        showAlert('This time is already added', 'error');
        return;
      }

      specificTimes.push(time);
      specificTimes.sort();
      renderSpecificTimes();
      timeInput.value = '';
    }

    function removeSpecificTime(time) {
      specificTimes = specificTimes.filter(t => t !== time);
      renderSpecificTimes();
    }

    function renderSpecificTimes() {
      const container = document.getElementById('specificTimesList');
      if (specificTimes.length === 0) {
        container.innerHTML = '<span style="color: #718096;">No times added yet</span>';
        return;
      }
      container.innerHTML = specificTimes.map(time => {
        const [hours, minutes] = time.split(':').map(Number);
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 || 12;
        return \`<span class="specific-time-tag">\${displayHours}:\${minutes.toString().padStart(2, '0')} \${ampm}<button type="button" onclick="removeSpecificTime('\${time}')">&times;</button></span>\`;
      }).join('');
    }

    // Tab switching
    function switchTab(tabName) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

      document.querySelector(\`[onclick="switchTab('\${tabName}')"]\`).classList.add('active');
      document.getElementById(\`\${tabName}-tab\`).classList.add('active');

      if (tabName === 'schedules') {
        loadSchedules();
      }
    }

    // Schedule management
    function addScheduleItem() {
      const container = document.getElementById('scheduleItems');
      const row = document.createElement('div');
      row.className = 'schedule-item-row';
      row.innerHTML = \`
        <input type="time" name="scheduleTime" required>
        <input type="text" name="scheduleMessage" placeholder="Optional message">
        <button type="button" class="btn btn-danger" onclick="removeScheduleItem(this)" style="padding: 8px 12px;">X</button>
      \`;
      container.appendChild(row);
    }

    function removeScheduleItem(btn) {
      const rows = document.querySelectorAll('.schedule-item-row');
      if (rows.length > 1) {
        btn.closest('.schedule-item-row').remove();
      } else {
        showScheduleAlert('At least one time entry is required', 'error');
      }
    }

    function showScheduleAlert(message, type) {
      const alert = document.getElementById('scheduleAlert');
      alert.textContent = message;
      alert.className = \`alert \${type}\`;
      alert.style.display = 'block';
      setTimeout(() => {
        alert.style.display = 'none';
      }, 5000);
    }

    document.getElementById('scheduleForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const title = document.getElementById('scheduleTitle').value;
      const timeInputs = document.querySelectorAll('input[name="scheduleTime"]');
      const messageInputs = document.querySelectorAll('input[name="scheduleMessage"]');

      const items = [];
      timeInputs.forEach((input, i) => {
        if (input.value) {
          const [hours, minutes] = input.value.split(':').map(Number);
          const today = new Date();
          today.setHours(hours, minutes, 0, 0);
          const timestamp = Math.floor(today.getTime() / 1000);

          items.push({
            time: input.value,
            timestamp: timestamp,
            message: messageInputs[i].value || ''
          });
        }
      });

      if (items.length === 0) {
        showScheduleAlert('At least one time entry is required', 'error');
        return;
      }

      try {
        const url = editingScheduleId ? \`/api/schedules/\${editingScheduleId}\` : '/api/schedules';
        const method = editingScheduleId ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, items })
        });

        const result = await res.json();

        if (!res.ok || result.error) {
          showScheduleAlert(result.error || 'Failed to save schedule', 'error');
        } else {
          showScheduleAlert(editingScheduleId ? 'Schedule updated!' : 'Schedule created!', 'success');
          document.getElementById('scheduleForm').reset();
          document.getElementById('scheduleItems').innerHTML = \`
            <div class="schedule-item-row">
              <input type="time" name="scheduleTime" required>
              <input type="text" name="scheduleMessage" placeholder="Optional message">
              <button type="button" class="btn btn-danger" onclick="removeScheduleItem(this)" style="padding: 8px 12px;">X</button>
            </div>
          \`;
          editingScheduleId = null;
          loadSchedules();
        }
      } catch (error) {
        showScheduleAlert('Failed to save schedule: ' + error.message, 'error');
      }
    });

    async function loadSchedules() {
      try {
        const schedules = await fetch('/api/schedules').then(r => r.json());
        const container = document.getElementById('schedulesList');

        if (schedules.length === 0) {
          container.innerHTML = '<p style="color: #718096;">No schedules yet. Create one above!</p>';
          return;
        }

        container.innerHTML = schedules.map(s => {
          const itemsHtml = s.items.map(item => {
            const [hours, minutes] = item.time.split(':').map(Number);
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const displayHours = hours % 12 || 12;
            return \`<div style="margin: 4px 0;"><strong>\${displayHours}:\${minutes.toString().padStart(2, '0')} \${ampm}</strong> - \${item.message || '(no message)'}</div>\`;
          }).join('');

          return \`
            <div class="schedule-item">
              <div class="reminder-header">
                <div>
                  <div class="reminder-title">\${s.title}</div>
                  <div class="help-text">Command: /reminder \${s.id}</div>
                </div>
                <div class="reminder-actions">
                  <button class="btn btn-secondary" onclick="editSchedule('\${s.id}')">Edit</button>
                  <button class="btn btn-danger" onclick="deleteSchedule('\${s.id}')">Delete</button>
                </div>
              </div>
              <div class="reminder-info" style="margin-top: 10px;">
                \${itemsHtml}
              </div>
            </div>
          \`;
        }).join('');
      } catch (error) {
        console.error('Error loading schedules:', error);
      }
    }

    async function editSchedule(id) {
      try {
        const schedules = await fetch('/api/schedules').then(r => r.json());
        const schedule = schedules.find(s => s.id === id);

        if (schedule) {
          editingScheduleId = id;
          document.getElementById('scheduleTitle').value = schedule.title;

          const container = document.getElementById('scheduleItems');
          container.innerHTML = schedule.items.map(item => \`
            <div class="schedule-item-row">
              <input type="time" name="scheduleTime" value="\${item.time}" required>
              <input type="text" name="scheduleMessage" value="\${item.message || ''}" placeholder="Optional message">
              <button type="button" class="btn btn-danger" onclick="removeScheduleItem(this)" style="padding: 8px 12px;">X</button>
            </div>
          \`).join('');

          window.scrollTo({ top: 0, behavior: 'smooth' });
          showScheduleAlert('Editing schedule: ' + schedule.title, 'success');
        }
      } catch (error) {
        showScheduleAlert('Failed to load schedule', 'error');
      }
    }

    async function deleteSchedule(id) {
      if (!confirm('Are you sure you want to delete this schedule?')) return;

      try {
        const res = await fetch(\`/api/schedules/\${id}\`, { method: 'DELETE' });
        if (res.ok) {
          showScheduleAlert('Schedule deleted!', 'success');
          loadSchedules();
        } else {
          showScheduleAlert('Failed to delete schedule', 'error');
        }
      } catch (error) {
        showScheduleAlert('Failed to delete schedule', 'error');
      }
    }

    // Initial load
    loadStatus();
    loadChannels();
    loadReminders();

    // Refresh for accurate next run display
    setInterval(loadReminders, 10000);
    setInterval(loadStatus, 10000);
  </script>
</body>
</html>
  `);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Web UI running at http://localhost:${PORT}`);
  console.log("⏰ Reminder bot active");
});

client.once("ready", async () => {
  console.log(`✅ Bot online as ${client.user.tag}`);

  console.log("📂 Loading reminders from JSONBin...");
  await loadRemindersFromJsonBin();

  console.log("📂 Loading schedules from JSONBin...");
  await loadSchedulesFromJsonBin();

  await registerCommands();
  rescheduleAllReminders();
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === "reminder") {
      const scheduleName = interaction.options.getString("schedule");

      if (!scheduleName) {
        return interaction.reply({
          content: "Please specify a schedule name.",
          ephemeral: true,
        });
      }

      const schedule = schedules.get(scheduleName);

      if (!schedule) {
        return interaction.reply({
          content: `Schedule "${scheduleName}" not found.`,
          ephemeral: true,
        });
      }

      if (!schedule.items || schedule.items.length === 0) {
        return interaction.reply({
          content: `Schedule "${schedule.title}" has no items yet.`,
          ephemeral: true,
        });
      }

      const embed = new Discord.EmbedBuilder()
        .setColor(0x667eea)
        .setTitle(`📅 ${schedule.title}`)
        .setTimestamp();

      schedule.items.forEach((item, index) => {
        const timeDisplay = item.time
          ? `<t:${item.timestamp}:t>`
          : "No time set";
        const messageDisplay = item.message || "";
        embed.addFields({
          name: `${index + 1}. ${timeDisplay}`,
          value: messageDisplay || "No additional message",
          inline: false,
        });
      });

      await interaction.reply({ embeds: [embed] });
    }
  } catch (error) {
    console.error("Error handling command:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ An error occurred",
        ephemeral: true,
      });
    }
  }
});

client.on("error", (error) => console.error("Discord error:", error));
process.on("unhandledRejection", (error) =>
  console.error("Unhandled rejection:", error),
);

client
  .login(process.env.DISCORD_TOKEN)
  .catch((err) => console.error("Failed to login:", err));
