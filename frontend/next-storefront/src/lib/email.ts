import { getCineCubBindings } from "./cloudflare";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface EmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Send transactional email via Resend REST API (zero-dependency for edge compatibility)
 */
export async function sendEmail({ to, subject, html, text }: SendEmailParams): Promise<EmailResult> {
  const bindings = await getCineCubBindings();
  const apiKey = bindings.RESEND_API_KEY;

  if (!apiKey) {
    console.error("[Resend] Missing RESEND_API_KEY binding");
    return { success: false, error: "MISSING_API_KEY" };
  }

  const primaryFrom = bindings.RESEND_FROM_EMAIL || "CineCub <noreply@cinecub.stream>";
  const fallbackFrom = bindings.RESEND_FALLBACK_FROM_EMAIL || "CineCub <onboarding@resend.dev>";

  // Helper to attempt sending with a specific "from" address
  const dispatch = async (fromAddress: string) => {
    return await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject,
        html,
        text,
      }),
    });
  };

  try {
    let res = await dispatch(primaryFrom);
    let data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };

    // If sending with custom domain failed because domain isn't verified in Resend yet, retry with onboarding@resend.dev
    if (!res.ok && (data.name === "validation_error" || res.status === 403 || res.status === 400)) {
      console.warn(`[Resend] Primary from address failed (${primaryFrom}): ${data.message}. Retrying with fallback: ${fallbackFrom}`);
      res = await dispatch(fallbackFrom);
      data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    }

    if (!res.ok) {
      console.error("[Resend Error]", res.status, data);
      return { success: false, error: data.message || "Failed to deliver email" };
    }

    return { success: true, id: data.id };
  } catch (err: unknown) {
    console.error("[Resend Exception]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unexpected email dispatch error",
    };
  }
}

/**
 * Send password reset email with secure token link (matching CineCub website purple theme)
 */
export async function sendPasswordResetEmail({
  to,
  token,
  username,
  origin = "https://cinecub.stream",
}: {
  to: string;
  token: string;
  username?: string;
  origin?: string;
}): Promise<EmailResult> {
  const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(to)}`;
  const logoUrl = `${origin}/assets/images/web-logo.png`;
  const greeting = username ? `Hi ${username},` : "Hello,";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your CineCub Password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #08070e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #08070e; padding: 45px 15px;">
    <tr>
      <td align="center">
        <!-- Main Card with Signature CineCub Purple Aesthetics -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; background: linear-gradient(180deg, #130f24 0%, #0c0a15 100%); border: 1px solid rgba(157, 78, 221, 0.28); border-radius: 18px; overflow: hidden; box-shadow: 0 16px 50px rgba(0, 0, 0, 0.8), 0 0 35px rgba(157, 78, 221, 0.14);">
          
          <!-- Header with CineCub Logo & Purple Badge -->
          <tr>
            <td align="center" style="padding: 38px 30px 24px; border-bottom: 1px solid rgba(157, 78, 221, 0.16); background: radial-gradient(circle at 50% 0%, rgba(157, 78, 221, 0.18) 0%, transparent 75%);">
              <a href="${origin}" target="_blank" style="text-decoration: none; display: inline-block;">
                <img src="${logoUrl}" alt="CineCub" width="155" style="display: block; width: 155px; height: auto; max-height: 42px; object-fit: contain; margin: 0 auto 14px; border: 0; outline: none; filter: drop-shadow(0 2px 10px rgba(157, 78, 221, 0.5));" />
              </a>
              <div>
                <span style="display: inline-block; padding: 4px 14px; background: rgba(157, 78, 221, 0.15); border: 1px solid rgba(199, 125, 255, 0.35); border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: #c77dff; text-transform: uppercase;">
                  Password Reset
                </span>
              </div>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 34px 32px 28px;">
              <h2 style="font-size: 20px; font-weight: 700; margin: 0 0 14px; color: #f8fafc; letter-spacing: -0.3px;">
                ${greeting}
              </h2>
              <p style="font-size: 14px; line-height: 23px; margin: 0 0 24px; color: #94a3b8;">
                We received a request to reset the password for your CineCub account. Click the button below to choose a new password:
              </p>

              <!-- CTA Button in Neon Purple Gradient -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0 32px;">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #9d4edd 0%, #7b2cbf 100%); color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 15px 36px; border-radius: 12px; box-shadow: 0 4px 24px rgba(157, 78, 221, 0.5), 0 0 15px rgba(199, 125, 255, 0.25); text-transform: uppercase; letter-spacing: 0.6px; border: 1px solid rgba(199, 125, 255, 0.4);">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Security Notice Box -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: rgba(157, 78, 221, 0.08); border: 1px solid rgba(157, 78, 221, 0.2); border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 14px 16px; font-size: 12px; line-height: 19px; color: #cbd5e1;">
                    <strong style="color: #c77dff;">Security notice:</strong> This link is valid for <strong>1 hour</strong> and can only be used once. If you didn't request a password reset, you can safely ignore this email &mdash; your account remains secure.
                  </td>
                </tr>
              </table>

              <!-- Fallback Direct URL -->
              <div style="padding-top: 18px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #64748b; line-height: 18px; word-break: break-all;">
                If the button above doesn't work, copy and paste this link into your browser:<br/>
                <a href="${resetUrl}" style="color: #c77dff; text-decoration: underline;">${resetUrl}</a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 22px 30px; background-color: rgba(0, 0, 0, 0.35); border-top: 1px solid rgba(255, 255, 255, 0.05); font-size: 11px; color: #64748b; line-height: 18px;">
              <div style="margin-bottom: 4px; color: #94a3b8; font-weight: 600;">
                CineCub &bull; Unlimited Entertainment
              </div>
              <div>&copy; ${new Date().getFullYear()} CineCub. All rights reserved.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = `
