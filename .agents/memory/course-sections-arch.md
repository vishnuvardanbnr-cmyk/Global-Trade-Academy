---
name: Course sections architecture
description: How sections work in the course player and instructor panel.
---

Sections are optional groupings of lessons under a course. The course player (`course-detail.tsx`) uses `buildSectionGroups` when sections exist, and `buildFlatGroups` (single "Course Content" group) when there are none. This means existing courses without sections continue to work.

**Why:** Sections were added after initial launch; backward compatibility with unsectioned courses is required.

**How to apply:** When rendering the course sidebar, always check `sections?.length > 0` before using section-aware logic. Unsectioned lessons (sectionId = null) are always appended at the end of the section groups as "Other Lessons".

The `CourseContentManager` (instructor panel, Lessons tab) shows sections as collapsible cards with inline rename/delete/reorder and per-section lesson management. Lessons can be moved between sections via a hover-reveal dropdown.
