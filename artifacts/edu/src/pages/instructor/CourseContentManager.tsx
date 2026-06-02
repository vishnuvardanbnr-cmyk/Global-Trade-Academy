import { useState } from "react";
import {
  useListLessons, useCreateLesson, useUpdateLesson, useDeleteLesson, useReorderLessons,
  useListCourseSections, useCreateCourseSection, useUpdateCourseSection, useDeleteCourseSection, useReorderCourseSections,
  useListQuizzes, useCreateQuiz, useDeleteQuiz,
  useListTasks, useCreateTask, useDeleteTask,
  getListLessonsQueryKey, getListQuizzesQueryKey, getListTasksQueryKey, getListCourseSectionsQueryKey,
  type Lesson, type CourseSection, type QuizQuestionInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Trash2, Pencil, Video, FileText, GripVertical, Lock, Unlock,
  HelpCircle, CheckCircle2, X, Clock, Link2, ChevronDown, ChevronUp,
  FolderOpen, FolderClosed, MoveVertical, ArrowUp, ArrowDown, LayoutList,
} from "lucide-react";
import { cn } from "@/lib/utils";

const LESSON_TYPES = ["video", "article", "exercise"];

/* ─────────────── Lesson form (shared) ─────────────── */
interface LessonFormState {
  title: string; description: string; type: string;
  videoUrl: string; content: string; duration: string;
  isFree: boolean; dripDays: string; sectionId: string;
}
const defaultLessonForm = (sectionId?: number): LessonFormState => ({
  title: "", description: "", type: "video", videoUrl: "", content: "",
  duration: "", isFree: false, dripDays: "0", sectionId: sectionId != null ? String(sectionId) : "none",
});

