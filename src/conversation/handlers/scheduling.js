const { sendTextMessage, sendInteractiveButtons, sendWithMenuButton } = require('../../messages/sender');
const { logMessage } = require('../../db/conversations');
const { createMeeting, updateMeeting, getLatestMeeting } = require('../../db/meetings');
const { updateUserMetadata } = require('../../db/users');
const { generateResponse } = require('../../llm/provider');
const { logger } = require('../../utils/logger');
const { STATES } = require('../states');

const DATE_PARSE_PROMPT = `Extract a preferred meeting date (and optionally time) from the user's message and return ONLY valid JSON.
Today's date is ${new Date().toISOString().split('T')[0]}.

Rules:
- Parse relative expressions: "tomorrow", "next Monday", "this Friday", "in 2 days"
- Parse explicit dates: "March 28", "28th", "28/03"
- If the user says the date is fine/same/unchanged/keep it, return {"keep": true}
- If no clear date found, return {"error": "unclear"}
- If a time is ALSO present in the message (e.g. "March 31 at 5pm", "tomorrow 2:30 PM"), extract it too
- For vague times: morning = 10:00 AM, afternoon = 2:00 PM, evening = 6:00 PM
- Also extract timezone if mentioned (PKT, EST, GMT+5, etc.)

Return format: {"date": "YYYY-MM-DD", "display": "Monday, March 28", "time": "5:00 PM" or null, "timezone": "PKT" or null, "timeDisplay": "5:00 PM" or null}`;

const TIME_PARSE_PROMPT = `Extract a preferred meeting time from the user's message and return ONLY valid JSON.

Rules:
- Parse "2pm", "2:30 PM", "afternoon", "morning", "evening", "14:00", "after lunch"
- For vague times: morning = 10:00 AM, afternoon = 2:00 PM, evening = 6:00 PM
- Also extract timezone if mentioned (PKT, EST, GMT+5, etc.)
- If no clear time found, return {"error": "unclear"}

Return format: {"time": "2:00 PM", "timezone": "PKT" or null, "display": "2:00 PM PKT"}`;

/**
 * Entry point - called when we want to start the scheduling flow.
 * Creates the meeting record and asks for preferred date.
 */
async function startScheduling(user, topic) {
  const meeting = await createMeeting(user.id, user.phone_number, topic);
  await updateUserMetadata(user.id, { currentMeetingId: meeting.id });

  await sendWithMenuButton(
    user.phone_number,
    '📅 Let\'s schedule a call!\n\n' +
      'What date works best for you?\n\n' +
      'You can say things like:\n' +
      '• _Tomorrow_\n' +
      '• _This Friday_\n' +
      '• _March 30_\n' +
      '• _March 31 at 5 PM_ (date + time together)'
  );
  await logMessage(user.id, 'Starting meeting scheduling - asked for date', 'assistant');

  return STATES.SCHEDULE_COLLECT_DATE;
}

async function handleScheduling(user, message) {
  switch (user.state) {
    case STATES.SCHEDULE_COLLECT_DATE:
      return handleCollectDate(user, message);
    case STATES.SCHEDULE_COLLECT_TIME:
      return handleCollectTime(user, message);
    case STATES.SCHEDULE_CONFIRM:
      return handleConfirm(user, message);
    default:
      return startScheduling(user, 'General inquiry');
  }
}

