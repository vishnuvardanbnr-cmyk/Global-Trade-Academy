import { Router } from "express";
import { getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import {
  liveClassesTable, liveClassRegistrationsTable,
  liveClassMessagesTable, liveClassQuestionsTable, liveClassQuestionUpvotesTable,
  liveClassPollsTable, liveClassPollOptionsTable, liveClassPollVotesTable,
  usersTable, coursesTable, enrollmentsTable, batchesTable, batchStudentsTable,
} from "@workspace/db";
import { eq, and, gte, sql, desc, gt } from "drizzle-orm";

const router = Router();

function generateRoomName(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const rand = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `edu-${rand}-${Date.now().toString(36)}`;
}

async function buildClassResponse(cls: typeof liveClassesTable.$inferSelect) {
  const [regCount, instructor, course, batch] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(liveClassRegistrationsTable).where(eq(liveClassRegistrationsTable.classId, cls.id)),
    db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, cls.instructorId)).limit(1),
    cls.courseId
      ? db.select({ id: coursesTable.id, title: coursesTable.title }).from(coursesTable).where(eq(coursesTable.id, cls.courseId)).limit(1)
      : Promise.resolve([]),
    cls.batchId
      ? db.select({ id: batchesTable.id, name: batchesTable.name }).from(batchesTable).where(eq(batchesTable.id, cls.batchId)).limit(1)
      : Promise.resolve([]),
  ]);
  return {
    id: cls.id,
    courseId: cls.courseId ?? null,
    courseName: (course as { id: number; title: string }[])[0]?.title ?? null,
    batchId: cls.batchId ?? null,
    batchName: (batch as { id: number; name: string }[])[0]?.name ?? null,
    title: cls.title,
    description: cls.description,
    instructorId: cls.instructorId,
    instructorName: instructor[0]?.displayName ?? null,
    scheduledAt: cls.scheduledAt,
    duration: cls.duration,
    status: cls.status,
    roomName: cls.roomName ?? null,
    meetingUrl: cls.meetingUrl,
    replayUrl: cls.replayUrl,
    category: cls.category,
    maxAttendees: cls.maxAttendees,
    agenda: cls.agenda ?? null,
    registrationCount: regCount[0]?.count ?? 0,
    thumbnailUrl: cls.thumbnailUrl,
    createdAt: cls.createdAt,
  };
}