/* ─────────────── Sections + Lessons Manager ─────────────── */
function LessonsManager({ courseId }: { courseId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: sections, isLoading: sectionsLoading } = useListCourseSections(courseId, {
    query: { enabled: courseId > 0, queryKey: getListCourseSectionsQueryKey(courseId) },
  });
  const { data: lessons, isLoading: lessonsLoading } = useListLessons(courseId, {
    query: { enabled: courseId > 0, queryKey: getListLessonsQueryKey(courseId) },
  });
  const { mutateAsync: createLesson, isPending: creatingLesson } = useCreateLesson();
  const { mutateAsync: updateLesson, isPending: updatingLesson } = useUpdateLesson();
  const { mutateAsync: deleteLesson } = useDeleteLesson();
  const { mutateAsync: reorderLessons } = useReorderLessons();
  const { mutateAsync: createSection, isPending: creatingSection } = useCreateCourseSection();
  const { mutateAsync: updateSection } = useUpdateCourseSection();
  const { mutateAsync: deleteSection } = useDeleteCourseSection();
  const { mutateAsync: reorderSections } = useReorderCourseSections();

  const [collapsedSections, setCollapsedSections] = useState<Set<number | "none">>(new Set());
  const [editingSectionId, setEditingSectionId] = useState<number | null>(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState("");
  const [addingSectionTitle, setAddingSectionTitle] = useState("");
  const [showAddSection, setShowAddSection] = useState(false);

  // Lesson form state (null = not open; "new-<sectionId|none>" or lessonId)
  const [lessonFormTarget, setLessonFormTarget] = useState<string | null>(null);
  const [lessonForm, setLessonForm] = useState<LessonFormState>(defaultLessonForm());
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);

  const invalidateLessons = () => qc.invalidateQueries({ queryKey: getListLessonsQueryKey(courseId) });
  const invalidateSections = () => qc.invalidateQueries({ queryKey: getListCourseSectionsQueryKey(courseId) });

  const sortedSections = [...(sections ?? [])].sort((a, b) => a.position - b.position);
  const allLessons = [...(lessons ?? [])].sort((a, b) => a.order - b.order);

  const lessonsBySection = (sectionId: number | null): Lesson[] =>
    allLessons.filter((l) => (sectionId == null ? l.sectionId == null : l.sectionId === sectionId));

  const toggleSection = (id: number | "none") =>
    setCollapsedSections((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  /* ── Section CRUD ── */
  const addSection = async () => {
    if (!addingSectionTitle.trim()) return;
    try {
      await createSection({ courseId, data: { title: addingSectionTitle.trim() } });
      invalidateSections(); setAddingSectionTitle(""); setShowAddSection(false);
      toast({ title: "Section added" });
    } catch { toast({ title: "Could not add section", variant: "destructive" }); }
  };

  const saveSection = async (id: number) => {
    if (!editingSectionTitle.trim()) return;
    try {
      await updateSection({ sectionId: id, data: { title: editingSectionTitle.trim() } });
      invalidateSections(); setEditingSectionId(null);
    } catch { toast({ title: "Could not update section", variant: "destructive" }); }
  };

  const removeSection = async (id: number) => {
    try {
      await deleteSection({ sectionId: id });
      invalidateSections(); invalidateLessons();
      toast({ title: "Section deleted (lessons moved to unsectioned)" });
    } catch { toast({ title: "Could not delete section", variant: "destructive" }); }
  };

  const moveSectionUp = async (idx: number) => {
    if (idx === 0) return;
    const reordered = [...sortedSections];
    [reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]];
    const positions = reordered.map((s, i) => ({ id: s.id, position: i }));
    try {
      await reorderSections({ courseId, data: { positions } });
      invalidateSections();
    } catch { toast({ title: "Could not reorder", variant: "destructive" }); }
  };

  const moveSectionDown = async (idx: number) => {
    if (idx === sortedSections.length - 1) return;
    const reordered = [...sortedSections];
    [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
    const positions = reordered.map((s, i) => ({ id: s.id, position: i }));
    try {
      await reorderSections({ courseId, data: { positions } });
      invalidateSections();
    } catch { toast({ title: "Could not reorder", variant: "destructive" }); }
  };

  /* ── Lesson reorder within section ── */
  const moveLessonUp = async (lesson: Lesson, group: Lesson[]) => {
    const idx = group.findIndex((l) => l.id === lesson.id);
    if (idx === 0) return;
    const reordered = [...group];
    [reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]];
    const updates = reordered.map((l, i) => ({ id: l.id, order: i + 1, sectionId: l.sectionId ?? null }));
    try { await reorderLessons({ courseId, data: { updates } }); invalidateLessons(); }
    catch { toast({ title: "Could not reorder", variant: "destructive" }); }
  };

  const moveLessonDown = async (lesson: Lesson, group: Lesson[]) => {
    const idx = group.findIndex((l) => l.id === lesson.id);
    if (idx === group.length - 1) return;
    const reordered = [...group];
    [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
    const updates = reordered.map((l, i) => ({ id: l.id, order: i + 1, sectionId: l.sectionId ?? null }));
    try { await reorderLessons({ courseId, data: { updates } }); invalidateLessons(); }
    catch { toast({ title: "Could not reorder", variant: "destructive" }); }
  };

  const moveLessonToSection = async (lesson: Lesson, targetSectionId: number | null) => {
    const targetGroup = lessonsBySection(targetSectionId);
    const newOrder = targetGroup.length + 1;
    try {
      await updateLesson({ lessonId: lesson.id, data: { sectionId: targetSectionId } as any });
      await reorderLessons({ courseId, data: { updates: [{ id: lesson.id, order: newOrder, sectionId: targetSectionId }] } });
      invalidateLessons();
      toast({ title: "Moved lesson" });
    } catch { toast({ title: "Could not move lesson", variant: "destructive" }); }
  };

  /* ── Lesson CRUD ── */
  const openNewLessonForm = (sectionId?: number) => {
    setEditingLesson(null);
    setLessonForm(defaultLessonForm(sectionId));
    setLessonFormTarget(`new-${sectionId ?? "none"}`);
  };

  const openEditLessonForm = (l: Lesson) => {
    setEditingLesson(l);
    setLessonForm({
      title: l.title, description: l.description ?? "", type: l.type,
      videoUrl: l.videoUrl ?? "", content: l.content ?? "",
      duration: l.duration != null ? String(l.duration) : "",
      isFree: l.isFree ?? false, dripDays: String(l.dripDays ?? 0),
      sectionId: l.sectionId != null ? String(l.sectionId) : "none",
    });
    setLessonFormTarget(`edit-${l.id}`);
  };

  const closeLessonForm = () => { setLessonFormTarget(null); setEditingLesson(null); };

  const submitLesson = async () => {
    if (!lessonForm.title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    const sectionIdVal = lessonForm.sectionId !== "none" ? parseInt(lessonForm.sectionId) : null;
    const groupForOrder = lessonsBySection(sectionIdVal);
    const payload = {
      title: lessonForm.title.trim(),
      description: lessonForm.description || undefined,
      type: lessonForm.type,
      videoUrl: lessonForm.videoUrl || undefined,
      content: lessonForm.content || undefined,
      duration: lessonForm.duration ? parseInt(lessonForm.duration) : undefined,
      isFree: lessonForm.isFree,
      dripDays: lessonForm.dripDays ? parseInt(lessonForm.dripDays) : 0,
      sectionId: sectionIdVal as any,
    };
    try {
      if (editingLesson) {
        await updateLesson({ lessonId: editingLesson.id, data: payload });
        toast({ title: "Lesson updated" });
      } else {
        const order = groupForOrder.length + 1;
        await createLesson({ courseId, data: { ...payload, order } });
        toast({ title: "Lesson added" });
      }
      invalidateLessons(); closeLessonForm();
    } catch { toast({ title: "Could not save lesson", variant: "destructive" }); }
  };

  const removeLesson = async (id: number) => {
    try { await deleteLesson({ lessonId: id }); invalidateLessons(); toast({ title: "Lesson deleted" }); }
    catch { toast({ title: "Could not delete lesson", variant: "destructive" }); }
  };

  /* ── Render ── */
  const isLoading = sectionsLoading || lessonsLoading;
  const unsectionedLessons = lessonsBySection(null);

  const LessonFormPanel = ({ inSectionId }: { inSectionId?: number }) => {
    const key = editingLesson ? `edit-${editingLesson.id}` : `new-${inSectionId ?? "none"}`;
    if (lessonFormTarget !== key) return null;
    return (
      <div className="mx-3 mb-3 rounded-xl border border-border p-4 space-y-3 bg-white shadow-sm">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-sm">{editingLesson ? "Edit Lesson" : "New Lesson"}</h4>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={closeLessonForm}><X className="h-4 w-4" /></Button>
        </div>
        <Input placeholder="Lesson title *" value={lessonForm.title} onChange={(e) => setLessonForm(f => ({ ...f, title: e.target.value }))} data-testid="input-lesson-title" />
        <Textarea placeholder="Short description" rows={2} value={lessonForm.description} onChange={(e) => setLessonForm(f => ({ ...f, description: e.target.value }))} />
        <div className="grid grid-cols-2 gap-3">
          <Select value={lessonForm.type} onValueChange={(v) => setLessonForm(f => ({ ...f, type: v }))}>
            <SelectTrigger data-testid="select-lesson-type"><SelectValue /></SelectTrigger>
            <SelectContent>{LESSON_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="number" min="0" placeholder="Duration (min)" value={lessonForm.duration} onChange={(e) => setLessonForm(f => ({ ...f, duration: e.target.value }))} />
        </div>
        {lessonForm.type === "video" ? (
          <Input placeholder="Video URL" value={lessonForm.videoUrl} onChange={(e) => setLessonForm(f => ({ ...f, videoUrl: e.target.value }))} />
        ) : (
          <Textarea placeholder="Lesson content (markdown supported)" rows={4} value={lessonForm.content} onChange={(e) => setLessonForm(f => ({ ...f, content: e.target.value }))} />
        )}
        <div className="grid grid-cols-2 gap-3 items-center">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={lessonForm.isFree} onChange={(e) => setLessonForm(f => ({ ...f, isFree: e.target.checked }))} className="h-4 w-4 rounded border-border" />
            Free preview
          </label>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input type="number" min="0" placeholder="Drip days" value={lessonForm.dripDays} onChange={(e) => setLessonForm(f => ({ ...f, dripDays: e.target.value }))} title="Days after enrollment before lesson unlocks" />
          </div>
        </div>
        {/* Section picker (only show when not already in a specific section context) */}
        {sortedSections.length > 0 && (
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Section</label>
            <Select value={lessonForm.sectionId} onValueChange={(v) => setLessonForm(f => ({ ...f, sectionId: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Unsectioned —</SelectItem>
                {sortedSections.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={closeLessonForm}>Cancel</Button>
          <Button size="sm" onClick={submitLesson} disabled={creatingLesson || updatingLesson} data-testid="button-save-lesson">
            {editingLesson ? "Save Changes" : "Add Lesson"}
          </Button>
        </div>
      </div>
    );
  };

  const LessonRow = ({ l, group }: { l: Lesson; group: Lesson[] }) => {
    const idx = group.findIndex((x) => x.id === l.id);
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-secondary/30 transition-colors group/row border-b border-border/30 last:border-0">
        <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0" />
        <div className="flex flex-col gap-0.5 mr-0.5">
          <button onClick={() => moveLessonUp(l, group)} disabled={idx === 0} className="h-3 w-3 flex items-center justify-center text-muted-foreground/40 hover:text-foreground disabled:opacity-20">
            <ArrowUp className="h-2.5 w-2.5" />
          </button>
          <button onClick={() => moveLessonDown(l, group)} disabled={idx === group.length - 1} className="h-3 w-3 flex items-center justify-center text-muted-foreground/40 hover:text-foreground disabled:opacity-20">
            <ArrowDown className="h-2.5 w-2.5" />
          </button>
        </div>
        <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center shrink-0">
          {l.type === "video" ? <Video className="h-3.5 w-3.5 text-muted-foreground" /> : <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate text-foreground">{idx + 1}. {l.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <Badge variant="outline" className="text-[10px] h-4 capitalize">{l.type}</Badge>
            {l.isFree ? (
              <span className="text-[10px] text-emerald-600 flex items-center gap-0.5"><Unlock className="h-2.5 w-2.5" /> Free</span>
            ) : (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Lock className="h-2.5 w-2.5" /> Paid</span>
            )}
            {(l.dripDays ?? 0) > 0 && <span className="text-[10px] text-amber-600">Day {l.dripDays}</span>}
            {l.duration != null && <span className="text-[10px] text-muted-foreground">{l.duration}m</span>}
          </div>
        </div>
        {/* Move to section dropdown */}
        {(sortedSections.length > 0) && (
          <Select
            value={l.sectionId != null ? String(l.sectionId) : "none"}
            onValueChange={(v) => moveLessonToSection(l, v === "none" ? null : parseInt(v))}
          >
            <SelectTrigger className="h-7 w-7 p-0 border-0 opacity-0 group-hover/row:opacity-100 transition-opacity" title="Move to section">
              <MoveVertical className="h-3.5 w-3.5 text-muted-foreground" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unsectioned</SelectItem>
              {sortedSections.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover/row:opacity-100 transition-opacity" onClick={() => openEditLessonForm(l)} data-testid={`button-edit-lesson-${l.id}`}><Pencil className="h-3 w-3" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive opacity-0 group-hover/row:opacity-100 transition-opacity" onClick={() => removeLesson(l.id)} data-testid={`button-delete-lesson-${l.id}`}><Trash2 className="h-3 w-3" /></Button>
      </div>
    );
  };

  const SectionCard = ({ section, idx }: { section: CourseSection; idx: number }) => {
    const sectionLessons = lessonsBySection(section.id);
    const collapsed = collapsedSections.has(section.id);
    const isEditing = editingSectionId === section.id;

    return (
      <div className="rounded-xl border border-border overflow-hidden bg-white" data-testid={`section-${section.id}`}>
        {/* Section header */}
        <div className={cn("flex items-center gap-2 px-3 py-2.5 bg-secondary/40 border-b border-border/60 group/sec", collapsed && "border-b-0")}>
          {/* Reorder */}
          <div className="flex flex-col gap-0.5 shrink-0">
            <button onClick={() => moveSectionUp(idx)} disabled={idx === 0} className="h-3 w-3 flex items-center justify-center text-muted-foreground/40 hover:text-foreground disabled:opacity-20">
              <ArrowUp className="h-2.5 w-2.5" />
            </button>
            <button onClick={() => moveSectionDown(idx)} disabled={idx === sortedSections.length - 1} className="h-3 w-3 flex items-center justify-center text-muted-foreground/40 hover:text-foreground disabled:opacity-20">
              <ArrowDown className="h-2.5 w-2.5" />
            </button>
          </div>

          {collapsed ? <FolderClosed className="h-4 w-4 text-muted-foreground shrink-0" /> : <FolderOpen className="h-4 w-4 text-primary shrink-0" />}

          {isEditing ? (
            <Input
              autoFocus
              className="h-7 text-sm font-semibold flex-1"
              value={editingSectionTitle}
              onChange={(e) => setEditingSectionTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveSection(section.id); if (e.key === "Escape") setEditingSectionId(null); }}
            />
          ) : (
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleSection(section.id)}>
              <p className="font-semibold text-sm text-foreground truncate">{section.title}</p>
              <p className="text-[10.5px] text-muted-foreground">{sectionLessons.length} lesson{sectionLessons.length !== 1 ? "s" : ""}</p>
            </div>
          )}

          <div className="flex items-center gap-1 ml-auto">
            {isEditing ? (
              <>
                <Button size="sm" className="h-6 text-xs" onClick={() => saveSection(section.id)}>Save</Button>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingSectionId(null)}>Cancel</Button>
              </>
            ) : (
              <>
                <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover/sec:opacity-100 transition-opacity"
                  onClick={() => { setEditingSectionId(section.id); setEditingSectionTitle(section.title); }}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive opacity-0 group-hover/sec:opacity-100 transition-opacity"
                  onClick={() => removeSection(section.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
                <button onClick={() => toggleSection(section.id)} className="p-1 rounded hover:bg-secondary transition-colors">
                  {collapsed ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Lesson list */}
        {!collapsed && (
          <>
            {sectionLessons.length === 0 && lessonFormTarget !== `new-${section.id}` && (
              <p className="text-xs text-muted-foreground text-center py-4">No lessons yet in this section.</p>
            )}
            {sectionLessons.map((l) => (
              <div key={l.id}>
                <LessonRow l={l} group={sectionLessons} />
                {lessonFormTarget === `edit-${l.id}` && <LessonFormPanel inSectionId={section.id} />}
              </div>
            ))}
            <LessonFormPanel inSectionId={section.id} />
            {lessonFormTarget !== `new-${section.id}` && (
              <div className="px-3 py-2">
                <Button size="sm" variant="outline" className="w-full border-dashed h-8 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => openNewLessonForm(section.id)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Lesson to "{section.title}"
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  if (isLoading) return (
    <div className="space-y-3">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
  );

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {sortedSections.length} section{sortedSections.length !== 1 ? "s" : ""} · {allLessons.length} lessons
        </p>
        <div className="flex gap-2">
          {lessonFormTarget === null && unsectionedLessons.length === 0 && sortedSections.length === 0 && (
            <Button size="sm" variant="outline" onClick={() => openNewLessonForm()} data-testid="button-add-lesson">
              <Plus className="h-4 w-4 mr-1.5" /> Add Lesson
            </Button>
          )}
          {!showAddSection && (
            <Button size="sm" onClick={() => setShowAddSection(true)} data-testid="button-add-section">
              <Plus className="h-4 w-4 mr-1.5" /> Add Section
            </Button>
          )}
        </div>
      </div>

      {/* Add section form */}
      {showAddSection && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-center gap-2">
          <LayoutList className="h-4 w-4 text-primary shrink-0" />
          <Input
            autoFocus
            className="flex-1 h-8 text-sm"
            placeholder="Section title (e.g. Module 1: Fundamentals)"
            value={addingSectionTitle}
            onChange={(e) => setAddingSectionTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addSection(); if (e.key === "Escape") { setShowAddSection(false); setAddingSectionTitle(""); } }}
          />
          <Button size="sm" onClick={addSection} disabled={creatingSection || !addingSectionTitle.trim()}>Add</Button>
          <Button size="sm" variant="ghost" onClick={() => { setShowAddSection(false); setAddingSectionTitle(""); }}><X className="h-4 w-4" /></Button>
        </div>
      )}

      {/* Sections */}
      {sortedSections.map((section, idx) => (
        <SectionCard key={section.id} section={section} idx={idx} />
      ))}

      {/* Unsectioned lessons */}
      {(unsectionedLessons.length > 0 || lessonFormTarget?.startsWith("new-none") || lessonFormTarget?.startsWith("edit-")) && (
        <div className={cn("rounded-xl border overflow-hidden bg-white", sortedSections.length > 0 ? "border-dashed border-muted-foreground/30" : "border-border")}>
          {sortedSections.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-secondary/20 border-b border-border/40">
              <LayoutList className="h-4 w-4 text-muted-foreground shrink-0" />
              <p className="text-xs font-semibold text-muted-foreground flex-1">Unsectioned Lessons</p>
              <span className="text-[10.5px] text-muted-foreground">{unsectionedLessons.length}</span>
            </div>
          )}
          {unsectionedLessons.map((l) => (
            <div key={l.id}>
              <LessonRow l={l} group={unsectionedLessons} />
              {lessonFormTarget === `edit-${l.id}` && <LessonFormPanel />}
            </div>
          ))}
          <LessonFormPanel />
          {lessonFormTarget !== "new-none" && (
            <div className="px-3 py-2">
              <Button size="sm" variant="outline" className="w-full border-dashed h-8 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => openNewLessonForm()} data-testid="button-add-lesson">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Lesson
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Empty state — no sections AND no lessons */}
      {sortedSections.length === 0 && allLessons.length === 0 && !lessonFormTarget && !showAddSection && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <LayoutList className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Start building your curriculum</p>
          <p className="text-xs text-muted-foreground mb-4">Create sections to organise your course, then add lessons inside them.</p>
          <div className="flex gap-2 justify-center">
            <Button size="sm" onClick={() => setShowAddSection(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Section
            </Button>
            <Button size="sm" variant="outline" onClick={() => openNewLessonForm()} data-testid="button-add-lesson">
              <Plus className="h-4 w-4 mr-1.5" /> Add Lesson
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────── Quizzes ─────────────── */
const emptyQuestion = (): QuizQuestionInput => ({ question: "", options: ["", "", "", ""], correctIndex: 0, explanation: "" });

function QuizzesManager({ courseId }: { courseId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: quizzes, isLoading } = useListQuizzes(courseId, { query: { enabled: courseId > 0, queryKey: getListQuizzesQueryKey(courseId) } });
  const { data: lessons } = useListLessons(courseId, { query: { enabled: courseId > 0, queryKey: getListLessonsQueryKey(courseId) } });
  const { mutateAsync: createQuiz, isPending: creating } = useCreateQuiz();
  const { mutateAsync: deleteQuiz } = useDeleteQuiz();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [lessonId, setLessonId] = useState<string>("none");
  const [passingScore, setPassingScore] = useState("70");
  const [xpReward, setXpReward] = useState("50");
  const [questions, setQuestions] = useState<QuizQuestionInput[]>([emptyQuestion()]);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListQuizzesQueryKey(courseId) });

  const reset = () => {
    setTitle(""); setLessonId("none"); setPassingScore("70"); setXpReward("50");
    setQuestions([emptyQuestion()]); setShowForm(false);
  };

  const submit = async () => {
    if (!title.trim()) { toast({ title: "Quiz title required", variant: "destructive" }); return; }
    const cleaned = questions
      .map((q, i) => ({ ...q, order: i + 1, options: q.options.map(o => o.trim()).filter(Boolean) }))
      .filter(q => q.question.trim() && q.options.length >= 2);
    if (cleaned.length === 0) { toast({ title: "Add at least one complete question", variant: "destructive" }); return; }
    try {
      await createQuiz({ courseId, data: {
        title: title.trim(),
        lessonId: lessonId !== "none" ? parseInt(lessonId) : undefined,
        passingScore: parseInt(passingScore) || 70,
        xpReward: parseInt(xpReward) || 50,
        questions: cleaned,
      } });
      invalidate(); reset(); toast({ title: "Quiz created" });
    } catch { toast({ title: "Could not create quiz", variant: "destructive" }); }
  };

  const remove = async (id: number) => {
    try { await deleteQuiz({ quizId: id }); invalidate(); toast({ title: "Quiz deleted" }); }
    catch { toast({ title: "Could not delete quiz", variant: "destructive" }); }
  };

  const updateQuestion = (idx: number, patch: Partial<QuizQuestionInput>) =>
    setQuestions(qs => qs.map((q, i) => i === idx ? { ...q, ...patch } : q));
  const updateOption = (qIdx: number, oIdx: number, val: string) =>
    setQuestions(qs => qs.map((q, i) => i === qIdx ? { ...q, options: q.options.map((o, j) => j === oIdx ? val : o) } : q));

  const lessonMap = new Map((lessons ?? []).map((l) => [l.id, l.title]));
  const sortedLessons = [...(lessons ?? [])].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{quizzes?.length ?? 0} quizzes</p>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)} data-testid="button-add-quiz"><Plus className="h-4 w-4 mr-1.5" /> Add Quiz</Button>
        )}
      </div>

      {showForm && (
        <div className="rounded-xl border border-border p-4 space-y-3 bg-secondary/30">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">New Quiz</h4>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={reset}><X className="h-4 w-4" /></Button>
          </div>
          <Input placeholder="Quiz title" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-quiz-title" />

          <div>
            <label className="text-xs text-muted-foreground block mb-1 flex items-center gap-1">
              <Link2 className="h-3 w-3" /> Link to lesson (gate quiz)
            </label>
            <Select value={lessonId} onValueChange={setLessonId}>
              <SelectTrigger data-testid="select-quiz-lesson">
                <SelectValue placeholder="None — standalone quiz" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None — standalone quiz</SelectItem>
                {sortedLessons.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.order}. {l.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {lessonId !== "none" && (
              <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
                <HelpCircle className="h-3 w-3" />
                Students must pass this quiz before unlocking the next lesson.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Passing score (%)</label>
              <Input type="number" min="0" max="100" value={passingScore} onChange={(e) => setPassingScore(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">XP reward</label>
              <Input type="number" min="0" value={xpReward} onChange={(e) => setXpReward(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3">
            {questions.map((q, qIdx) => (
              <div key={qIdx} className="rounded-lg border border-border p-3 space-y-2 bg-white">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Question {qIdx + 1}</span>
                  {questions.length > 1 && (
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => setQuestions(qs => qs.filter((_, i) => i !== qIdx))}><Trash2 className="h-3 w-3" /></Button>
                  )}
                </div>
                <Input placeholder="Question text" value={q.question} onChange={(e) => updateQuestion(qIdx, { question: e.target.value })} data-testid={`input-question-${qIdx}`} />
                <div className="space-y-1.5">
                  {q.options.map((opt, oIdx) => (
                    <div key={oIdx} className="flex items-center gap-2">
                      <button type="button" onClick={() => updateQuestion(qIdx, { correctIndex: oIdx })}
                        className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${q.correctIndex === oIdx ? "border-emerald-500 bg-emerald-500 text-white" : "border-border"}`}
                        title="Mark as correct answer">
                        {q.correctIndex === oIdx && <CheckCircle2 className="h-3 w-3" />}
                      </button>
                      <Input placeholder={`Option ${oIdx + 1}`} value={opt} onChange={(e) => updateOption(qIdx, oIdx, e.target.value)} className="h-8 text-sm" />
                    </div>
                  ))}
                </div>
                <Input placeholder="Explanation (shown after submission)" value={q.explanation ?? ""} onChange={(e) => updateQuestion(qIdx, { explanation: e.target.value })} className="text-sm" />
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setQuestions(qs => [...qs, emptyQuestion()])} data-testid="button-add-question">
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Question
            </Button>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={reset}>Cancel</Button>
            <Button size="sm" onClick={submit} disabled={creating} data-testid="button-save-quiz">Create Quiz</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (quizzes ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No quizzes yet.</p>
      ) : (
        <div className="space-y-2">
          {(quizzes ?? []).map((q) => (
            <div key={q.id} className="flex items-center gap-3 p-3 rounded-lg border border-border" data-testid={`row-quiz-${q.id}`}>
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0"><HelpCircle className="h-4 w-4 text-muted-foreground" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{q.title}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-[10px] text-muted-foreground">{q.questionCount ?? 0} questions</span>
                  <span className="text-[10px] text-muted-foreground">Pass {q.passingScore}%</span>
                  <span className="text-[10px] text-amber-600">+{q.xpReward} XP</span>
                  {q.lessonId && lessonMap.has(q.lessonId) && (
                    <span className="text-[10px] text-blue-600 flex items-center gap-0.5 font-medium">
                      <Link2 className="h-2.5 w-2.5" /> Gate: {lessonMap.get(q.lessonId)}
                    </span>
                  )}
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => remove(q.id)} data-testid={`button-delete-quiz-${q.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────── Tasks ─────────────── */
function TasksManager({ courseId }: { courseId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: tasks, isLoading } = useListTasks(courseId, { query: { enabled: courseId > 0, queryKey: getListTasksQueryKey(courseId) } });
  const { mutateAsync: createTask, isPending: creating } = useCreateTask();
  const { mutateAsync: deleteTask } = useDeleteTask();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", xpReward: "25" });

  const invalidate = () => qc.invalidateQueries({ queryKey: getListTasksQueryKey(courseId) });
  const reset = () => { setForm({ title: "", description: "", xpReward: "25" }); setShowForm(false); };

  const submit = async () => {
    if (!form.title.trim()) { toast({ title: "Task title required", variant: "destructive" }); return; }
    try {
      const order = (tasks?.length ?? 0) + 1;
      await createTask({ courseId, data: { title: form.title.trim(), description: form.description || undefined, xpReward: parseInt(form.xpReward) || 25, order } });
      invalidate(); reset(); toast({ title: "Task added" });
    } catch { toast({ title: "Could not add task", variant: "destructive" }); }
  };

  const remove = async (id: number) => {
    try { await deleteTask({ taskId: id }); invalidate(); toast({ title: "Task deleted" }); }
    catch { toast({ title: "Could not delete task", variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{tasks?.length ?? 0} tasks</p>
        {!showForm && <Button size="sm" onClick={() => setShowForm(true)} data-testid="button-add-task"><Plus className="h-4 w-4 mr-1.5" /> Add Task</Button>}
      </div>

      {showForm && (
        <div className="rounded-xl border border-border p-4 space-y-3 bg-secondary/30">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">New Task</h4>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={reset}><X className="h-4 w-4" /></Button>
          </div>
          <Input placeholder="Task title" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} data-testid="input-task-title" />
          <Textarea placeholder="Instructions for the student" rows={3} value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
          <div>
            <label className="text-xs text-muted-foreground">XP reward</label>
            <Input type="number" min="0" value={form.xpReward} onChange={(e) => setForm(f => ({ ...f, xpReward: e.target.value }))} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={reset}>Cancel</Button>
            <Button size="sm" onClick={submit} disabled={creating} data-testid="button-save-task">Add Task</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (tasks ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No tasks yet.</p>
      ) : (
        <div className="space-y-2">
          {(tasks ?? []).map((t) => (
            <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border border-border" data-testid={`row-task-${t.id}`}>
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0"><CheckCircle2 className="h-4 w-4 text-muted-foreground" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{t.order}. {t.title}</p>
                <span className="text-[10px] text-amber-600">+{t.xpReward} XP</span>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => remove(t.id)} data-testid={`button-delete-task-${t.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────── Container ─────────────── */
export default function CourseContentManager({ courseId }: { courseId: number }) {
  return (
    <Tabs defaultValue="lessons" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="lessons" data-testid="tab-lessons">Lessons</TabsTrigger>
        <TabsTrigger value="quizzes" data-testid="tab-quizzes">Quizzes</TabsTrigger>
        <TabsTrigger value="tasks" data-testid="tab-tasks">Tasks</TabsTrigger>
      </TabsList>
      <TabsContent value="lessons" className="mt-4"><LessonsManager courseId={courseId} /></TabsContent>
      <TabsContent value="quizzes" className="mt-4"><QuizzesManager courseId={courseId} /></TabsContent>
      <TabsContent value="tasks" className="mt-4"><TasksManager courseId={courseId} /></TabsContent>
    </Tabs>
  );
}
