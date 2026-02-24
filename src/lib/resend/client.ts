import { Resend } from "resend";

export function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

function getFromAddress(): string {
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (isResendConfigured() && !fromEmail) {
    throw new Error(
      "RESEND_FROM_EMAIL is required when RESEND_API_KEY is set — sending from an unverified domain will bounce"
    );
  }

  return fromEmail || "onboarding@resend.dev";
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

interface SendEmailResult {
  success: boolean;
  testMode: boolean;
  emailId?: string;
  error?: string;
}

export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailParams): Promise<SendEmailResult> {
  if (!isResendConfigured()) {
    console.log("[Resend Test Mode] Email to:", to);
    console.log("[Resend Test Mode] Subject:", subject);
    console.log("[Resend Test Mode] HTML length:", html.length);
    return { success: true, testMode: true };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = getFromAddress();

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
  });

  if (error) {
    console.error("[Resend API Error]", error);
    return { success: false, testMode: false, error: error.message };
  }

  console.log("[Resend API Success] Email sent:", data?.id);
  return { success: true, testMode: false, emailId: data?.id };
}
