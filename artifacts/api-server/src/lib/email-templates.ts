const BRAND_COLOR = "#2563eb";
const BRAND_NAME = "Bright Insight";

function baseLayout(content: string, previewText = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${BRAND_NAME}</title>
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  <style>
    body { margin: 0; padding: 0; background-color: #0a0f1e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 40px 16px; }
    .card { background: #111827; border-radius: 16px; overflow: hidden; border: 1px solid #1f2937; }
    .header { background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 60%, #3b82f6 100%); padding: 32px 40px; }
    .header-inner { display: flex; align-items: center; gap: 12px; }
    .logo-mark { width: 40px; height: 40px; background: rgba(255,255,255,0.15); border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; font-size: 20px; vertical-align: middle; }
    .brand-name { color: #fff; font-size: 18px; font-weight: 700; letter-spacing: -0.3px; vertical-align: middle; margin-left: 10px; }
    .body { padding: 40px; }
    .body h2 { margin: 0 0 8px; color: #f9fafb; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
    .body .subtitle { margin: 0 0 28px; color: #6b7280; font-size: 14px; line-height: 1.6; }
    .body p { margin: 0 0 16px; color: #9ca3af; font-size: 14px; line-height: 1.6; }
    .body p.highlight { color: #e5e7eb; }
    .divider { border: none; border-top: 1px solid #1f2937; margin: 28px 0; }
    .btn { display: inline-block; padding: 13px 32px; background: ${BRAND_COLOR}; color: #fff !important; text-decoration: none; border-radius: 10px; font-size: 14px; font-weight: 600; letter-spacing: 0.1px; }
    .btn-wrap { text-align: center; margin: 28px 0; }
    .meta { font-size: 12px; color: #4b5563; }
    .footer { text-align: center; padding: 24px 40px 28px; border-top: 1px solid #1f2937; }
    .footer p { margin: 0; color: #374151; font-size: 12px; }
    .tag { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .tag-blue { background: rgba(37,99,235,0.2); color: #60a5fa; }
    .tag-green { background: rgba(16,185,129,0.2); color: #34d399; }
    .tag-amber { background: rgba(245,158,11,0.2); color: #fbbf24; }
    .tag-red { background: rgba(239,68,68,0.2); color: #f87171; }
    .content-box { background: #0d1117; border: 1px solid #1f2937; border-radius: 10px; padding: 16px 20px; margin: 16px 0; }
    .content-box p { margin: 0; color: #d1d5db; }
    .otp-block { text-align: center; margin: 32px 0; }
    .otp-timer { display: inline-block; margin-top: 12px; font-size: 12px; color: #6b7280; background: #1f2937; padding: 4px 12px; border-radius: 999px; }
    .security-notice { background: #0d1117; border: 1px solid #1f2937; border-left: 3px solid #374151; border-radius: 8px; padding: 14px 16px; margin-top: 24px; }
    .security-notice p { margin: 0; font-size: 12px; color: #4b5563; line-height: 1.5; }
    .security-notice p strong { color: #6b7280; }
  </style>
</head>
<body>
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#0a0f1e;">${previewText}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ""}
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <span class="logo-mark">📈</span><span class="brand-name">${BRAND_NAME}</span>
      </div>
      <div class="body">
        ${content}
      </div>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} ${BRAND_NAME} · bicacademy.com</p>
      <p style="margin-top:6px;">You're receiving this because you requested it on the platform.</p>
    </div>
  </div>
</body>
</html>`;
}

export function courseAnnouncementEmail(opts: {
  recipientName: string;
  courseTitle: string;
  announcementTitle: string;
  announcementContent: string;
  instructorName: string;
  courseUrl?: string;
}): string {
  const content = `
    <span class="tag tag-blue">Course Announcement</span>
    <h2 style="margin-top:14px;">${opts.announcementTitle}</h2>
    <p class="meta">${opts.courseTitle} &middot; by ${opts.instructorName}</p>
    <hr class="divider" />
    <p class="highlight">Hi ${opts.recipientName},</p>
    <p>Your instructor has posted a new announcement for <strong style="color:#e2e8f0;">${opts.courseTitle}</strong>.</p>
    <div class="content-box"><p>${opts.announcementContent.replace(/\n/g, "<br/>")}</p></div>
    ${opts.courseUrl ? `<div class="btn-wrap"><a href="${opts.courseUrl}" class="btn">View Course</a></div>` : ""}
  `;
  return baseLayout(content, `New announcement: ${opts.announcementTitle}`);
}

export function taskApprovedEmail(opts: {
  recipientName: string;
  taskTitle: string;
  courseTitle: string;
  xpReward: number;
  courseUrl?: string;
}): string {
  const content = `
    <span class="tag tag-green">Task Approved ✓</span>
    <h2 style="margin-top:14px;">Your submission was approved!</h2>
    <hr class="divider" />
    <p class="highlight">Hi ${opts.recipientName},</p>
    <p>Great news! Your submission for <strong style="color:#e2e8f0;">${opts.taskTitle}</strong> in <strong style="color:#e2e8f0;">${opts.courseTitle}</strong> has been approved.</p>
    <div class="content-box">
      <p style="font-size:22px;text-align:center;font-weight:700;color:#34d399;">+${opts.xpReward} XP</p>
      <p style="text-align:center;font-size:12px;color:#64748b;margin-top:4px!important;">added to your account</p>
    </div>
    ${opts.courseUrl ? `<div class="btn-wrap"><a href="${opts.courseUrl}" class="btn">Continue Learning</a></div>` : ""}
  `;
  return baseLayout(content, `Your task "${opts.taskTitle}" was approved — +${opts.xpReward} XP!`);
}

export function taskRejectedEmail(opts: {
  recipientName: string;
  taskTitle: string;
  courseTitle: string;
  feedback?: string;
  courseUrl?: string;
}): string {
  const content = `
    <span class="tag tag-amber">Submission Feedback</span>
    <h2 style="margin-top:14px;">Your submission needs revision</h2>
    <hr class="divider" />
    <p class="highlight">Hi ${opts.recipientName},</p>
    <p>Your instructor reviewed your submission for <strong style="color:#e2e8f0;">${opts.taskTitle}</strong> in <strong style="color:#e2e8f0;">${opts.courseTitle}</strong> and has some feedback.</p>
    ${opts.feedback ? `<div class="content-box"><p>${opts.feedback.replace(/\n/g, "<br/>")}</p></div>` : ""}
    <p>Please revise your work and resubmit. You've got this!</p>
    ${opts.courseUrl ? `<div class="btn-wrap"><a href="${opts.courseUrl}" class="btn">Resubmit Task</a></div>` : ""}
  `;
  return baseLayout(content, `Feedback on your "${opts.taskTitle}" submission`);
}

export function broadcastEmail(opts: {
  recipientName: string;
  subject: string;
  message: string;
}): string {
  const content = `
    <span class="tag tag-blue">Announcement</span>
    <h2 style="margin-top:14px;">${opts.subject}</h2>
    <hr class="divider" />
    <p class="highlight">Hi ${opts.recipientName},</p>
    <div class="content-box"><p>${opts.message.replace(/\n/g, "<br/>")}</p></div>
    <div class="btn-wrap"><a href="/" class="btn">Open Platform</a></div>
  `;
  return baseLayout(content, opts.subject);
}

export function liveClassReminderEmail(opts: {
  recipientName: string;
  classTitle: string;
  courseTitle?: string;
  scheduledAt: string;
  joinUrl?: string;
}): string {
  const content = `
    <span class="tag tag-red">🔴 Live Session Starting Soon</span>
    <h2 style="margin-top:14px;">${opts.classTitle}</h2>
    ${opts.courseTitle ? `<p class="meta">${opts.courseTitle}</p>` : ""}
    <hr class="divider" />
    <p class="highlight">Hi ${opts.recipientName},</p>
    <p>A live session you registered for is starting soon.</p>
    <div class="content-box">
      <p><strong style="color:#e2e8f0;">📅 When:</strong> ${opts.scheduledAt}</p>
    </div>
    ${opts.joinUrl ? `<div class="btn-wrap"><a href="${opts.joinUrl}" class="btn">Join Session</a></div>` : ""}
    <p class="meta">Make sure your camera and microphone are ready before joining.</p>
  `;
  return baseLayout(content, `Live session "${opts.classTitle}" is starting soon`);
}

function otpDigits(code: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        ${code.split("").map((d) => `
          <td style="padding:0 3px;">
            <span style="display:inline-block;width:34px;height:44px;line-height:44px;text-align:center;background:#0d1117;border:1px solid #374151;border-radius:7px;font-size:22px;font-weight:800;color:#f9fafb;font-family:'Courier New',Courier,monospace;">${d}</span>
          </td>`).join("")}
      </tr>
    </table>`;
}

export function otpEmail(opts: { name?: string; code: string }): string {
  const content = `
    <h2>Verify your email</h2>
    <p class="subtitle">Hi ${opts.name ? `<strong style="color:#e5e7eb">${opts.name}</strong>` : "there"} 👋 — Welcome to Bright Insight! Use the code below to verify your email address and complete registration.</p>
    <div class="otp-block">
      ${otpDigits(opts.code)}
      <div style="margin-top:14px;"><span class="otp-timer">⏱ Expires in 10 minutes</span></div>
    </div>
    <p style="text-align:center;color:#6b7280;font-size:13px;">Enter this code in the sign-up screen to continue.</p>
    <hr class="divider" />
    <div class="security-notice">
      <p><strong>Didn't request this?</strong> Someone may have entered your email by mistake. You can safely ignore this email — no account will be created without the code.</p>
    </div>
  `;
  return baseLayout(content, `${opts.code} is your Bright Insight verification code`);
}

export function passwordResetEmail(opts: { name?: string; code: string }): string {
  const content = `
    <h2>Reset your password</h2>
    <p class="subtitle">Hi ${opts.name ? `<strong style="color:#e5e7eb">${opts.name}</strong>` : "there"} — we received a request to reset your Bright Insight password. Use the code below to proceed.</p>
    <div class="otp-block">
      ${otpDigits(opts.code)}
      <div style="margin-top:14px;"><span class="otp-timer">⏱ Expires in 10 minutes</span></div>
    </div>
    <p style="text-align:center;color:#6b7280;font-size:13px;">Enter this code to set a new password.</p>
    <hr class="divider" />
    <div class="security-notice">
      <p><strong>Didn't request a password reset?</strong> Your account is safe. Ignore this email — your password will remain unchanged and this code will expire automatically.</p>
    </div>
  `;
  return baseLayout(content, `${opts.code} is your Bright Insight password reset code`);
}
