import type { FastifyPluginAsync } from "fastify";
import { config } from "../config/index.js";
import { bookAppointment } from "../tools/receptionist.js";
import type { AppointmentDetails } from "../tools/receptionist.js";

// Shape of the VAPI server-side function call webhook body
interface VapiWebhookBody {
  message?: {
    type?: string;
    functionCall?: {
      name?: string;
      parameters?: Record<string, unknown>;
    };
    // VAPI sometimes uses toolCall instead of functionCall
    toolCall?: {
      function?: {
        name?: string;
        arguments?: string | Record<string, unknown>;
      };
    };
  };
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function vapiResult(msg: string) {
  return { result: msg };
}

export const receptionistRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET /api/receptionist/status ────────────────────────────
  app.get("/status", async () => {
    const calendarConfigured = !!(
      config.receptionist.googleServiceAccountJson ||
      config.receptionist.googleServiceAccountPath
    );
    const emailConfigured = !!(
      config.receptionist.gmailUser && config.receptionist.gmailAppPassword
    );

    return {
      ok: true,
      service: "Wavelength AI Virtual Receptionist",
      calendar: calendarConfigured ? "configured" : "not configured — set GOOGLE_SERVICE_ACCOUNT_JSON",
      email: emailConfigured ? "configured" : "not configured — set GMAIL_USER + GMAIL_APP_PASSWORD",
      vapiAssistantId: config.receptionist.vapiAssistantId || "not set — run setup-receptionist script",
      webhookUrl: `${config.receptionist.ngrokUrl}/api/receptionist/book`,
    };
  });

  // ─── POST /api/receptionist/book ─────────────────────────────
  // Receives VAPI server-side function calls when Aria books an appointment
  app.post<{ Body: VapiWebhookBody }>("/book", async (request, reply) => {
    // Validate webhook secret
    const secret = request.headers["x-vapi-secret"];
    if (
      config.receptionist.webhookSecret &&
      secret !== config.receptionist.webhookSecret
    ) {
      reply.code(401);
      return { error: "Unauthorized" };
    }

    const body = request.body;
    app.log.info({ body }, "[receptionist] Incoming VAPI webhook");

    // Extract parameters — handle both functionCall and toolCall formats
    let params: Record<string, unknown> | undefined;
    let functionName: string | undefined;

    if (body?.message?.functionCall) {
      functionName = body.message.functionCall.name;
      params = body.message.functionCall.parameters;
    } else if (body?.message?.toolCall?.function) {
      functionName = body.message.toolCall.function.name;
      const args = body.message.toolCall.function.arguments;
      params = typeof args === "string" ? JSON.parse(args) : args;
    }

    // Only handle book_appointment calls
    if (functionName !== "book_appointment") {
      app.log.warn({ functionName }, "[receptionist] Unknown function call");
      return vapiResult("I'm sorry, I encountered an unexpected request. Please try again.");
    }

    if (!params) {
      return vapiResult("I'm sorry, I didn't receive the appointment details. Could you please confirm your information again?");
    }

    // Validate required fields
    const callerName = String(params.caller_name || "").trim();
    const callerPhone = String(params.caller_phone || "").trim();
    const callerEmail = String(params.caller_email || "").trim();
    const preferredDatetime = String(params.preferred_datetime || "").trim();
    const inquiryType = String(params.inquiry_type || "").trim();
    const timezone = String(params.timezone || "America/Vancouver").trim();

    if (!callerName || !callerPhone || !callerEmail || !preferredDatetime || !inquiryType) {
      return vapiResult(
        "I'm missing some of your details. Could you please confirm your name, phone number, email, preferred time, and what you'd like help with?"
      );
    }

    if (!validateEmail(callerEmail)) {
      return vapiResult(
        `I want to make sure I have your email correct. You said ${callerEmail} — could you spell that out for me?`
      );
    }

    // Validate datetime
    const parsedDate = new Date(preferredDatetime);
    if (isNaN(parsedDate.getTime())) {
      return vapiResult(
        "I had trouble understanding the date and time. Could you say it again? For example, March 25th at 2 PM."
      );
    }

    const details: AppointmentDetails = {
      callerName,
      callerPhone,
      callerEmail,
      preferredDatetime,
      inquiryType,
      timezone,
    };

    try {
      const result = await bookAppointment(details);

      if (result.success) {
        const when = result.humanReadableDatetime ?? preferredDatetime;
        app.log.info({ callerName, callerEmail, when }, "[receptionist] Appointment booked");
        return vapiResult(
          `You're all set, ${callerName.split(" ")[0]}. Your consultation is confirmed for ${when}. You'll receive a confirmation email at ${callerEmail} shortly. The Wavelength AI team looks forward to speaking with you.`
        );
      } else {
        app.log.error({ error: result.error, callerName }, "[receptionist] Booking failed");
        return vapiResult(
          "I'm sorry, I ran into a technical issue booking your appointment. Please try calling back in a few minutes, or email us directly and we'll get you sorted."
        );
      }
    } catch (err) {
      app.log.error({ err }, "[receptionist] Unexpected booking error");
      return vapiResult(
        "I'm sorry, something went wrong on our end. Please try again shortly or email Wavelength AI directly."
      );
    }
  });
};
