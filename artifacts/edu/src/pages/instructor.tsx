import { useState } from "react";
import {
  useListCourses, useCreateCourse, useUpdateCourse, useDeleteCourse,
  useListLiveClasses, useCreateLiveClass, useListAttendance,
  getListCoursesQueryKey, getListLiveClassesQueryKey,
  useListInstructorReviews, useApproveGate, useRejectGate,
  getListInstructorReviewsQueryKey, getGetInstructorReviewCountQueryKey,
  useGetGateAnalytics, getGetGateAnalyticsQueryKey,
  type GateReviewItem,
} from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import {
  Plus, BookOpen, Video, Users, Trash2, Settings2,
  ClipboardCheck, CheckCircle2, XCircle, ChevronDown, ChevronUp,
  FileQuestion, Clock, BarChart3, Pencil, ImageIcon,
} from "lucide-react";
import CourseContentManager from "@/pages/instructor/CourseContentManager";
import { cn } from "@/lib/utils";

function ThumbnailPreview({ url }: { url: string }) {
  if (!url) return null;
  return (
    <div className="mt-2 rounded-lg overflow-hidden border border-slate-200 aspect-video bg-slate-100 relative">
      <img src={url} alt="Thumbnail preview" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
    </div>
  );
}

function CreateCourseDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const form = useForm({
    defaultValues: { title: "", description: "", category: "forex", level: "beginner", price: undefined as number | undefined, thumbnailUrl: "" },
  });
  const thumbnailUrl = form.watch("thumbnailUrl");
  const create = useCreateCourse({
    mutation: {
      onSuccess: () => { setOpen(false); form.reset(); onSuccess(); toast({ title: "Course created" }); },
      onError: () => toast({ title: "Failed to create course", variant: "destructive" }),
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-course"><Plus className="h-4 w-4 mr-2" />Create Course</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New Course</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => create.mutate({ data: { title: d.title, description: d.description || undefined, category: d.category, level: d.level, price: d.price, thumbnailUrl: d.thumbnailUrl || undefined } }))} className="space-y-4">
            <FormField control={form.control} name="title" rules={{ required: true }} render={({ field }) => (
              <FormItem><FormLabel>Title</FormLabel><FormControl><Input data-testid="input-course-title" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea data-testid="input-course-description" rows={3} {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="thumbnailUrl" render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" />Thumbnail Image URL</FormLabel>
                <FormControl><Input placeholder="https://example.com/image.jpg" {...field} /></FormControl>
                <p className="text-[11.5px] text-muted-foreground">Paste a direct image URL — shown on the course card and detail page.</p>
                <FormMessage />
                {thumbnailUrl && <ThumbnailPreview url={thumbnailUrl} />}
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem><FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger data-testid="select-course-category"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {["forex","crypto","futures","options","stocks"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="level" render={({ field }) => (
                <FormItem><FormLabel>Level</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger data-testid="select-course-level"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {["beginner","intermediate","advanced"].map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="price" render={({ field }) => (
              <FormItem><FormLabel>Price (USD, leave blank for free)</FormLabel><FormControl><Input data-testid="input-course-price" type="number" min="0" step="0.01" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>
            )} />
            <Button type="submit" className="w-full" data-testid="button-submit-course" disabled={create.isPending}>
              {create.isPending ? "Creating..." : "Create Course"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditCourseDialog({ course, onSuccess }: {
  course: { id: number; title: string; description?: string | null; category?: string | null; level?: string | null; price?: string | null; thumbnailUrl?: string | null };
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const form = useForm({
    defaultValues: {
      title: course.title,
      description: course.description ?? "",
      category: course.category ?? "forex",
      level: course.level ?? "beginner",
      price: course.price ? parseFloat(course.price) : undefined as number | undefined,
      thumbnailUrl: course.thumbnailUrl ?? "",
    },
  });
  const thumbnailUrl = form.watch("thumbnailUrl");
  const update = useUpdateCourse({
    mutation: {
      onSuccess: () => { setOpen(false); onSuccess(); toast({ title: "Course updated" }); },
      onError: () => toast({ title: "Failed to update course", variant: "destructive" }),
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => {
      setOpen(v);
      if (v) form.reset({ title: course.title, description: course.description ?? "", category: course.category ?? "forex", level: course.level ?? "beginner", price: course.price ? parseFloat(course.price) : undefined, thumbnailUrl: course.thumbnailUrl ?? "" });
    }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-testid={`button-edit-course-${course.id}`}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit Course</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => update.mutate({ courseId: course.id, data: { title: d.title, description: d.description || undefined, category: d.category, level: d.level, price: d.price, thumbnailUrl: d.thumbnailUrl || undefined } }))} className="space-y-4">
            <FormField control={form.control} name="title" rules={{ required: true }} render={({ field }) => (
              <FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="thumbnailUrl" render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" />Thumbnail Image URL</FormLabel>
                <FormControl><Input placeholder="https://example.com/image.jpg" {...field} /></FormControl>
                <p className="text-[11.5px] text-muted-foreground">Paste a direct image URL — shown on the course card and detail page.</p>
                <FormMessage />
                {thumbnailUrl && <ThumbnailPreview url={thumbnailUrl} />}
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem><FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {["forex","crypto","futures","options","stocks"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="level" render={({ field }) => (
                <FormItem><FormLabel>Level</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {["beginner","intermediate","advanced"].map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="price" render={({ field }) => (
              <FormItem><FormLabel>Price (USD, leave blank for free)</FormLabel><FormControl><Input type="number" min="0" step="0.01" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>
            )} />
            <Button type="submit" className="w-full" disabled={update.isPending}>
              {update.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Reject dialog: write a new quiz for the student ─── */
type QuizQuestionDraft = { question: string; options: string[]; correctIndex: number; explanation: string };
const emptyQ = (): QuizQuestionDraft => ({ question: "", options: ["", "", "", ""], correctIndex: 0, explanation: "" });

function RejectDialog({
  gate, onDone,
}: {
  gate: GateReviewItem; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { mutateAsync: reject, isPending } = useRejectGate();

  const [reviewNote, setReviewNote] = useState("");
  const [quizTitle, setQuizTitle] = useState("Replacement Quiz");
  const [passingScore, setPassingScore] = useState("70");
  const [questions, setQuestions] = useState<QuizQuestionDraft[]>([emptyQ()]);

  const updateQuestion = (idx: number, patch: Partial<QuizQuestionDraft>) =>
    setQuestions((qs) => qs.map((q, i) => i === idx ? { ...q, ...patch } : q));
  const updateOption = (qIdx: number, oIdx: number, val: string) =>
    setQuestions((qs) => qs.map((q, i) => i === qIdx ? { ...q, options: q.options.map((o, j) => j === oIdx ? val : o) } : q));

  const submit = async () => {
    if (!reviewNote.trim()) { toast({ title: "Review note required", variant: "destructive" }); return; }
    if (!quizTitle.trim()) { toast({ title: "Quiz title required", variant: "destructive" }); return; }
    const cleaned = questions
      .map((q, i) => ({ ...q, order: i + 1, options: q.options.map((o) => o.trim()).filter(Boolean) }))
      .filter((q) => q.question.trim() && q.options.length >= 2);
    if (cleaned.length === 0) { toast({ title: "Add at least one complete question", variant: "destructive" }); return; }

    try {
      await reject({
        gateId: gate.id,
        data: {
          reviewNote: reviewNote.trim(),
          newQuiz: {
            title: quizTitle.trim(),
            passingScore: parseInt(passingScore) || 70,
            questions: cleaned,
          },
        },
      });
      toast({ title: "Gate rejected", description: "New quiz assigned to student." });
      setOpen(false);
      onDone();
    } catch { toast({ title: "Could not reject gate", variant: "destructive" }); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive" data-testid={`button-reject-gate-${gate.id}`}>
          <XCircle className="h-3.5 w-3.5 mr-1.5" /> Reject
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reject & Assign New Quiz</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm">
            <p className="font-medium text-slate-700">{gate.userName ?? gate.userId}</p>
            <p className="text-slate-400 text-[12px]">{gate.courseTitle} · {gate.lessonTitle}</p>
            <p className="text-slate-500 mt-1 text-[12px]">Score: <strong>{gate.score}%</strong></p>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">Feedback to student <span className="text-red-500">*</span></label>
            <Textarea
              rows={2}
              placeholder="Explain why you're rejecting this attempt and what to improve…"
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
            />
          </div>

          <div className="border border-border rounded-xl p-4 space-y-3">
            <h4 className="font-semibold text-sm text-slate-700">New Quiz for Student</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Quiz title</label>
                <Input value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} placeholder="Quiz title" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Passing score (%)</label>
                <Input type="number" min="0" max="100" value={passingScore} onChange={(e) => setPassingScore(e.target.value)} />
              </div>
            </div>

            <div className="space-y-3">
              {questions.map((q, qIdx) => (
                <div key={qIdx} className="rounded-lg border border-border p-3 space-y-2 bg-white">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Question {qIdx + 1}</span>
                    {questions.length > 1 && (
                      <button onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qIdx))}
                        className="text-destructive hover:text-destructive/80 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <Input placeholder="Question text" value={q.question} onChange={(e) => updateQuestion(qIdx, { question: e.target.value })} />
                  <div className="space-y-1.5">
                    {q.options.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-2">
                        <button type="button" onClick={() => updateQuestion(qIdx, { correctIndex: oIdx })}
                          className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${q.correctIndex === oIdx ? "border-emerald-500 bg-emerald-500 text-white" : "border-border"}`}>
                          {q.correctIndex === oIdx && <CheckCircle2 className="h-3 w-3" />}
                        </button>
                        <Input placeholder={`Option ${oIdx + 1}`} value={opt} onChange={(e) => updateOption(qIdx, oIdx, e.target.value)} className="h-8 text-sm" />
                      </div>
                    ))}
                  </div>
                  <Input placeholder="Explanation (shown after submission)" value={q.explanation} onChange={(e) => updateQuestion(qIdx, { explanation: e.target.value })} className="text-sm" />
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setQuestions((qs) => [...qs, emptyQ()])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Question
              </Button>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={submit} disabled={isPending}>
              {isPending ? "Rejecting…" : "Reject & Assign Quiz"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Review Queue Card ─── */
function ReviewQueueCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: reviews, isLoading } = useListInstructorReviews(
    { status: "pending_review" },
    { query: { queryKey: getListInstructorReviewsQueryKey({ status: "pending_review" }), refetchInterval: 30000 } },
  );
  const { mutateAsync: approve, isPending: approving } = useApproveGate();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListInstructorReviewsQueryKey({ status: "pending_review" }) });
    qc.invalidateQueries({ queryKey: getGetInstructorReviewCountQueryKey() });
  };

  const doApprove = async (gateId: number) => {
    try {
      await approve({ gateId });
      toast({ title: "Gate approved", description: "Next lesson unlocked for the student." });
      invalidate();
    } catch { toast({ title: "Could not approve", variant: "destructive" }); }
  };

  const pending = reviews ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <CardTitle>Review Queue</CardTitle>
          {pending.length > 0 && (
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold">
              {pending.length}
            </span>
          )}
        </div>
        <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">{Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : pending.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No pending reviews</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((item) => {
              const expanded = expandedId === item.id;
              return (
                <div key={item.id} className="rounded-lg border border-border overflow-hidden" data-testid={`row-review-${item.id}`}>
                  <div className="flex items-center gap-3 p-3">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                      {(item.userName ?? item.userId ?? "?").charAt(0).toUpperCase()}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{item.userName ?? item.userId}</p>
                      <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground flex-wrap">
                        <span className="truncate max-w-[140px]">{item.courseTitle}</span>
                        <span>·</span>
                        <span className="truncate max-w-[120px]">{item.lessonTitle}</span>
                        {item.score != null && (
                          <>
                            <span>·</span>
                            <span className={cn("font-semibold", item.score >= 70 ? "text-emerald-600" : "text-amber-600")}>
                              {item.score}%
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Submitted date */}
                    {item.submittedAt && (
                      <div className="text-[11px] text-muted-foreground shrink-0 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(item.submittedAt).toLocaleDateString()}
                      </div>
                    )}
                    {/* Expand quiz details */}
                    <button onClick={() => setExpandedId(expanded ? null : item.id)}
                      className="p-1.5 rounded-md hover:bg-secondary transition-colors shrink-0"
                      title="Quiz details">
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>

                  {expanded && (
                    <div className="px-3 pb-3 border-t border-border bg-secondary/20">
                      <div className="py-2.5 flex items-center gap-2 text-[12px] text-muted-foreground">
                        <FileQuestion className="h-3.5 w-3.5 shrink-0" />
                        <span>Quiz: <strong className="text-foreground">{item.quizTitle}</strong></span>
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 px-3 pb-3">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => doApprove(item.id)} disabled={approving} data-testid={`button-approve-gate-${item.id}`}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Approve
                    </Button>
                    <RejectDialog gate={item} onDone={invalidate} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Quiz Analytics Card ─── */
function QuizAnalyticsCard({ courses }: { courses?: { id: number; title: string }[] }) {
  const [selectedCourseId, setSelectedCourseId] = useState<number | undefined>(undefined);

  const { data: analytics, isLoading } = useGetGateAnalytics(
    selectedCourseId != null ? { courseId: selectedCourseId } : {},
    { query: { queryKey: getGetGateAnalyticsQueryKey(selectedCourseId != null ? { courseId: selectedCourseId } : {}) } },
  );

  const rows = analytics ?? [];

  return (
    <Card data-testid="quiz-analytics-card">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <CardTitle>Quiz Analytics</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={selectedCourseId != null ? String(selectedCourseId) : "all"}
            onValueChange={(v) => setSelectedCourseId(v === "all" ? undefined : parseInt(v))}
          >
            <SelectTrigger className="w-48 h-8 text-sm" data-testid="select-analytics-course">
              <SelectValue placeholder="All courses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All courses</SelectItem>
              {courses?.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No gate data yet. Analytics will appear once students submit quiz gates.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-left py-2 pr-3 font-medium">Lesson</th>
                  {selectedCourseId == null && <th className="text-left py-2 pr-3 font-medium">Course</th>}
                  <th className="text-right py-2 pr-3 font-medium">Pass Rate</th>
                  <th className="text-right py-2 pr-3 font-medium">Avg Score</th>
                  <th className="text-right py-2 pr-3 font-medium">Total</th>
                  <th className="text-right py-2 pr-3 font-medium text-amber-600">Pending</th>
                  <th className="text-right py-2 pr-3 font-medium text-emerald-600">Approved</th>
                  <th className="text-right py-2 font-medium text-red-500">Rejected</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.courseId}:${row.lessonId}`} className="border-b border-border/40 hover:bg-secondary/20 transition-colors" data-testid={`analytics-row-${row.lessonId}`}>
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-foreground truncate max-w-[180px]">{row.lessonTitle ?? `Lesson #${row.lessonId}`}</p>
                      {row.quizTitle && <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">{row.quizTitle}</p>}
                    </td>
                    {selectedCourseId == null && (
                      <td className="py-2.5 pr-3 text-muted-foreground truncate max-w-[140px]">{row.courseTitle}</td>
                    )}
                    <td className="py-2.5 pr-3 text-right">
                      <span className={cn(
                        "inline-flex items-center gap-1 font-semibold",
                        row.passRate >= 70 ? "text-emerald-600" : row.passRate >= 40 ? "text-amber-600" : "text-red-500"
                      )}>
                        {row.approved + row.rejected > 0 ? (
                          <>{row.passRate}%</>
                        ) : (
                          <span className="text-muted-foreground text-xs font-normal">—</span>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right text-muted-foreground">
                      {row.averageScore != null ? `${row.averageScore}%` : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-medium">{row.total}</td>
                    <td className="py-2.5 pr-3 text-right">
                      {row.pending > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                          <Clock className="h-3 w-3" />{row.pending}
                        </span>
                      ) : <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      <span className={row.approved > 0 ? "text-emerald-600 font-medium" : "text-muted-foreground"}>{row.approved}</span>
                    </td>
                    <td className="py-2.5 text-right">
                      <span className={row.rejected > 0 ? "text-red-500 font-medium" : "text-muted-foreground"}>{row.rejected}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function InstructorPanel() {
  const { user } = useUser();
  const qc = useQueryClient();
  const { toast } = useToast();
  const clerkId = user?.id ?? "";

  const { data: courses, isLoading: coursesLoading } = useListCourses(
    { instructorId: clerkId },
    { query: { enabled: !!clerkId, queryKey: getListCoursesQueryKey({ instructorId: clerkId }) } }
  );
  const { data: liveClasses, isLoading: liveLoading } = useListLiveClasses(
    { instructorId: clerkId },
    { query: { enabled: !!clerkId, queryKey: getListLiveClassesQueryKey({ instructorId: clerkId }) } }
  );
  const { data: attendance } = useListAttendance({});

  const updateCourse = useUpdateCourse({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListCoursesQueryKey({ instructorId: clerkId }) }); toast({ title: "Course updated" }); },
    },
  });
  const deleteCourse = useDeleteCourse({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListCoursesQueryKey({ instructorId: clerkId }) }); toast({ title: "Course deleted" }); },
    },
  });

  const totalStudents = courses?.reduce((a, c) => a + (c.enrollmentCount ?? 0), 0) ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Instructor Panel</h1>
          <p className="text-muted-foreground">Manage your courses, live sessions, and track student progress.</p>
        </div>
        <CreateCourseDialog onSuccess={() => qc.invalidateQueries({ queryKey: getListCoursesQueryKey({ instructorId: clerkId }) })} />
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{totalStudents.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Your Courses</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{courses?.length ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Live Sessions</CardTitle>
            <Video className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{liveClasses?.length ?? 0}</div></CardContent>
        </Card>
      </div>

      {/* Review Queue — always visible for instructor */}
      <ReviewQueueCard />

      {/* Quiz Analytics */}
      <QuizAnalyticsCard courses={courses?.map((c) => ({ id: c.id, title: c.title }))} />

      {/* Courses */}
      <Card>
        <CardHeader>
          <CardTitle>Your Courses</CardTitle>
        </CardHeader>
        <CardContent>
          {coursesLoading ? (
            <div className="space-y-3">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : courses?.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              No courses yet. Create your first course to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {courses?.map((course) => (
                <div key={course.id} className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-secondary/30 transition-colors" data-testid={`row-course-${course.id}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{course.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs capitalize">{course.category}</Badge>
                      <Badge variant="outline" className="text-xs capitalize">{course.level}</Badge>
                      <Badge variant={course.status === "published" ? "default" : "secondary"} className="text-xs">
                        {course.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right shrink-0 text-sm text-muted-foreground">
                    <p>{course.enrollmentCount} students</p>
                    <p>{course.lessonCount} lessons</p>
                  </div>
                  <div className="flex gap-2 shrink-0 flex-wrap">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" data-testid={`button-manage-course-${course.id}`}>
                          <Settings2 className="h-4 w-4 mr-1.5" /> Manage Content
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                        <DialogHeader><DialogTitle>{course.title} — Content</DialogTitle></DialogHeader>
                        <CourseContentManager courseId={course.id} />
                      </DialogContent>
                    </Dialog>
                    <EditCourseDialog
                      course={course}
                      onSuccess={() => qc.invalidateQueries({ queryKey: getListCoursesQueryKey({ instructorId: clerkId }) })}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`button-toggle-status-${course.id}`}
                      onClick={() => updateCourse.mutate({ courseId: course.id, data: { status: course.status === "published" ? "draft" : "published" } })}
                    >
                      {course.status === "published" ? "Unpublish" : "Publish"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      data-testid={`button-delete-course-${course.id}`}
                      onClick={() => deleteCourse.mutate({ courseId: course.id })}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live Sessions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Live Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {liveLoading ? (
            <div className="space-y-3">{Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : liveClasses?.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">No live sessions yet.</div>
          ) : (
            <div className="space-y-3">
              {liveClasses?.map((cls) => (
                <div key={cls.id} className="flex items-center gap-4 p-4 rounded-lg border border-border" data-testid={`row-class-${cls.id}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{cls.title}</p>
                    <p className="text-xs text-muted-foreground">{new Date(cls.scheduledAt).toLocaleString()}</p>
                  </div>
                  <Badge variant={cls.status === "live" ? "destructive" : cls.status === "completed" ? "secondary" : "outline"}>
                    {cls.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground shrink-0">{cls.registrationCount} registered</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attendance */}
      {attendance && attendance.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Recent Attendance</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {attendance.slice(0, 10).map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2 border-b border-border/50 text-sm" data-testid={`row-attendance-${a.id}`}>
                  <span>{a.userName ?? a.userId}</span>
                  <span className="text-muted-foreground">Class #{a.classId}</span>
                  <Badge variant="outline" className={a.status === "present" ? "text-green-400" : a.status === "late" ? "text-yellow-400" : "text-red-400"}>
                    {a.status}
                  </Badge>
                  <span className="text-muted-foreground">{a.durationMinutes ?? "—"}min</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
