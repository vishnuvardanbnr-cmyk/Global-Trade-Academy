import { Router } from "express";
import { getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { courseSectionsTable, lessonsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { ownsCourse } from "../lib/lms";

const router = Router();

function buildSectionResponse(s: typeof courseSectionsTable.$inferSelect) {
  return {
    id: s.id,
    courseId: s.courseId,
    title: s.title,
    description: s.description,
    position: s.position,
    createdAt: s.createdAt,
  };
}

// GET /api/courses/:courseId/sections
router.get("/courses/:courseId/sections", async (req, res): Promise<void> => {
  try {
    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const sections = await db
      .select()
      .from(courseSectionsTable)
      .where(eq(courseSectionsTable.courseId, courseId))
      .orderBy(asc(courseSectionsTable.position));

    res.json(sections.map(buildSectionResponse));
  } catch (err) {
    req.log.error({ err }, "Error listing sections");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/courses/:courseId/sections
router.post("/courses/:courseId/sections", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) { res.status(400).json({ error: "Invalid id" }); return; }
    if (!(await ownsCourse(clerkId, courseId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { title, description, position } = req.body;
    if (!title) { res.status(400).json({ error: "title required" }); return; }

    // Auto-assign position if not given
    const existing = await db
      .select({ position: courseSectionsTable.position })
      .from(courseSectionsTable)
      .where(eq(courseSectionsTable.courseId, courseId))
      .orderBy(asc(courseSectionsTable.position));
    const nextPos = position ?? (existing.length > 0 ? existing[existing.length - 1].position + 1 : 0);

    const inserted = await db.insert(courseSectionsTable).values({
      courseId,
      title,
      description,
      position: nextPos,
    }).returning();

    res.status(201).json(buildSectionResponse(inserted[0]));
  } catch (err) {
    req.log.error({ err }, "Error creating section");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/sections/:sectionId
router.patch("/sections/:sectionId", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const id = parseInt(req.params.sectionId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const section = await db
      .select()
      .from(courseSectionsTable)
      .where(eq(courseSectionsTable.id, id))
      .limit(1)
      .then((r) => r[0]);
    if (!section) { res.status(404).json({ error: "Section not found" }); return; }
    if (!(await ownsCourse(clerkId, section.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { title, description, position } = req.body;
    const updated = await db.update(courseSectionsTable).set({
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(position !== undefined && { position }),
    }).where(eq(courseSectionsTable.id, id)).returning();

    res.json(buildSectionResponse(updated[0]));
  } catch (err) {
    req.log.error({ err }, "Error updating section");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/sections/:sectionId
router.delete("/sections/:sectionId", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const id = parseInt(req.params.sectionId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const section = await db
      .select()
      .from(courseSectionsTable)
      .where(eq(courseSectionsTable.id, id))
      .limit(1)
      .then((r) => r[0]);
    if (!section) { res.status(204).send(); return; }
    if (!(await ownsCourse(clerkId, section.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }

    // Move orphaned lessons to unsectioned
    await db.update(lessonsTable)
      .set({ sectionId: null })
      .where(and(eq(lessonsTable.courseId, section.courseId), eq(lessonsTable.sectionId, id)));

    await db.delete(courseSectionsTable).where(eq(courseSectionsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting section");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/courses/:courseId/sections/reorder
router.post("/courses/:courseId/sections/reorder", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) { res.status(400).json({ error: "Invalid id" }); return; }
    if (!(await ownsCourse(clerkId, courseId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { positions } = req.body as { positions: { id: number; position: number }[] };
    if (!Array.isArray(positions)) { res.status(400).json({ error: "positions array required" }); return; }

    await Promise.all(
      positions.map(({ id, position }) =>
        db.update(courseSectionsTable)
          .set({ position })
          .where(and(eq(courseSectionsTable.id, id), eq(courseSectionsTable.courseId, courseId)))
      )
    );

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error reordering sections");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
