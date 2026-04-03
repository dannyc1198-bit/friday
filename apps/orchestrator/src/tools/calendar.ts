import { google } from "googleapis";
import { readFileSync } from "fs";
import { config } from "../config/index.js";

export interface AppointmentDetails {
  callerName: string;
  callerPhone: string;
  callerEmail: string;
  preferredDatetime: string; // ISO 8601
  inquiryType: string;
  timezone: string; // e.g. "America/Vancouver"
}

export interface BookingResult {
  success: boolean;
  calendarEventId?: string;
  calendarEventUrl?: string;
  humanReadableDatetime?: string;
  error?: string;
}

function getAuth() {
  let serviceAccountJson: string;

  if (config.receptionist.googleServiceAccountJson) {
    // base64-encoded JSON in env var
    serviceAccountJson = Buffer.from(
      config.receptionist.googleServiceAccountJson,
      "base64"
    ).toString("utf-8");
  } else if (config.receptionist.googleServiceAccountPath) {
    // Path to JSON file
    serviceAccountJson = readFileSync(config.receptionist.googleServiceAccountPath, "utf-8");
  } else {
    throw new Error("No Google service account configured. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_PATH.");
  }

  const credentials = JSON.parse(serviceAccountJson);

  return new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
}

function formatHumanReadable(isoDatetime: string, timezone: string): string {
  try {
    const date = new Date(isoDatetime);
    return date.toLocaleString("en-CA", {
      timeZone: timezone,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return isoDatetime;
  }
}

export async function createCalendarEvent(
  details: AppointmentDetails
): Promise<BookingResult> {
  try {
    const auth = getAuth();
    const calendar = google.calendar({ version: "v3", auth });

    const startTime = new Date(details.preferredDatetime);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // +1 hour

    const event = await calendar.events.insert({
      calendarId: config.receptionist.calendarId,
      requestBody: {
        summary: `Wavelength AI Consultation — ${details.callerName}`,
        description: [
          `Caller: ${details.callerName}`,
          `Phone: ${details.callerPhone}`,
          `Email: ${details.callerEmail}`,
          `Inquiry: ${details.inquiryType}`,
          ``,
          `Booked via Wavelength AI Virtual Receptionist`,
        ].join("\n"),
        start: {
          dateTime: startTime.toISOString(),
          timeZone: details.timezone,
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: details.timezone,
        },
        attendees: [{ email: details.callerEmail, displayName: details.callerName }],
        reminders: {
          useDefault: false,
          overrides: [
            { method: "email", minutes: 60 },
            { method: "popup", minutes: 30 },
          ],
        },
      },
    });

    return {
      success: true,
      calendarEventId: event.data.id ?? undefined,
      calendarEventUrl: event.data.htmlLink ?? undefined,
      humanReadableDatetime: formatHumanReadable(details.preferredDatetime, details.timezone),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[calendar] Failed to create event:", message);
    return { success: false, error: message };
  }
}
