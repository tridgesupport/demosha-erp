// Transactional email via Brevo's REST API (no SDK needed — just fetch).
// Requires BREVO_API_KEY to be set; sender defaults to the verified
// support@tridge.co.in identity but can be overridden per-environment.

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

function senderEmail() {
  return (process.env.BREVO_SENDER_EMAIL ?? 'support@tridge.co.in').trim();
}

function senderName() {
  return (process.env.BREVO_SENDER_NAME ?? 'Demosha via Tridge Support').trim();
}

// Returns true on success, false on failure — callers should treat email
// delivery as best-effort and fall back to something else (e.g. showing the
// link in the UI) rather than failing the whole request.
export async function sendEmail(to: { email: string; name?: string }, subject: string, htmlContent: string): Promise<boolean> {
  const apiKey = (process.env.BREVO_API_KEY ?? '').trim();
  if (!apiKey) {
    console.error('BREVO_API_KEY is not set — skipping email send');
    return false;
  }
  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: senderEmail(), name: senderName() },
        to: [{ email: to.email, name: to.name ?? to.email }],
        subject,
        htmlContent,
      }),
    });
    if (!res.ok) {
      console.error('Brevo send failed:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('Brevo send threw:', err);
    return false;
  }
}

export async function sendSetPasswordEmail(to: { email: string; name?: string }, resetUrl: string, isNewAccount: boolean) {
  const subject = isNewAccount ? 'Set up your Demosha ERP account' : 'Reset your Demosha ERP password';
  const intro = isNewAccount
    ? `An account has been created for you on Demosha ERP.`
    : `We received a request to reset your Demosha ERP password.`;
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:15px;color:#1f2937;line-height:1.5;">
      <p>Hi ${to.name ?? ''},</p>
      <p>${intro} Click the button below to ${isNewAccount ? 'set your password' : 'choose a new password'}:</p>
      <p style="margin:24px 0;">
        <a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">
          ${isNewAccount ? 'Set Password' : 'Reset Password'}
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px;">If the button doesn't work, copy and paste this link into your browser:<br>${resetUrl}</p>
      <p style="color:#6b7280;font-size:13px;">This link expires soon and can only be used once. If you didn't expect this email, you can ignore it.</p>
    </div>
  `;
  return sendEmail(to, subject, html);
}
