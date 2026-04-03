import nodemailer from "nodemailer";
import { config } from "../config/index.js";
import { createCalendarEvent } from "./calendar.js";
import type { AppointmentDetails, BookingResult } from "./calendar.js";

export type { AppointmentDetails, BookingResult };

function createTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: config.receptionist.gmailUser,
      pass: config.receptionist.gmailAppPassword,
    },
  });
}

export async function sendConfirmationEmail(
  details: AppointmentDetails,
  result: BookingResult
): Promise<void> {
  if (!config.receptionist.gmailUser || !config.receptionist.gmailAppPassword) {
    console.warn("[receptionist] Gmail not configured — skipping confirmation email");
    return;
  }

  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"Wavelength AI" <${config.receptionist.gmailUser}>`,
    to: details.callerEmail,
    subject: "Your Wavelength AI Consultation is Confirmed",
    text: [
      `Hi ${details.callerName},`,
      ``,
      `Thank you for reaching out to Wavelength AI! Your consultation has been confirmed.`,
      ``,
      `Appointment Details:`,
      `  Date & Time: ${result.humanReadableDatetime ?? details.preferredDatetime}`,
      `  Topic: ${details.inquiryType}`,
      ``,
      `The Wavelength AI team will reach out shortly to confirm details and prepare for your call.`,
      ``,
      `If you need to reschedule, simply reply to this email.`,
      ``,
      `Best regards,`,
      `Wavelength AI`,
      `${config.receptionist.gmailUser}`,
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#222">
        <div style="background:#1a1a2e;padding:24px;border-radius:8px 8px 0 0">
          <h2 style="color:#fff;margin:0;font-size:20px">Wavelength AI</h2>
          <p style="color:#aaa;margin:4px 0 0">AI Automation for BC Businesses</p>
        </div>
        <div style="border:1px solid #e0e0e0;border-top:none;padding:28px;border-radius:0 0 8px 8px">
          <p>Hi <strong>${details.callerName}</strong>,</p>
          <p>Your consultation has been confirmed. Here are the details:</p>
          <table style="background:#f8f8f8;border-radius:6px;padding:16px;width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 12px;color:#555;width:120px">Date &amp; Time</td><td style="padding:6px 12px;font-weight:600">${result.humanReadableDatetime ?? details.preferredDatetime}</td></tr>
            <tr><td style="padding:6px 12px;color:#555">Topic</td><td style="padding:6px 12px">${details.inquiryType}</td></tr>
          </table>
          <p>The Wavelength AI team will be in touch to confirm and prepare. If you need to reschedule, simply reply to this email.</p>
          <p style="margin-top:32px;color:#888;font-size:13px">Wavelength AI &bull; Fraser Valley &amp; Kelowna, BC</p>
        </div>
      </div>
    `,
  });
}

export async function sendNotificationEmail(
  details: AppointmentDetails,
  result: BookingResult
): Promise<void> {
  if (!config.receptionist.gmailUser || !config.receptionist.gmailAppPassword) {
    console.warn("[receptionist] Gmail not configured — skipping notification email");
    return;
  }

  const to = config.receptionist.dannyEmail || config.receptionist.gmailUser;
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"JARVIS Receptionist" <${config.receptionist.gmailUser}>`,
    to,
    subject: `New Booking — ${details.callerName}`,
    text: [
      `Hey Danny,`,
      ``,
      `A new consultation was just booked via the Wavelength AI receptionist.`,
      ``,
      `Caller Details:`,
      `  Name:  ${details.callerName}`,
      `  Phone: ${details.callerPhone}`,
      `  Email: ${details.callerEmail}`,
      `  Time:  ${result.humanReadableDatetime ?? details.preferredDatetime}`,
      `  Inquiry: ${details.inquiryType}`,
      ``,
      result.calendarEventUrl ? `Calendar Event: ${result.calendarEventUrl}` : `(Calendar event creation failed)`,
      ``,
      `— JARVIS Receptionist`,
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#222">
        <div style="background:#1a1a2e;padding:24px;border-radius:8px 8px 0 0">
          <h2 style="color:#fff;margin:0;font-size:20px">New Booking</h2>
          <p style="color:#aaa;margin:4px 0 0">Wavelength AI Receptionist</p>
        </div>
        <div style="border:1px solid #e0e0e0;border-top:none;padding:28px;border-radius:0 0 8px 8px">
          <p>Hey Danny, you have a new consultation booked.</p>
          <table style="background:#f8f8f8;border-radius:6px;padding:16px;width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 12px;color:#555;width:90px">Name</td><td style="padding:6px 12px;font-weight:600">${details.callerName}</td></tr>
            <tr><td style="padding:6px 12px;color:#555">Phone</td><td style="padding:6px 12px">${details.callerPhone}</td></tr>
            <tr><td style="padding:6px 12px;color:#555">Email</td><td style="padding:6px 12px">${details.callerEmail}</td></tr>
            <tr><td style="padding:6px 12px;color:#555">Time</td><td style="padding:6px 12px;font-weight:600">${result.humanReadableDatetime ?? details.preferredDatetime}</td></tr>
            <tr><td style="padding:6px 12px;color:#555">Inquiry</td><td style="padding:6px 12px">${details.inquiryType}</td></tr>
          </table>
          ${result.calendarEventUrl
            ? `<p><a href="${result.calendarEventUrl}" style="color:#4a6cf7">View Calendar Event →</a></p>`
            : `<p style="color:#d44">Calendar event creation failed — check logs.</p>`
          }
          <p style="margin-top:32px;color:#888;font-size:13px">JARVIS Receptionist</p>
        </div>
      </div>
    `,
  });
}

export async function bookAppointment(details: AppointmentDetails): Promise<BookingResult> {
  // Step 1: Create calendar event
  const result = await createCalendarEvent(details);

  // Step 2: Send both emails in parallel (don't block on email failures)
  try {
    await Promise.all([
      sendConfirmationEmail(details, result),
      sendNotificationEmail(details, result),
    ]);
  } catch (emailErr) {
    const msg = emailErr instanceof Error ? emailErr.message : "Unknown error";
    console.error("[receptionist] Email sending failed (partial):", msg);
    // Return calendar result — the appointment IS booked even if email fails
  }

  return result;
}