// GET /api/live-classes
router.get("/live-classes", async (req, res): Promise<void> => {
  try {
    const { upcoming, instructorId, courseId } = req.query as Record<string, string>;
    let query = db.select().from(liveClassesTable).$dynamic();
    const conditions = [];
    if (upcoming === "true") conditions.push(gte(liveClassesTable.scheduledAt, new Date()));
    if (instructorId) conditions.push(eq(liveClassesTable.instructorId, instructorId));
    if (courseId) conditions.push(eq(liveClassesTable.courseId, parseInt(courseId)));
    if (conditions.length) query = query.where(and(...conditions));
    const classes = await query.limit(50);
    const results = await Promise.all(classes.map(buildClassResponse));
    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Error listing live classes");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/live-classes
router.post("/live-classes", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { title, description, scheduledAt, duration, meetingUrl, category, maxAttendees, thumbnailUrl, courseId, agenda, batchId } = req.body;
    if (!title || !scheduledAt) { res.status(400).json({ error: "title and scheduledAt required" }); return; }

    const inserted = await db.insert(liveClassesTable).values({
      title, description, instructorId: clerkId,
      scheduledAt: new Date(scheduledAt), duration, meetingUrl, category, maxAttendees, thumbnailUrl, agenda,
      courseId: courseId ? parseInt(courseId) : null,
      batchId: batchId ? parseInt(batchId) : null,
      roomName: generateRoomName(),
      status: "scheduled",
    }).returning();

    res.status(201).json(await buildClassResponse(inserted[0]));
  } catch (err) {
    req.log.error({ err }, "Error creating live class");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/live-classes/:classId
router.get("/live-classes/:classId", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.classId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const cls = await db.select().from(liveClassesTable).where(eq(liveClassesTable.id, id)).limit(1).then((r) => r[0]);
    if (!cls) { res.status(404).json({ error: "Live class not found" }); return; }
    res.json(await buildClassResponse(cls));
  } catch (err) {
    req.log.error({ err }, "Error getting live class");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/live-classes/:classId
router.patch("/live-classes/:classId", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.classId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { title, description, scheduledAt, duration, status, meetingUrl, replayUrl, category, maxAttendees, courseId, agenda, batchId } = req.body;
    const updated = await db.update(liveClassesTable).set({
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(scheduledAt !== undefined && { scheduledAt: new Date(scheduledAt) }),
      ...(duration !== undefined && { duration }),
      ...(status !== undefined && { status }),
      ...(meetingUrl !== undefined && { meetingUrl }),
      ...(replayUrl !== undefined && { replayUrl }),
      ...(category !== undefined && { category }),
      ...(maxAttendees !== undefined && { maxAttendees }),
      ...(courseId !== undefined && { courseId: courseId ? parseInt(courseId) : null }),
      ...(batchId !== undefined && { batchId: batchId ? parseInt(batchId) : null }),
      ...(agenda !== undefined && { agenda }),
    }).where(eq(liveClassesTable.id, id)).returning();
    if (!updated[0]) { res.status(404).json({ error: "Live class not found" }); return; }
    res.json(await buildClassResponse(updated[0]));
  } catch (err) {
    req.log.error({ err }, "Error updating live class");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/live-classes/:classId
router.delete("/live-classes/:classId", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.classId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(liveClassesTable).where(eq(liveClassesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting live class");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/live-classes/:classId/register
router.post("/live-classes/:classId/register", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const classId = parseInt(req.params.classId);
    if (isNaN(classId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const existing = await db.select().from(liveClassRegistrationsTable)
      .where(and(eq(liveClassRegistrationsTable.classId, classId), eq(liveClassRegistrationsTable.userId, clerkId)))
      .limit(1).then((r) => r[0]);

    if (existing) { res.status(409).json({ error: "Already registered" }); return; }

    const inserted = await db.insert(liveClassRegistrationsTable).values({ classId, userId: clerkId }).returning();
    const reg = inserted[0];
    res.status(201).json({ classId: reg.classId, userId: reg.userId, registeredAt: reg.registeredAt });
  } catch (err) {
    req.log.error({ err }, "Error registering for live class");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/live-classes/:classId/start  — instructor starts the session
router.post("/live-classes/:classId/start", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const id = parseInt(req.params.classId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const cls = await db.select().from(liveClassesTable).where(eq(liveClassesTable.id, id)).limit(1).then((r) => r[0]);
    if (!cls) { res.status(404).json({ error: "Live class not found" }); return; }
    if (cls.instructorId !== clerkId) { res.status(403).json({ error: "Only the instructor can start this session" }); return; }

    const roomName = cls.roomName ?? generateRoomName();
    const updated = await db.update(liveClassesTable)
      .set({ status: "live", roomName })
      .where(eq(liveClassesTable.id, id))
      .returning();

    res.json(await buildClassResponse(updated[0]));
  } catch (err) {
    req.log.error({ err }, "Error starting live class");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/live-classes/:classId/end  — instructor ends the session
router.post("/live-classes/:classId/end", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const id = parseInt(req.params.classId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const cls = await db.select().from(liveClassesTable).where(eq(liveClassesTable.id, id)).limit(1).then((r) => r[0]);
    if (!cls) { res.status(404).json({ error: "Live class not found" }); return; }
    if (cls.instructorId !== clerkId) { res.status(403).json({ error: "Only the instructor can end this session" }); return; }

    const { replayUrl } = req.body;
    const updated = await db.update(liveClassesTable)
      .set({ status: "completed", ...(replayUrl && { replayUrl }) })
      .where(eq(liveClassesTable.id, id))
      .returning();

    res.json(await buildClassResponse(updated[0]));
  } catch (err) {
    req.log.error({ err }, "Error ending live class");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── MESSAGES ──────────────────────────────────────────────────────────────

// GET /api/live-classes/:classId/messages?since=<iso>
router.get("/live-classes/:classId/messages", async (req, res): Promise<void> => {
  try {
    const classId = parseInt(req.params.classId);
    if (isNaN(classId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { since } = req.query as Record<string, string>;
    let baseQuery = db.select().from(liveClassMessagesTable).$dynamic();
    if (since) {
      baseQuery = baseQuery.where(and(eq(liveClassMessagesTable.classId, classId), gt(liveClassMessagesTable.createdAt, new Date(since))));
    } else {
      baseQuery = baseQuery.where(eq(liveClassMessagesTable.classId, classId));
    }
    const messages = await baseQuery.orderBy(liveClassMessagesTable.createdAt).limit(200);
    res.json(messages);
  } catch (err) {
    req.log.error({ err }, "Error listing messages");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/live-classes/:classId/messages
router.post("/live-classes/:classId/messages", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const classId = parseInt(req.params.classId);
    if (isNaN(classId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { message } = req.body;
    if (!message?.trim()) { res.status(400).json({ error: "message required" }); return; }
    const user = await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, clerkId)).limit(1).then((r) => r[0]);
    const inserted = await db.insert(liveClassMessagesTable).values({
      classId, userId: clerkId, userName: user?.displayName ?? null, message: message.trim(),
    }).returning();
    res.status(201).json(inserted[0]);
  } catch (err) {
    req.log.error({ err }, "Error creating message");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── QUESTIONS ─────────────────────────────────────────────────────────────

// GET /api/live-classes/:classId/questions
router.get("/live-classes/:classId/questions", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    const classId = parseInt(req.params.classId);
    if (isNaN(classId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const questions = await db.select().from(liveClassQuestionsTable)
      .where(eq(liveClassQuestionsTable.classId, classId))
      .orderBy(desc(liveClassQuestionsTable.isPinned), desc(liveClassQuestionsTable.upvoteCount), desc(liveClassQuestionsTable.createdAt))
      .limit(100);
    let upvotedIds: Set<number> = new Set();
    if (clerkId) {
      const upvotes = await db.select({ questionId: liveClassQuestionUpvotesTable.questionId })
        .from(liveClassQuestionUpvotesTable).where(eq(liveClassQuestionUpvotesTable.userId, clerkId));
      upvotedIds = new Set(upvotes.map((u) => u.questionId));
    }
    res.json(questions.map((q) => ({ ...q, hasUpvoted: upvotedIds.has(q.id) })));
  } catch (err) {
    req.log.error({ err }, "Error listing questions");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/live-classes/:classId/questions
router.post("/live-classes/:classId/questions", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const classId = parseInt(req.params.classId);
    if (isNaN(classId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { question } = req.body;
    if (!question?.trim()) { res.status(400).json({ error: "question required" }); return; }
    const user = await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, clerkId)).limit(1).then((r) => r[0]);
    const inserted = await db.insert(liveClassQuestionsTable).values({
      classId, userId: clerkId, userName: user?.displayName ?? null, question: question.trim(),
    }).returning();
    res.status(201).json({ ...inserted[0], hasUpvoted: false });
  } catch (err) {
    req.log.error({ err }, "Error creating question");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/live-classes/:classId/questions/:questionId (instructor: answer/pin)
router.patch("/live-classes/:classId/questions/:questionId", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const classId = parseInt(req.params.classId);
    const questionId = parseInt(req.params.questionId);
    if (isNaN(classId) || isNaN(questionId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const cls = await db.select({ instructorId: liveClassesTable.instructorId }).from(liveClassesTable).where(eq(liveClassesTable.id, classId)).limit(1).then((r) => r[0]);
    if (!cls || cls.instructorId !== clerkId) { res.status(403).json({ error: "Instructor only" }); return; }
    const { isAnswered, isPinned, answer } = req.body;
    const updated = await db.update(liveClassQuestionsTable).set({
      ...(isAnswered !== undefined && { isAnswered }),
      ...(isPinned !== undefined && { isPinned }),
      ...(answer !== undefined && { answer, isAnswered: true }),
    }).where(and(eq(liveClassQuestionsTable.id, questionId), eq(liveClassQuestionsTable.classId, classId))).returning();
    if (!updated[0]) { res.status(404).json({ error: "Question not found" }); return; }
    res.json({ ...updated[0], hasUpvoted: false });
  } catch (err) {
    req.log.error({ err }, "Error updating question");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/live-classes/:classId/questions/:questionId/upvote
router.post("/live-classes/:classId/questions/:questionId/upvote", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const classId = parseInt(req.params.classId);
    const questionId = parseInt(req.params.questionId);
    if (isNaN(classId) || isNaN(questionId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const existing = await db.select().from(liveClassQuestionUpvotesTable)
      .where(and(eq(liveClassQuestionUpvotesTable.questionId, questionId), eq(liveClassQuestionUpvotesTable.userId, clerkId)))
      .limit(1).then((r) => r[0]);
    if (existing) {
      await db.delete(liveClassQuestionUpvotesTable).where(and(eq(liveClassQuestionUpvotesTable.questionId, questionId), eq(liveClassQuestionUpvotesTable.userId, clerkId)));
      await db.update(liveClassQuestionsTable).set({ upvoteCount: sql`greatest(0, ${liveClassQuestionsTable.upvoteCount} - 1)` }).where(eq(liveClassQuestionsTable.id, questionId));
      res.json({ upvoted: false });
    } else {
      await db.insert(liveClassQuestionUpvotesTable).values({ questionId, userId: clerkId });
      await db.update(liveClassQuestionsTable).set({ upvoteCount: sql`${liveClassQuestionsTable.upvoteCount} + 1` }).where(eq(liveClassQuestionsTable.id, questionId));
      res.json({ upvoted: true });
    }
  } catch (err) {
    req.log.error({ err }, "Error upvoting question");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POLLS ─────────────────────────────────────────────────────────────────

// GET /api/live-classes/:classId/polls
router.get("/live-classes/:classId/polls", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    const classId = parseInt(req.params.classId);
    if (isNaN(classId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const polls = await db.select().from(liveClassPollsTable).where(eq(liveClassPollsTable.classId, classId)).orderBy(desc(liveClassPollsTable.createdAt)).limit(20);
    let votedMap: Map<number, number> = new Map();
    if (clerkId) {
      const votes = await db.select({ pollId: liveClassPollVotesTable.pollId, optionId: liveClassPollVotesTable.optionId })
        .from(liveClassPollVotesTable).where(eq(liveClassPollVotesTable.userId, clerkId));
      votes.forEach((v) => votedMap.set(v.pollId, v.optionId));
    }
    const result = await Promise.all(polls.map(async (poll) => {
      const options = await db.select().from(liveClassPollOptionsTable).where(eq(liveClassPollOptionsTable.pollId, poll.id));
      return { ...poll, options, myVoteOptionId: votedMap.get(poll.id) ?? null };
    }));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error listing polls");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/live-classes/:classId/polls (instructor only)
router.post("/live-classes/:classId/polls", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const classId = parseInt(req.params.classId);
    if (isNaN(classId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const cls = await db.select({ instructorId: liveClassesTable.instructorId }).from(liveClassesTable).where(eq(liveClassesTable.id, classId)).limit(1).then((r) => r[0]);
    if (!cls || cls.instructorId !== clerkId) { res.status(403).json({ error: "Instructor only" }); return; }
    const { question, options } = req.body as { question: string; options: string[] };
    if (!question?.trim() || !Array.isArray(options) || options.length < 2) { res.status(400).json({ error: "question and at least 2 options required" }); return; }
    await db.update(liveClassPollsTable).set({ isActive: false }).where(eq(liveClassPollsTable.classId, classId));
    const poll = await db.insert(liveClassPollsTable).values({ classId, question: question.trim(), isActive: true }).returning().then((r) => r[0]);
    const opts = await db.insert(liveClassPollOptionsTable).values(options.map((text) => ({ pollId: poll.id, text: text.trim() }))).returning();
    res.status(201).json({ ...poll, options: opts, myVoteOptionId: null });
  } catch (err) {
    req.log.error({ err }, "Error creating poll");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/live-classes/:classId/polls/:pollId (instructor: open/close)
router.patch("/live-classes/:classId/polls/:pollId", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const classId = parseInt(req.params.classId);
    const pollId = parseInt(req.params.pollId);
    if (isNaN(classId) || isNaN(pollId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const cls = await db.select({ instructorId: liveClassesTable.instructorId }).from(liveClassesTable).where(eq(liveClassesTable.id, classId)).limit(1).then((r) => r[0]);
    if (!cls || cls.instructorId !== clerkId) { res.status(403).json({ error: "Instructor only" }); return; }
    const { isActive } = req.body;
    const updated = await db.update(liveClassPollsTable).set({ isActive: !!isActive }).where(and(eq(liveClassPollsTable.id, pollId), eq(liveClassPollsTable.classId, classId))).returning().then((r) => r[0]);
    if (!updated) { res.status(404).json({ error: "Poll not found" }); return; }
    const options = await db.select().from(liveClassPollOptionsTable).where(eq(liveClassPollOptionsTable.pollId, pollId));
    res.json({ ...updated, options, myVoteOptionId: null });
  } catch (err) {
    req.log.error({ err }, "Error updating poll");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/live-classes/:classId/polls/:pollId/vote
router.post("/live-classes/:classId/polls/:pollId/vote", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const classId = parseInt(req.params.classId);
    const pollId = parseInt(req.params.pollId);
    if (isNaN(classId) || isNaN(pollId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { optionId } = req.body as { optionId: number };
    if (!optionId) { res.status(400).json({ error: "optionId required" }); return; }
    const poll = await db.select().from(liveClassPollsTable).where(and(eq(liveClassPollsTable.id, pollId), eq(liveClassPollsTable.classId, classId))).limit(1).then((r) => r[0]);
    if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }
    if (!poll.isActive) { res.status(400).json({ error: "Poll is closed" }); return; }
    const existing = await db.select().from(liveClassPollVotesTable).where(and(eq(liveClassPollVotesTable.pollId, pollId), eq(liveClassPollVotesTable.userId, clerkId))).limit(1).then((r) => r[0]);
    if (existing) {
      await db.update(liveClassPollOptionsTable).set({ voteCount: sql`greatest(0, ${liveClassPollOptionsTable.voteCount} - 1)` }).where(eq(liveClassPollOptionsTable.id, existing.optionId));
      await db.update(liveClassPollVotesTable).set({ optionId }).where(and(eq(liveClassPollVotesTable.pollId, pollId), eq(liveClassPollVotesTable.userId, clerkId)));
    } else {
      await db.insert(liveClassPollVotesTable).values({ pollId, optionId, userId: clerkId });
    }
    await db.update(liveClassPollOptionsTable).set({ voteCount: sql`${liveClassPollOptionsTable.voteCount} + 1` }).where(eq(liveClassPollOptionsTable.id, optionId));
    const options = await db.select().from(liveClassPollOptionsTable).where(eq(liveClassPollOptionsTable.pollId, pollId));
    res.json({ ...poll, options, myVoteOptionId: optionId });
  } catch (err) {
    req.log.error({ err }, "Error voting on poll");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/live-classes/:classId/token  — LiveKit JWT for the room
router.get("/live-classes/:classId/token", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const classId = parseInt(req.params.classId);
    const classes = await db.select().from(liveClassesTable).where(eq(liveClassesTable.id, classId)).limit(1);
    if (!classes.length) { res.status(404).json({ error: "Not found" }); return; }
    const cls = classes[0];

    const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
    const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
    const LIVEKIT_URL = process.env.LIVEKIT_URL ?? "";

    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
      res.status(503).json({ error: "LiveKit not configured. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL in env vars." });
      return;
    }

    if (!cls.roomName) { res.status(400).json({ error: "Room name not set" }); return; }

    const isInstructor = cls.instructorId === clerkId;

    // Access control: instructors always get in; students must be in the right batch/course
    if (!isInstructor) {
      const user = await db.select({ role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.id, clerkId))
        .limit(1).then((r) => r[0]);

      const isAdmin = user?.role === "admin";

      if (!isAdmin) {
        if (cls.batchId) {
          // Batch-restricted session: student must be in this batch
          const inBatch = await db.select({ id: batchStudentsTable.id })
            .from(batchStudentsTable)
            .where(and(eq(batchStudentsTable.batchId, cls.batchId), eq(batchStudentsTable.userId, clerkId)))
            .limit(1).then((r) => r[0]);
          if (!inBatch) {
            res.status(403).json({ error: "You are not part of the batch for this session." });
            return;
          }
        } else if (cls.courseId) {
          // Course-wide session: student must be enrolled
          const enrolled = await db.select({ id: enrollmentsTable.id })
            .from(enrollmentsTable)
            .where(and(eq(enrollmentsTable.courseId, cls.courseId), eq(enrollmentsTable.userId, clerkId), eq(enrollmentsTable.status, "active")))
            .limit(1).then((r) => r[0]);
          if (!enrolled) {
            res.status(403).json({ error: "You are not enrolled in the course for this session." });
            return;
          }
        }
      }
    }

    const users = await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, clerkId)).limit(1);
    const displayName = users[0]?.displayName ?? clerkId;

    const { AccessToken } = await import("livekit-server-sdk");
    // Use a deterministic identity (clerkId) so that if the same user
    // refreshes or reconnects, LiveKit recognises them as the same participant
    // and replaces the old session instead of creating a ghost duplicate.
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: clerkId,
      name: displayName,
      ttl: 7200,
    });
    at.addGrant({
      roomJoin: true,
      room: cls.roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomAdmin: isInstructor,
    });

    const token = await at.toJwt();
    res.json({ token, url: LIVEKIT_URL });
  } catch (err) {
    req.log.error({ err }, "Error generating LiveKit token");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
