const Discord = require("discord.js");
const express = require("express");

const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID;
const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY;

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

async function saveReminders() {
  if (!JSONBIN_BIN_ID || !JSONBIN_API_KEY) {
    console.error('JSONBin credentials not configured, cannot save');
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
    
    const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_API_KEY
      },
      body: JSON.stringify({ reminders: data, counter: reminderCounter })
    });
    
    if (!response.ok) {
      console.error('Failed to save to JSONBin:', response.status, response.statusText);
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
    console.error('JSONBin credentials not configured');
    return;
  }
  
  try {
    const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
      headers: {
        'X-Master-Key': JSONBIN_API_KEY
      }
    });
    
    if (!response.ok) {
      console.error('Failed to load from JSONBin:', response.status, response.statusText);
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
          preWarningMinutes: savedReminder.preWarningMinutes ? parseInt(savedReminder.preWarningMinutes) : null,
          timezoneOffset: parseInt(savedReminder.timezoneOffset) || 0,
          startDate: savedReminder.startDate
            ? new Date(savedReminder.startDate)
            : null,
          endDate: savedReminder.endDate
            ? new Date(savedReminder.endDate)
            : null,
          daysOfWeek: savedReminder.daysOfWeek ? savedReminder.daysOfWeek.map(d => parseInt(d)) : null,
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

function rescheduleAllReminders() {
  console.log("Rescheduling all reminders...");
  reminders.forEach((reminder, id) => {
    scheduleReminder(id, reminder);
  });
  console.log(`Rescheduled ${reminders.size} reminders`);
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

function isWithinDateRange(date, startDate, endDate) {
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);

  if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    if (checkDate < start) return false;
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    if (checkDate > end) return false;
  }

  return true;
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
    if (!isWithinDateRange(now, reminder.startDate, reminder.endDate)) {
      console.log(`Reminder ${reminderId} outside date range, skipping`);
      return;
    }

    // For one-time reminders, use the scheduled time, otherwise calculate next
    const reminderTime = isOneTimeFire
      ? new Date(reminder.nextRun)
      : getNextScheduledTime(
          reminder.startTime,
          reminder.endTime,
          reminder.intervalMinutes || 1440,
          reminder.timezoneOffset || 0,
        );

    // Replace placeholders in main message
    let mainMessage = reminder.message;
    mainMessage = mainMessage.replace(
      /\{time\}/g,
      getDiscordTimestamp(reminderTime.getTime(), "t"),
    );
    mainMessage = mainMessage.replace(
      /\{relative\}/g,
      getDiscordTimestamp(reminderTime.getTime(), "R"),
    );

    const messageContent = roleMention
      ? `${roleMention}${mainMessage}`
      : mainMessage;

    const mainColor = parseInt(
      (reminder.mainColor || "#00ff00").replace("#", ""),
      16,
    );
    const embed = new Discord.EmbedBuilder()
      .setColor(mainColor)
      .setTitle(reminder.mainTitle || "🔔 Reminder!")
      .setDescription(messageContent)
      .setTimestamp();

    // Different footer for one-time vs recurring
    if (reminder.isOneTime) {
      embed.setFooter({ text: `Reminder ID: ${reminderId} | One-time` });
    } else if (reminder.intervalMinutes === 0 && reminder.daysOfWeek) {
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const days = reminder.daysOfWeek.map((d) => dayNames[d]).join(", ");
      embed.setFooter({
        text: `Reminder ID: ${reminderId} | Daily at ${formatTime(reminder.startTime)} on ${days}`,
      });
    } else {
      embed.setFooter({
        text: `Reminder ID: ${reminderId} | Every ${reminder.intervalMinutes} min`,
      });
      embed.addFields({
        name: "Active Hours",
        value: `${formatTime(reminder.startTime)} - ${formatTime(reminder.endTime)}`,
      });
    }

    if (reminder.startDate || reminder.endDate) {
      const dateRange = [];
      if (reminder.startDate)
        dateRange.push(`From: ${reminder.startDate.toLocaleDateString()}`);
      if (reminder.endDate)
        dateRange.push(`Until: ${reminder.endDate.toLocaleDateString()}`);
      embed.addFields({ name: "Active Dates", value: dateRange.join("\n") });
    }

    await channel.send({ embeds: [embed] });

    // If this is a true one-time reminder (no days), mark as inactive
    if (reminder.isOneTime) {
      reminder.isActive = false;
      reminder.firedAt = Date.now();
      if (reminder.intervalId) clearInterval(reminder.intervalId);
      await saveReminders();
      console.log(`One-time reminder ${reminderId} fired and marked inactive`);
    }
  };

  // Handle one-time reminders (interval=0, no days selected)
  if (reminder.isOneTime) {
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

    reminder.nextRun = now.getTime() + delayMs;

    reminder.oneTimeTimeoutId = setTimeout(
      async () => {
        await sendMainReminder(true);
      },
      Math.max(delayMs, 0),
    );

    console.log(
      `Scheduled one-time reminder ${reminderId}: fires in ${delayMinutes} minutes`,
    );
    return;
  }

  // Handle daily reminders at specific time (interval=0, days selected)
  if (
    reminder.intervalMinutes === 0 &&
    reminder.daysOfWeek &&
    reminder.daysOfWeek.length > 0
  ) {
    let lastTriggeredDay = -1;

    reminder.intervalId = setInterval(async () => {
      const now = new Date();
      if (!isWithinDateRange(now, reminder.startDate, reminder.endDate)) return;

      const timezoneOffset = reminder.timezoneOffset || 0;
      const userNow = new Date(now.getTime() - timezoneOffset * 60 * 1000);
      const userHours = userNow.getUTCHours();
      const userMinutes = userNow.getUTCMinutes();
      const userDay = userNow.getUTCDay();

      if (!reminder.daysOfWeek.includes(userDay)) return;

      const currentMinutes = userHours * 60 + userMinutes;
      const targetMinutes =
        reminder.startTime.hours * 60 + reminder.startTime.minutes;

      // Trigger at exact time, once per day
      if (currentMinutes === targetMinutes && lastTriggeredDay !== userDay) {
        lastTriggeredDay = userDay;
        await sendMainReminder(false);
      }
    }, 10000);

    console.log(
      `Scheduled daily reminder ${reminderId}: at ${formatTime(reminder.startTime)} on selected days`,
    );
    return;
  }

  // Regular recurring reminders (interval > 0)
  let lastTriggeredMinute = -1;

  // Function to schedule the next pre-warning
  const scheduleNextPreWarning = () => {
    if (!reminder.preWarningMinutes || !reminder.preWarningMessage) return;
    
    // Clear any existing pre-warning timeout
    if (reminder.preWarningTimeoutId) {
      clearTimeout(reminder.preWarningTimeoutId);
      reminder.preWarningTimeoutId = null;
    }
    
    const now = Date.now();
    const preWarningTime = reminder.nextRun - reminder.preWarningMinutes * 60 * 1000;
    
    if (preWarningTime > now) {
      const delay = preWarningTime - now;
      reminder.preWarningTimeoutId = setTimeout(async () => {
        const checkDate = new Date();
        if (!isWithinDateRange(checkDate, reminder.startDate, reminder.endDate)) return;
        if (reminder.daysOfWeek && reminder.daysOfWeek.length > 0) {
          const timezoneOffset = reminder.timezoneOffset || 0;
          const userNow = new Date(checkDate.getTime() - timezoneOffset * 60 * 1000);
          const userDay = userNow.getUTCDay();
          if (!reminder.daysOfWeek.includes(userDay)) return;
        }

        const eventTimestamp = reminder.nextRun;
        let preWarningContent = reminder.preWarningMessage;
        preWarningContent = preWarningContent.replace(/\{time\}/g, getDiscordTimestamp(eventTimestamp, "t"));
        preWarningContent = preWarningContent.replace(/\{relative\}/g, getDiscordTimestamp(eventTimestamp, "R"));

        if (roleMention) {
          preWarningContent = `${roleMention}${preWarningContent}`;
        }

        const preColor = parseInt((reminder.preWarningColor || "#ffaa00").replace("#", ""), 16);
        const preEmbed = new Discord.EmbedBuilder()
          .setColor(preColor)
          .setTitle(reminder.preWarningTitle || "⚠️ Upcoming Event")
          .setDescription(preWarningContent)
          .setFooter({ text: `Reminder ID: ${reminderId}` })
          .setTimestamp();

        preEmbed.addFields({
          name: "Main Event",
          value: `${getDiscordTimestamp(eventTimestamp, "R")} (${getDiscordTimestamp(eventTimestamp, "t")})`,
        });

        await channel.send({ embeds: [preEmbed] });
      }, delay);
      console.log(`Scheduled pre-warning for reminder ${reminderId} at ${new Date(preWarningTime).toLocaleString()}`);
    }
  };

  // Function to update nextRun time
  const updateNextRun = () => {
    reminder.nextRun = getNextScheduledTime(
      reminder.startTime,
      reminder.endTime,
      reminder.intervalMinutes,
      reminder.timezoneOffset || 0,
    ).getTime();
    
    // Schedule the next pre-warning for the updated nextRun
    scheduleNextPreWarning();
  };

  reminder.intervalId = setInterval(async () => {
    const now = new Date();
    if (!isWithinDateRange(now, reminder.startDate, reminder.endDate)) return;

    const timezoneOffset = reminder.timezoneOffset || 0;
    const userNow = new Date(now.getTime() - timezoneOffset * 60 * 1000);
    const userHours = userNow.getUTCHours();
    const userMinutes = userNow.getUTCMinutes();
    const currentMinutes = userHours * 60 + userMinutes;

    const startMinutes =
      reminder.startTime.hours * 60 + reminder.startTime.minutes;
    const endMinutes = reminder.endTime.hours * 60 + reminder.endTime.minutes;

    if (currentMinutes < startMinutes || currentMinutes > endMinutes) return;

    if (reminder.daysOfWeek && reminder.daysOfWeek.length > 0) {
      const userDay = userNow.getUTCDay();
      if (!reminder.daysOfWeek.includes(userDay)) return;
    }

    const minutesSinceStart = currentMinutes - startMinutes;

    if (
      minutesSinceStart >= 0 &&
      minutesSinceStart % reminder.intervalMinutes === 0 &&
      currentMinutes !== lastTriggeredMinute
    ) {
      lastTriggeredMinute = currentMinutes;
      await sendMainReminder(false);
      
      // Update nextRun and schedule next pre-warning after main reminder fires
      updateNextRun();
    }
  }, 10000);

  // Set initial nextRun
  reminder.nextRun = getNextScheduledTime(
    reminder.startTime,
    reminder.endTime,
    reminder.intervalMinutes,
    reminder.timezoneOffset || 0,
  ).getTime();

  // Schedule initial pre-warning
  scheduleNextPreWarning();

  console.log(
    `Scheduled reminder ${reminderId}: Next run at ${new Date(reminder.nextRun).toLocaleString()}`,
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
  const reminderList = Array.from(reminders.entries()).map(([id, reminder]) => {
    const channel = client.channels.cache.get(reminder.channelId);
    const returnData = {
      id,
      channelName: channel?.name || "Unknown",
      guildName: channel?.guild?.name || "Unknown",
      ...reminder,
      intervalId: undefined,
      preWarningTimeoutId: undefined,
    };

    // Convert dates to ISO strings for JSON
    if (reminder.startDate)
      returnData.startDate = reminder.startDate.toISOString();
    if (reminder.endDate) returnData.endDate = reminder.endDate.toISOString();

    return returnData;
  });
  res.json(reminderList);
});