async function handleCollectDate(user, message) {
  const text = (message.text || '').trim();

  // Parse date with LLM
  let parsed;
  try {
    const response = await generateResponse(DATE_PARSE_PROMPT, [{ role: 'user', content: text }]);
    const jsonMatch = response.match(/\{[\s\S]*?\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'unclear' };
  } catch {
    parsed = { error: 'unclear' };
  }

  // User wants to keep existing date - skip straight to time collection
  if (parsed.keep) {
    const existingDate = user.metadata?.schedulingDate || 'your chosen date';
    await sendWithMenuButton(
      user.phone_number,
      `👍 Keeping *${existingDate}*. What time works for you?\n\n` +
        'You can say things like:\n' +
        '• _2 PM_\n' +
        '• _Morning_\n' +
        '• _After 3 PM_'
    );
    await logMessage(user.id, `Date unchanged (${existingDate}), asked for new time`, 'assistant');
    return STATES.SCHEDULE_COLLECT_TIME;
  }

  if (parsed.error) {
    await sendWithMenuButton(
      user.phone_number,
      '🤔 I couldn\'t quite catch that date. Could you be more specific?\n\n' +
        'For example: _Tomorrow_, _This Friday_, _March 30_\n\n' +
        'Or say _"date is fine"_ to keep your current date.'
    );
    return STATES.SCHEDULE_COLLECT_DATE;
  }

  // Save parsed date to the meeting record
  const meetingId = user.metadata?.currentMeetingId;
  const updates = { preferred_date: parsed.date };

  // If user gave date AND time in one message, skip the time step
  if (parsed.time) {
    if (meetingId) {
      await updateMeeting(meetingId, {
        ...updates,
        preferred_time: parsed.time,
        preferred_timezone: parsed.timezone || null,
      });
    }
    await updateUserMetadata(user.id, {
      schedulingDate: parsed.display,
      schedulingTime: parsed.timeDisplay || parsed.time,
    });

    await sendInteractiveButtons(
      user.phone_number,
      `✅ Got it!\n\n*Date:* ${parsed.display}\n*Time:* ${parsed.timeDisplay || parsed.time}\n\nShall I confirm this meeting request?`,
      [
        { id: 'sched_confirm', title: '✅ Confirm' },
        { id: 'sched_change', title: '✏️ Change Details' },
        { id: 'sched_cancel', title: '❌ Cancel' },
      ]
    );
    await logMessage(user.id, `Meeting date+time set in one step: ${parsed.display} ${parsed.timeDisplay || parsed.time}`, 'assistant');
    return STATES.SCHEDULE_CONFIRM;
  }

  if (meetingId) {
    await updateMeeting(meetingId, updates);
  }
  await updateUserMetadata(user.id, { schedulingDate: parsed.display });

  await sendWithMenuButton(
    user.phone_number,
    `👍 *${parsed.display}* - noted!\n\n` +
      'What time works for you?\n\n' +
      'You can say things like:\n' +
      '• _2 PM_\n' +
      '• _Morning_\n' +
      '• _After 3 PM_'
  );
  await logMessage(user.id, `Meeting date set: ${parsed.display}`, 'assistant');

  return STATES.SCHEDULE_COLLECT_TIME;
}

async function handleCollectTime(user, message) {
  const text = (message.text || '').trim();

  // Parse time with LLM
  let parsed;
  try {
    const response = await generateResponse(TIME_PARSE_PROMPT, [{ role: 'user', content: text }]);
    const jsonMatch = response.match(/\{[\s\S]*?\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'unclear' };
  } catch {
    parsed = { error: 'unclear' };
  }

  if (parsed.error) {
    await sendWithMenuButton(
      user.phone_number,
      '🤔 I didn\'t catch a time from that. Could you be more specific?\n\n' +
        'For example: _2 PM_, _Morning_, _After 3 PM_, _14:30_'
    );
    return STATES.SCHEDULE_COLLECT_TIME;
  }

  // Save parsed time to the meeting record
  const meetingId = user.metadata?.currentMeetingId;
  if (meetingId) {
    await updateMeeting(meetingId, {
      preferred_time: parsed.time,
      preferred_timezone: parsed.timezone || null,
    });
  }
  await updateUserMetadata(user.id, { schedulingTime: parsed.display });

  const date = user.metadata?.schedulingDate || 'your preferred date';

  await sendInteractiveButtons(
    user.phone_number,
    `✅ Got it!\n\n*Date:* ${date}\n*Time:* ${parsed.display}\n\nShall I confirm this meeting request?`,
    [
      { id: 'sched_confirm', title: '✅ Confirm' },
      { id: 'sched_change', title: '✏️ Change Details' },
      { id: 'sched_cancel', title: '❌ Cancel' },
    ]
  );
  await logMessage(user.id, `Meeting time set: ${parsed.display}`, 'assistant');

  return STATES.SCHEDULE_CONFIRM;
}

async function handleConfirm(user, message) {
  const buttonId = message.buttonId || '';

  if (buttonId === 'sched_cancel') {
    const meetingId = user.metadata?.currentMeetingId;
    if (meetingId) await updateMeeting(meetingId, { status: 'cancelled' });

    await sendWithMenuButton(
      user.phone_number,
      'No problem! The meeting request has been cancelled.'
    );
    await logMessage(user.id, 'Meeting cancelled by user', 'assistant');
    return STATES.GENERAL_CHAT;
  }

  if (buttonId === 'sched_change') {
    const date = user.metadata?.schedulingDate || '?';
    const time = user.metadata?.schedulingTime || '?';
    await sendInteractiveButtons(
      user.phone_number,
      `What would you like to change?\n\n📅 *Date:* ${date}\n🕐 *Time:* ${time}`,
      [
        { id: 'sched_edit_date', title: '📅 Change Date' },
        { id: 'sched_edit_time', title: '🕐 Change Time' },
      ]
    );
    return STATES.SCHEDULE_CONFIRM;
  }

  if (buttonId === 'sched_edit_date') {
    await sendWithMenuButton(
      user.phone_number,
      '📅 What date would you like instead?\n\nFor example: _Tomorrow_, _This Friday_, _March 30_'
    );
    return STATES.SCHEDULE_COLLECT_DATE;
  }

  if (buttonId === 'sched_edit_time') {
    await sendWithMenuButton(
      user.phone_number,
      '🕐 What time would you like instead?\n\nFor example: _2 PM_, _Morning_, _After 3 PM_'
    );
    return STATES.SCHEDULE_COLLECT_TIME;
  }

  // Confirm the meeting
  const meetingId = user.metadata?.currentMeetingId;
  const date = user.metadata?.schedulingDate || '';
  const time = user.metadata?.schedulingTime || '';

  if (meetingId) {
    await updateMeeting(meetingId, { status: 'confirmed' });
  }

  await sendWithMenuButton(
    user.phone_number,
    '🎉 *Meeting confirmed!*\n\n' +
      `📅 *Date:* ${date}\n` +
      `🕐 *Time:* ${time}\n\n` +
      'Our team will reach out to you at this number to finalise the details.'
  );
  await logMessage(user.id, `Meeting confirmed: ${date} at ${time}`, 'assistant');

  return STATES.GENERAL_CHAT;
}

module.exports = { handleScheduling, startScheduling };