Hi ${username || "there"},

We received a request to reset the password for your CineCub account.

Click the link below to choose a new password:
${resetUrl}

This link is valid for 1 hour. If you didn't request this, you can safely ignore this email.

-- CineCub Team
https://cinecub.stream
  `.trim();

  return await sendEmail({
    to,
    subject: "Reset your CineCub password",
    html,
    text,
  });
}

/**
 * Send email verification link (matching CineCub website purple theme)
 */
export async function sendVerificationEmail({
  to,
  token,
  username,
  origin = "https://cinecub.stream",
}: {
  to: string;
  token: string;
  username?: string;
  origin?: string;
}): Promise<EmailResult> {
  const verifyUrl = `${origin}/verify-email?token=${encodeURIComponent(token)}`;
  const logoUrl = `${origin}/assets/images/web-logo.png`;
  const greeting = username ? `Hi ${username},` : "Hello,";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your CineCub Email</title>
</head>
<body style="margin: 0; padding: 0; background-color: #08070e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #08070e; padding: 45px 15px;">
    <tr>
      <td align="center">
        <!-- Main Card with Signature CineCub Purple Aesthetics -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; background: linear-gradient(180deg, #130f24 0%, #0c0a15 100%); border: 1px solid rgba(157, 78, 221, 0.28); border-radius: 18px; overflow: hidden; box-shadow: 0 16px 50px rgba(0, 0, 0, 0.8), 0 0 35px rgba(157, 78, 221, 0.14);">
          
          <!-- Header with CineCub Logo & Purple Badge -->
          <tr>
            <td align="center" style="padding: 38px 30px 24px; border-bottom: 1px solid rgba(157, 78, 221, 0.16); background: radial-gradient(circle at 50% 0%, rgba(157, 78, 221, 0.18) 0%, transparent 75%);">
              <a href="${origin}" target="_blank" style="text-decoration: none; display: inline-block;">
                <img src="${logoUrl}" alt="CineCub" width="155" style="display: block; width: 155px; height: auto; max-height: 42px; object-fit: contain; margin: 0 auto 14px; border: 0; outline: none; filter: drop-shadow(0 2px 10px rgba(157, 78, 221, 0.5));" />
              </a>
              <div>
                <span style="display: inline-block; padding: 4px 14px; background: rgba(157, 78, 221, 0.15); border: 1px solid rgba(199, 125, 255, 0.35); border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: #c77dff; text-transform: uppercase;">
                  Email Verification
                </span>
              </div>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 34px 32px 28px;">
              <h2 style="font-size: 20px; font-weight: 700; margin: 0 0 14px; color: #f8fafc; letter-spacing: -0.3px;">
                ${greeting}
              </h2>
              <p style="font-size: 14px; line-height: 23px; margin: 0 0 24px; color: #94a3b8;">
                Welcome to CineCub! Confirm your email address to unlock full cross-device library sync, watchlist backup, and recovery access.
              </p>

              <!-- CTA Button in Neon Purple Gradient -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0 32px;">
                <tr>
                  <td align="center">
                    <a href="${verifyUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #9d4edd 0%, #7b2cbf 100%); color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 15px 36px; border-radius: 12px; box-shadow: 0 4px 24px rgba(157, 78, 221, 0.5), 0 0 15px rgba(199, 125, 255, 0.25); text-transform: uppercase; letter-spacing: 0.6px; border: 1px solid rgba(199, 125, 255, 0.4);">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size: 12px; line-height: 18px; margin: 0 0 20px; color: #64748b;">
                If you did not create an account on CineCub, you can safely ignore this email.
              </p>

              <!-- Fallback Direct URL -->
              <div style="padding-top: 18px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #64748b; line-height: 18px; word-break: break-all;">
                If the button above doesn't work, copy and paste this link into your browser:<br/>
                <a href="${verifyUrl}" style="color: #c77dff; text-decoration: underline;">${verifyUrl}</a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 22px 30px; background-color: rgba(0, 0, 0, 0.35); border-top: 1px solid rgba(255, 255, 255, 0.05); font-size: 11px; color: #64748b; line-height: 18px;">
              <div style="margin-bottom: 4px; color: #94a3b8; font-weight: 600;">
                CineCub &bull; Unlimited Entertainment
              </div>
              <div>&copy; ${new Date().getFullYear()} CineCub. All rights reserved.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = `
Hi ${username || "there"},

Welcome to CineCub! Please verify your email address by clicking the link below:
${verifyUrl}

-- CineCub Team
https://cinecub.stream
  `.trim();

  return await sendEmail({
    to,
    subject: "Verify your CineCub email address",
    html,
    text,
  });
}