app.post("/api/reminders", async (req, res) => {
  try {
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
      timezoneOffset,
      daysOfWeek,
      mainTitle,
      mainColor,
      preWarningTitle,
      preWarningColor,
    } = req.body;

    // Validation
    if (!channelId || !message) {
      return res.status(400).json({
        error: "Missing required fields: channelId, message",
      });
    }

    if (!startTime) {
      return res.status(400).json({ error: "Start time is required" });
    }

    const parsedIntervalMinutes = parseInt(intervalMinutes) || 0;

    // Interval must be 0 (one-time) or at least 5 minutes
    if (parsedIntervalMinutes !== 0 && parsedIntervalMinutes < 5) {
      return res.status(400).json({
        error: "Interval must be 0 (one-time) or at least 5 minutes",
      });
    }

    // End time is required only if interval > 0
    if (parsedIntervalMinutes > 0 && !endTime) {
      return res
        .status(400)
        .json({ error: "End time is required for recurring reminders" });
    }

    if (
      preWarningMinutes &&
      parsedIntervalMinutes > 0 &&
      preWarningMinutes >= parsedIntervalMinutes
    ) {
      return res
        .status(400)
        .json({ error: "Pre-warning time must be less than interval" });
    }

    // Parse times
    const parsedStartTime = parseTimeString(startTime);
    const parsedEndTime = endTime ? parseTimeString(endTime) : parsedStartTime;

    if (!parsedStartTime) {
      return res
        .status(400)
        .json({ error: "Invalid time format. Use HH:MM (24-hour format)" });
    }

    // Determine if this is a one-time reminder
    const isOneTime = parsedIntervalMinutes === 0;
    const hasDays = Array.isArray(daysOfWeek) && daysOfWeek.length > 0;

    const reminderId = reminderCounter++;
    const reminder = {
      id: reminderId,
      channelId,
      message,
      intervalMinutes: parsedIntervalMinutes,
      preWarningMinutes: preWarningMinutes ? parseInt(preWarningMinutes) : null,
      preWarningMessage: preWarningMessage || null,
      roleId: roleId || null,
      startTime: parsedStartTime,
      endTime: parsedEndTime,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      timezoneOffset: parseInt(timezoneOffset) || 0,
      daysOfWeek: hasDays ? daysOfWeek.map((d) => parseInt(d)) : null,
      mainTitle: mainTitle || null,
      mainColor: mainColor || null,
      preWarningTitle: preWarningTitle || null,
      preWarningColor: preWarningColor || null,
      nextRun: null,
      intervalId: null,
      preWarningTimeoutId: null,
      createdAt: Date.now(),
      isOneTime: isOneTime && !hasDays,
      isActive: true,
      firedAt: null,
    };

    reminders.set(reminderId, reminder);
    scheduleReminder(reminderId, reminder);
    await saveReminders();

    // Return reminder without circular references (intervalId, preWarningTimeoutId)
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

    const {
      intervalMinutes,
      message,
      preWarningMinutes,
      preWarningMessage,
      roleId,
      startTime,
      endTime,
      startDate,
      endDate,
      daysOfWeek,
      mainTitle,
      mainColor,
      preWarningTitle,
      preWarningColor,
    } = req.body;

    if (intervalMinutes) reminder.intervalMinutes = parseInt(intervalMinutes);
    if (message) reminder.message = message;
    if (preWarningMinutes !== undefined) {
      reminder.preWarningMinutes = preWarningMinutes
        ? parseInt(preWarningMinutes)
        : null;
    }
    if (preWarningMessage !== undefined) {
      reminder.preWarningMessage = preWarningMessage || null;
    }
    if (roleId !== undefined) {
      reminder.roleId = roleId || null;
    }
    if (startTime !== undefined) {
      reminder.startTime = parseTimeString(startTime);
    }
    if (endTime !== undefined) {
      reminder.endTime = parseTimeString(endTime);
    }
    if (startDate !== undefined) {
      reminder.startDate = startDate ? new Date(startDate) : null;
    }
    if (endDate !== undefined) {
      reminder.endDate = endDate ? new Date(endDate) : null;
    }
    if (daysOfWeek !== undefined) {
      reminder.daysOfWeek = Array.isArray(daysOfWeek)
        ? daysOfWeek.map((d) => parseInt(d))
        : null;
    }
    if (mainTitle !== undefined) {
      reminder.mainTitle = mainTitle || null;
    }
    if (mainColor !== undefined) {
      reminder.mainColor = mainColor || null;
    }
    if (preWarningTitle !== undefined) {
      reminder.preWarningTitle = preWarningTitle || null;
    }
    if (preWarningColor !== undefined) {
      reminder.preWarningColor = preWarningColor || null;
    }

    scheduleReminder(reminderId, reminder);
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

  reminder.isActive = true;
  reminder.firedAt = null;

  scheduleReminder(reminderId, reminder);
  await saveReminders();

  res.json({ success: true, message: "Reminder reactivated" });
});

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

    .btn-success {
      background: #48bb78;
      color: white;
    }

    .btn-success:hover {
      background: #38a169;
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

    .schedule-badge {
      background: #38b2ac;
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

    .days-badge {
      background: #9f7aea;
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
      </div>
    </div>

    <div class="card">
      <h2>➕ Create Scheduled Reminder</h2>

      <div class="info-box">
        <h3>📅 Scheduled Mode Only</h3>
        <p>All reminders run at specific times within your set active hours. For example: 5:00 PM to 7:00 PM, every 30 minutes will fire at 5:00 PM, 5:30 PM, 6:00 PM, 6:30 PM, and 7:00 PM.</p>
      </div>

      <div id="alert" class="alert"></div>

      <form id="reminderForm">
        <div class="form-group">
          <label for="channel">Channel *</label>
          <select id="channel" required>
            <option value="">Select a channel...</option>
          </select>
        </div>

        <div class="form-group">
          <label for="role">Role to Tag (Optional)</label>
          <select id="role">
            <option value="">No role - plain message</option>
          </select>
          <div class="help-text">The role will be mentioned before the message (e.g., @hunters boss spawn now!)</div>
        </div>

        <div class="time-grid">
          <div class="form-group">
            <label for="startTime">Start Time *</label>
            <input type="time" id="startTime" required>
            <div class="help-text">First reminder of the day (24-hour format)</div>
          </div>
          <div class="form-group">
            <label for="endTime">End Time</label>
            <input type="time" id="endTime">
            <div class="help-text">Optional for one-time reminders (interval = 0)</div>
          </div>
        </div>

        <div class="form-group">
          <label for="interval">Interval (minutes)</label>
          <input type="number" id="interval" min="0" value="0">
          <div class="help-text">0 = one-time at start time only. Min 5 for recurring reminders.</div>
        </div>

        <div class="date-grid">
          <div class="form-group">
            <label for="startDate">Start Date (Optional)</label>
            <input type="date" id="startDate">
            <div class="help-text">Begin reminders from this date</div>
          </div>
          <div class="form-group">
            <label for="endDate">End Date (Optional)</label>
            <input type="date" id="endDate">
            <div class="help-text">Stop reminders after this date</div>
          </div>
        </div>

        <div class="form-group">
          <label>Active Days (Optional)</label>
          <div class="days-grid">
            <label class="day-checkbox"><input type="checkbox" name="daysOfWeek" value="0"> Sun</label>
            <label class="day-checkbox"><input type="checkbox" name="daysOfWeek" value="1"> Mon</label>
            <label class="day-checkbox"><input type="checkbox" name="daysOfWeek" value="2"> Tue</label>
            <label class="day-checkbox"><input type="checkbox" name="daysOfWeek" value="3"> Wed</label>
            <label class="day-checkbox"><input type="checkbox" name="daysOfWeek" value="4"> Thu</label>
            <label class="day-checkbox"><input type="checkbox" name="daysOfWeek" value="5"> Fri</label>
            <label class="day-checkbox"><input type="checkbox" name="daysOfWeek" value="6"> Sat</label>
          </div>
          <div class="help-text">Select days for recurring reminders. Leave unchecked with interval 0 for a one-time reminder.</div>
        </div>

        <div class="form-group">
          <label for="message">Main Message *</label>
          <textarea id="message" required>Boss will spawn at {time}!</textarea>
          <div class="help-text">Use {time} for specific time and {relative} for countdown</div>
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
            <input type="number" id="preWarningMinutes" min="1" placeholder="15">
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
      </form>
    </div>

    <div class="card">
      <h2>📋 Active Reminders</h2>
      <div id="reminders">
        <p style="color: #718096;">No active reminders yet. Create one above!</p>
      </div>
    </div>

    <div class="card" id="inactiveSection" style="display: none;">
      <h2>💤 Inactive Reminders</h2>
      <p class="help-text" style="margin-bottom: 15px;">One-time reminders that have already fired. You can reactivate them to fire again.</p>
      <div id="inactiveReminders">
      </div>
    </div>
  </div>

  <script>
    let editingId = null;

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
        const reminders = await fetch('/api/reminders').then(r => r.json());
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
      const nextRun = r.nextRun ? new Date(r.nextRun).toLocaleString() : 'Calculating...';
      const roleText = r.roleId ? \`<span class="reminder-badge role-badge">@Role Tagged</span>\` : '';
      const scheduleText = \`<span class="reminder-badge schedule-badge">📅 \${formatTime(r.startTime)} - \${formatTime(r.endTime)}</span>\`;

      const dateRangeText = (r.startDate || r.endDate) 
        ? \`<span class="reminder-badge">🗓️ \${r.startDate ? new Date(r.startDate).toLocaleDateString() : 'Start'} - \${r.endDate ? new Date(r.endDate).toLocaleDateString() : 'End'}</span>\`
        : '';

      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const daysText = (r.daysOfWeek && r.daysOfWeek.length > 0)
        ? \`<span class="reminder-badge days-badge">📆 \${r.daysOfWeek.map(d => dayNames[d]).join(', ')}</span>\`
        : '';

      const firedAtText = r.firedAt ? \`<br><strong>Fired:</strong> \${new Date(r.firedAt).toLocaleString()}\` : '';
      const typeText = r.isOneTime ? '<span class="reminder-badge" style="background:#a0aec0;">One-time</span>' : '';

      const intervalText = r.intervalMinutes === 0 
        ? (r.daysOfWeek && r.daysOfWeek.length > 0 ? 'Daily at start time' : 'One-time')
        : \`Every \${r.intervalMinutes} minutes\`;

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
            <strong>Message:</strong> \${r.message}<br>
            <strong>Type:</strong> \${intervalText}
            \${isInactive ? '' : \`<br><strong>Next Run:</strong> \${nextRun}\`}
            \${r.preWarningMinutes ? \`<br><strong>Pre-Warning:</strong> \${r.preWarningMinutes} min - "\${r.preWarningMessage}"\` : ''}
            \${firedAtText}
          </div>
          <div>
            \${scheduleText}
            \${roleText}
            \${dateRangeText}
            \${daysText}
            \${typeText}
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

    document.getElementById('enablePreWarning').addEventListener('change', (e) => {
      document.getElementById('preWarningFields').style.display = e.target.checked ? 'block' : 'none';
    });

    document.getElementById('reminderForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const selectedDays = Array.from(document.querySelectorAll('input[name="daysOfWeek"]:checked')).map(cb => parseInt(cb.value));
      const mainTitleVal = document.getElementById('mainTitle').value;
      const mainColorVal = document.getElementById('mainColor').value;

      const data = {
        channelId: document.getElementById('channel').value,
        intervalMinutes: document.getElementById('interval').value,
        message: document.getElementById('message').value,
        roleId: document.getElementById('role').value || null,
        startTime: document.getElementById('startTime').value,
        endTime: document.getElementById('endTime').value,
        timezoneOffset: new Date().getTimezoneOffset(),
        daysOfWeek: selectedDays.length > 0 ? selectedDays : null,
        mainTitle: mainTitleVal || null,
        mainColor: mainColorVal !== '#00ff00' ? mainColorVal : null
      };

      const startDate = document.getElementById('startDate').value;
      const endDate = document.getElementById('endDate').value;
      if (startDate) data.startDate = startDate;
      if (endDate) data.endDate = endDate;

      if (document.getElementById('enablePreWarning').checked) {
        data.preWarningMinutes = document.getElementById('preWarningMinutes').value;
        data.preWarningMessage = document.getElementById('preWarningMessage').value || null;
        const preTitleVal = document.getElementById('preWarningTitle').value;
        const preColorVal = document.getElementById('preWarningColor').value;
        data.preWarningTitle = preTitleVal || null;
        data.preWarningColor = preColorVal !== '#ffaa00' ? preColorVal : null;
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
          document.getElementById('reminderForm').reset();
          document.getElementById('preWarningFields').style.display = 'none';
          document.querySelectorAll('input[name="daysOfWeek"]').forEach(cb => cb.checked = false);
          document.getElementById('mainColor').value = '#00ff00';
          document.getElementById('preWarningColor').value = '#ffaa00';
          editingId = null;
          loadReminders();
        }
      } catch (error) {
        console.error('Error saving reminder:', error);
        showAlert('Failed to save reminder: ' + error.message, 'error');
      }
    });

    async function editReminder(id) {
      try {
        const res = await fetch('/api/reminders');
        const reminders = await res.json();
        const reminder = reminders.find(r => r.id === id);

        if (reminder) {
          editingId = id;
          document.getElementById('channel').value = reminder.channelId;
          document.getElementById('interval').value = reminder.intervalMinutes;
          document.getElementById('message').value = reminder.message;

          if (reminder.roleId) {
            const changeEvent = new Event('change');
            document.getElementById('channel').dispatchEvent(changeEvent);
            setTimeout(() => {
              document.getElementById('role').value = reminder.roleId;
            }, 500);
          }

          if (reminder.startTime) {
            document.getElementById('startTime').value = \`\${reminder.startTime.hours.toString().padStart(2, '0')}:\${reminder.startTime.minutes.toString().padStart(2, '0')}\`;
          }
          if (reminder.endTime) {
            document.getElementById('endTime').value = \`\${reminder.endTime.hours.toString().padStart(2, '0')}:\${reminder.endTime.minutes.toString().padStart(2, '0')}\`;
          }

          if (reminder.startDate) {
            document.getElementById('startDate').value = new Date(reminder.startDate).toISOString().split('T')[0];
          }
          if (reminder.endDate) {
            document.getElementById('endDate').value = new Date(reminder.endDate).toISOString().split('T')[0];
          }

          if (reminder.preWarningMinutes) {
            document.getElementById('enablePreWarning').checked = true;
            document.getElementById('preWarningFields').style.display = 'block';
            document.getElementById('preWarningMinutes').value = reminder.preWarningMinutes;
            document.getElementById('preWarningMessage').value = reminder.preWarningMessage;
            document.getElementById('preWarningTitle').value = reminder.preWarningTitle || '';
            document.getElementById('preWarningColor').value = reminder.preWarningColor || '#ffaa00';
          }

          // Set embed customization
          document.getElementById('mainTitle').value = reminder.mainTitle || '';
          document.getElementById('mainColor').value = reminder.mainColor || '#00ff00';

          // Set days of week checkboxes
          document.querySelectorAll('input[name="daysOfWeek"]').forEach(cb => {
            cb.checked = reminder.daysOfWeek && reminder.daysOfWeek.includes(parseInt(cb.value));
          });

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
          showAlert('Reminder reactivated! It will fire at the next scheduled time.', 'success');
          loadReminders();
        } else {
          showAlert(result.error || 'Failed to reactivate reminder', 'error');
        }
      } catch (error) {
        showAlert('Failed to reactivate reminder', 'error');
      }
    }

    // Initial load
    loadStatus();
    loadChannels();
    loadReminders();

    // Refresh more frequently for accurate next run display
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

// Discord bot commands
const commands = [
  {
    name: "reminder",
    description: "Manage reminders (Admin only)",
    options: [
      {
        name: "list",
        description: "List all reminders",
        type: Discord.ApplicationCommandOptionType.Subcommand,
      },
      {
        name: "stop",
        description: "Stop a reminder",
        type: Discord.ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "id",
            description: "Reminder ID",
            type: Discord.ApplicationCommandOptionType.Integer,
            required: true,
          },
        ],
      },
    ],
  },
];

client.once("ready", async () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
  try {
    await client.application.commands.set(commands);
    console.log("✅ Slash commands registered");
  } catch (error) {
    console.error("❌ Error registering commands:", error);
  }

  console.log("📂 Loading reminders from JSONBin...");
  await loadRemindersFromJsonBin();
  rescheduleAllReminders();
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === "reminder") {
      // Check if user has administrator permission
      if (
        !interaction.member.permissions.has(
          Discord.PermissionFlagsBits.Administrator,
        )
      ) {
        return interaction.reply({
          content:
            "❌ Only server administrators can manage reminders. Please use the web interface or ask an admin for help.",
          ephemeral: true,
        });
      }

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "list") {
        const channelReminders = Array.from(reminders.values()).filter(
          (r) => r.channelId === interaction.channel.id,
        );

        if (channelReminders.length === 0) {
          return interaction.reply({
            content:
              "No reminders in this channel. Use the web UI to create one!",
            ephemeral: true,
          });
        }

        const embed = new Discord.EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle("📋 Active Reminders")
          .setDescription(
            `${channelReminders.length} reminder(s) in this channel`,
          );

        channelReminders.forEach((r) => {
          const roleText = r.roleId ? ` | Tags: <@&${r.roleId}>` : "";
          const scheduleText = ` | 📅 ${formatTime(r.startTime)} - ${formatTime(r.endTime)}`;
          embed.addFields({
            name: `Reminder #${r.id}`,
            value: `**Interval:** ${r.intervalMinutes} min\n**Message:** ${r.message}${roleText}${scheduleText}`,
          });
        });

        await interaction.reply({ embeds: [embed] });
      }

      if (subcommand === "stop") {
        const id = interaction.options.getInteger("id");
        const reminder = reminders.get(id);

        if (!reminder || reminder.channelId !== interaction.channel.id) {
          return interaction.reply({
            content: "Reminder not found in this channel",
            ephemeral: true,
          });
        }

        if (reminder.intervalId) clearInterval(reminder.intervalId);
        if (reminder.preWarningTimeoutId)
          clearTimeout(reminder.preWarningTimeoutId);
        reminders.delete(id);
        await saveReminders();

        await interaction.reply(`✅ Reminder #${id} stopped!`);
      }
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
