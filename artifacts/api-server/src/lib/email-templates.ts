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
    body { margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 32px 16px; }
    .card { background: #1e293b; border-radius: 12px; overflow: hidden; }
    .header { background: ${BRAND_COLOR}; padding: 24px 32px; text-align: center; }
    .header h1 { margin: 0; color: #fff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
    .body { padding: 32px; }
    .body h2 { margin: 0 0 12px; color: #f1f5f9; font-size: 18px; font-weight: 600; }
    .body p { margin: 0 0 16px; color: #94a3b8; font-size: 14px; line-height: 1.6; }
    .body p.highlight { color: #e2e8f0; }
    .divider { border: none; border-top: 1px solid #334155; margin: 24px 0; }
    .btn { display: inline-block; padding: 12px 28px; background: ${BRAND_COLOR}; color: #fff !important; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600; }
    .btn-wrap { text-align: center; margin: 24px 0; }
    .meta { font-size: 12px; color: #475569; }
    .footer { text-align: center; padding: 20px 32px; }
    .footer p { margin: 0; color: #475569; font-size: 12px; }
    .tag { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .tag-blue { background: rgba(37,99,235,0.2); color: #60a5fa; }
    .tag-green { background: rgba(16,185,129,0.2); color: #34d399; }
    .tag-amber { background: rgba(245,158,11,0.2); color: #fbbf24; }
    .tag-red { background: rgba(239,68,68,0.2); color: #f87171; }
    .content-box { background: #0f172a; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
    .content-box p { margin: 0; color: #cbd5e1; }
  </style>
</head>
<body>
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;">${previewText}</div>` : ""}
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>📈 ${BRAND_NAME}</h1>
      </div>
      <div class="body">
        ${content}
      </div>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.</p>
      <p style="margin-top:6px;">You're receiving this because you're enrolled on the platform.</p>
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
