import { Router } from "express";
import { getAuth } from "../lib/auth";
import { broadcast } from "../lib/ws";
import { db } from "@workspace/db";
import {
  postsTable, commentsTable, postLikesTable, usersTable,
  communityChannelsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { canAccessChannel } from "./channels";

const router = Router();

async function getUserWithRole(clerkId: string) {
  return db.select({ role: usersTable.role, displayName: usersTable.displayName, avatarUrl: usersTable.avatarUrl })
    .from(usersTable).where(eq(usersTable.id, clerkId)).limit(1).then((r) => r[0] ?? null);
}

async function buildPostResponse(post: typeof postsTable.$inferSelect) {
  const [author, commentCount] = await Promise.all([
    db.select({ displayName: usersTable.displayName, avatarUrl: usersTable.avatarUrl }).from(usersTable).where(eq(usersTable.id, post.authorId)).limit(1),
    db.select({ count: sql<number>`count(*)::int` }).from(commentsTable).where(eq(commentsTable.postId, post.id)),
  ]);
  return {
    id: post.id,
    channelId: post.channelId ?? null,
    authorId: post.authorId,
    authorName: author[0]?.displayName ?? null,
    authorAvatar: author[0]?.avatarUrl ?? null,
    title: post.title,
    content: post.content,
    category: post.category,
    imageUrl: post.imageUrl,
    likes: post.likes,
    commentCount: commentCount[0]?.count ?? 0,
    isPinned: post.isPinned,
    createdAt: post.createdAt,
  };
}

/* ── GET /api/posts ─────────────────────────────────────────── */
router.get("/posts", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { category, authorId, channelId } = req.query as Record<string, string>;
    let query = db.select().from(postsTable).$dynamic();
    const conditions = [];
    if (category) conditions.push(eq(postsTable.category, category));
    if (authorId) conditions.push(eq(postsTable.authorId, authorId));
    if (channelId) {
      const cid = parseInt(channelId);
      if (!isNaN(cid)) conditions.push(eq(postsTable.channelId, cid));
    }
    if (conditions.length) query = query.where(and(...conditions));
    const posts = await query.orderBy(postsTable.isPinned, postsTable.createdAt).limit(100);
    const results = await Promise.all(posts.map(buildPostResponse));
    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Error listing posts");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/posts — any authenticated member ─────────────── */
router.post("/posts", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const user = await getUserWithRole(clerkId);
    if (!user) { res.status(403).json({ error: "User not found" }); return; }
    const { title, content, category, imageUrl, channelId } = req.body;
    if (!title) { res.status(400).json({ error: "title required" }); return; }
    if (channelId != null) {
      const channel = await db.select().from(communityChannelsTable).where(eq(communityChannelsTable.id, channelId)).limit(1).then((r) => r[0]);
      if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }
      const ok = await canAccessChannel(clerkId, user.role, channel);
      if (!ok) { res.status(403).json({ error: "No access to this channel" }); return; }
    }
    const inserted = await db.insert(postsTable).values({
      authorId: clerkId, title, content, category: category || "general",
      imageUrl, channelId: channelId ?? null,
    }).returning();
    res.status(201).json(await buildPostResponse(inserted[0]));
    if (channelId != null) broadcast(`community:${channelId}:posts`, null);
  } catch (err) {
    req.log.error({ err }, "Error creating post");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /api/posts/:postId ─────────────────────────────────── */
router.get("/posts/:postId", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.postId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const post = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1).then((r) => r[0]);
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }
    res.json(await buildPostResponse(post));
  } catch (err) {
    req.log.error({ err }, "Error getting post");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── PATCH /api/posts/:postId ───────────────────────────────── */
router.patch("/posts/:postId", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const id = parseInt(req.params.postId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { title, content, category, imageUrl, isPinned, channelId } = req.body;
    const updated = await db.update(postsTable).set({
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content }),
      ...(category !== undefined && { category }),
      ...(imageUrl !== undefined && { imageUrl }),
      ...(isPinned !== undefined && { isPinned }),
      ...(channelId !== undefined && { channelId }),
    }).where(eq(postsTable.id, id)).returning();
    if (!updated[0]) { res.status(404).json({ error: "Post not found" }); return; }
    res.json(await buildPostResponse(updated[0]));
  } catch (err) {
    req.log.error({ err }, "Error updating post");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── DELETE /api/posts/:postId ──────────────────────────────── */
router.delete("/posts/:postId", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const id = parseInt(req.params.postId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const post = await db.select({ authorId: postsTable.authorId }).from(postsTable).where(eq(postsTable.id, id)).limit(1).then((r) => r[0]);
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }
    const user = await getUserWithRole(clerkId);
    if (post.authorId !== clerkId && user?.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(postsTable).where(eq(postsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting post");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/posts/:postId/like ───────────────────────────── */
router.post("/posts/:postId/like", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const postId = parseInt(req.params.postId);
    if (isNaN(postId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const existingLike = await db.select().from(postLikesTable)
      .where(and(eq(postLikesTable.postId, postId), eq(postLikesTable.userId, clerkId)))
      .limit(1).then((r) => r[0]);
    const post = await db.select().from(postsTable).where(eq(postsTable.id, postId)).limit(1).then((r) => r[0]);
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }
    if (existingLike) {
      await db.delete(postLikesTable).where(and(eq(postLikesTable.postId, postId), eq(postLikesTable.userId, clerkId)));
      const updated = await db.update(postsTable).set({ likes: Math.max(0, post.likes - 1) }).where(eq(postsTable.id, postId)).returning();
      res.json(await buildPostResponse(updated[0]));
    } else {
      await db.insert(postLikesTable).values({ postId, userId: clerkId });
      const updated = await db.update(postsTable).set({ likes: post.likes + 1 }).where(eq(postsTable.id, postId)).returning();
      res.json(await buildPostResponse(updated[0]));
    }
  } catch (err) {
    req.log.error({ err }, "Error toggling like");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /api/posts/:postId/comments ───────────────────────── */
router.get("/posts/:postId/comments", async (req, res): Promise<void> => {
  try {
    const postId = parseInt(req.params.postId);
    if (isNaN(postId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const comments = await db.select().from(commentsTable).where(eq(commentsTable.postId, postId)).limit(100);
    const results = await Promise.all(comments.map(async (c) => {
      const author = await db.select({ displayName: usersTable.displayName, avatarUrl: usersTable.avatarUrl }).from(usersTable).where(eq(usersTable.id, c.authorId)).limit(1);
      return {
        id: c.id, postId: c.postId, authorId: c.authorId,
        authorName: author[0]?.displayName ?? null,
        authorAvatar: author[0]?.avatarUrl ?? null,
        content: c.content, likes: c.likes, createdAt: c.createdAt,
      };
    }));
    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Error listing comments");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/posts/:postId/comments ──────────────────────── */
router.post("/posts/:postId/comments", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const postId = parseInt(req.params.postId);
    if (isNaN(postId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { content } = req.body;
    if (!content) { res.status(400).json({ error: "content required" }); return; }
    const inserted = await db.insert(commentsTable).values({ postId, authorId: clerkId, content }).returning();
    const c = inserted[0];
    const author = await db.select({ displayName: usersTable.displayName, avatarUrl: usersTable.avatarUrl }).from(usersTable).where(eq(usersTable.id, clerkId)).limit(1);
    res.status(201).json({
      id: c.id, postId: c.postId, authorId: c.authorId,
      authorName: author[0]?.displayName ?? null,
      authorAvatar: author[0]?.avatarUrl ?? null,
      content: c.content, likes: c.likes, createdAt: c.createdAt,
    });
    broadcast(`community:post:${postId}:comments`, null);
  } catch (err) {
    req.log.error({ err }, "Error creating comment");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
