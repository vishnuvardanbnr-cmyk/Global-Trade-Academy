import { useState } from "react";
import {
  useListLessons, useCreateLesson, useUpdateLesson, useDeleteLesson,
  useListQuizzes, useCreateQuiz, useDeleteQuiz,
  useListTasks, useCreateTask, useDeleteTask,
  getListLessonsQueryKey, getListQuizzesQueryKey, getListTasksQueryKey,
  type Lesson, type QuizQuestionInput,
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
  HelpCircle, CheckCircle2, X, Clock,
} from "lucide-react";

const LESSON_TYPES = ["video", "article", "exercise"];

/* ─────────────── Lessons ─────────────── */
function LessonsManager({ courseId }: { courseId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: lessons, isLoading } = useListLessons(courseId, { query: { enabled: courseId > 0, queryKey: getListLessonsQueryKey(courseId) } });
  const { mutateAsync: createLesson, isPending: creating } = useCreateLesson();
  const { mutateAsync: updateLesson, isPending: updating } = useUpdateLesson();
  const { mutateAsync: deleteLesson } = useDeleteLesson();

  const [editing, setEditing] = useState<Lesson | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", type: "video", videoUrl: "", content: "", duration: "", isFree: false, dripDays: "0" });

  const invalidate = () => qc.invalidateQueries({ queryKey: getListLessonsQueryKey(courseId) });

  const resetForm = () => {
    setForm({ title: "", description: "", type: "video", videoUrl: "", content: "", duration: "", isFree: false, dripDays: "0" });
    setEditing(null);
    setShowForm(false);
  };

  const startEdit = (l: Lesson) => {
    setEditing(l);
    setForm({
      title: l.title,
      description: l.description ?? "",
      type: l.type,
      videoUrl: l.videoUrl ?? "",
      content: l.content ?? "",
      duration: l.duration != null ? String(l.duration) : "",
      isFree: l.isFree ?? false,
      dripDays: String(l.dripDays ?? 0),
    });
    setShowForm(true);
  };

  const submit = async () => {
    if (!form.title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    const payload = {
      title: form.title.trim(),
      description: form.description || undefined,
      type: form.type,
      videoUrl: form.videoUrl || undefined,
      content: form.content || undefined,
      duration: form.duration ? parseInt(form.duration) : undefined,
      isFree: form.isFree,
      dripDays: form.dripDays ? parseInt(form.dripDays) : 0,
    };
    try {
      if (editing) {
        await updateLesson({ lessonId: editing.id, data: payload });
        toast({ title: "Lesson updated" });
      } else {
        const order = (lessons?.length ?? 0) + 1;
        await createLesson({ courseId, data: { ...payload, order } });
        toast({ title: "Lesson added" });
      }
      invalidate();
      resetForm();
    } catch { toast({ title: "Could not save lesson", variant: "destructive" }); }
  };

  const remove = async (id: number) => {
    try { await deleteLesson({ lessonId: id }); invalidate(); toast({ title: "Lesson deleted" }); }
    catch { toast({ title: "Could not delete lesson", variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{lessons?.length ?? 0} lessons</p>
        {!showForm && (
          <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} data-testid="button-add-lesson">
            <Plus className="h-4 w-4 mr-1.5" /> Add Lesson
          </Button>
        )}
      </div>

      {showForm && (
        <div className="rounded-xl border border-border p-4 space-y-3 bg-secondary/30">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">{editing ? "Edit Lesson" : "New Lesson"}</h4>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={resetForm}><X className="h-4 w-4" /></Button>
          </div>
          <Input placeholder="Lesson title" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} data-testid="input-lesson-title" />
          <Textarea placeholder="Short description" rows={2} value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v }))}>
              <SelectTrigger data-testid="select-lesson-type"><SelectValue /></SelectTrigger>
              <SelectContent>{LESSON_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="number" min="0" placeholder="Duration (min)" value={form.duration} onChange={(e) => setForm(f => ({ ...f, duration: e.target.value }))} />
          </div>
          {form.type === "video" ? (
            <Input placeholder="Video URL" value={form.videoUrl} onChange={(e) => setForm(f => ({ ...f, videoUrl: e.target.value }))} />
          ) : (
            <Textarea placeholder="Lesson content (markdown supported)" rows={4} value={form.content} onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))} />
          )}
          <div className="grid grid-cols-2 gap-3 items-center">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.isFree} onChange={(e) => setForm(f => ({ ...f, isFree: e.target.checked }))} className="h-4 w-4 rounded border-border" data-testid="checkbox-lesson-free" />
              Free preview
            </label>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input type="number" min="0" placeholder="Drip days" value={form.dripDays} onChange={(e) => setForm(f => ({ ...f, dripDays: e.target.value }))} title="Days after enrollment before this lesson unlocks" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={resetForm}>Cancel</Button>
            <Button size="sm" onClick={submit} disabled={creating || updating} data-testid="button-save-lesson">
              {editing ? "Save Changes" : "Add Lesson"}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : (lessons ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No lessons yet. Add your first lesson above.</p>
      ) : (
        <div className="space-y-2">
          {(lessons ?? []).map((l) => (
            <div key={l.id} className="flex items-center gap-3 p-3 rounded-lg border border-border" data-testid={`row-lesson-${l.id}`}>
              <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                {l.type === "video" ? <Video className="h-4 w-4 text-muted-foreground" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{l.order}. {l.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="text-[10px] capitalize">{l.type}</Badge>
                  {l.isFree ? (
                    <span className="text-[10px] text-emerald-600 flex items-center gap-0.5"><Unlock className="h-2.5 w-2.5" /> Free</span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Lock className="h-2.5 w-2.5" /> Paid</span>
                  )}
                  {(l.dripDays ?? 0) > 0 && <span className="text-[10px] text-amber-600">Unlocks day {l.dripDays}</span>}
                  {l.duration != null && <span className="text-[10px] text-muted-foreground">{l.duration} min</span>}
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(l)} data-testid={`button-edit-lesson-${l.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => remove(l.id)} data-testid={`button-delete-lesson-${l.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
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
  const { mutateAsync: createQuiz, isPending: creating } = useCreateQuiz();
  const { mutateAsync: deleteQuiz } = useDeleteQuiz();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [passingScore, setPassingScore] = useState("70");
  const [xpReward, setXpReward] = useState("50");
  const [questions, setQuestions] = useState<QuizQuestionInput[]>([emptyQuestion()]);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListQuizzesQueryKey(courseId) });

  const reset = () => {
    setTitle(""); setPassingScore("70"); setXpReward("50"); setQuestions([emptyQuestion()]); setShowForm(false);
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
                      <button
                        type="button"
                        onClick={() => updateQuestion(qIdx, { correctIndex: oIdx })}
                        className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${q.correctIndex === oIdx ? "border-emerald-500 bg-emerald-500 text-white" : "border-border"}`}
                        title="Mark as correct answer"
                      >
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
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">{q.questionCount ?? 0} questions</span>
                  <span className="text-[10px] text-muted-foreground">Pass {q.passingScore}%</span>
                  <span className="text-[10px] text-amber-600">+{q.xpReward} XP</span>
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
