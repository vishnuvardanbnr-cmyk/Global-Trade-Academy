import { useState, useEffect, useCallback } from "react";
import {
  useListCourses, useCreateCourse, useUpdateCourse, useDeleteCourse,
  useListLiveClasses, useCreateLiveClass, useListAttendance,
  getListCoursesQueryKey, getListLiveClassesQueryKey,
  useListInstructorReviews, useApproveGate, useRejectGate,
  getListInstructorReviewsQueryKey, getGetInstructorReviewCountQueryKey,
  useGetGateAnalytics, getGetGateAnalyticsQueryKey,
  useGetMe,
  type GateReviewItem,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import {
  Plus, BookOpen, Video, Users, Trash2, Settings2,
  ClipboardCheck, CheckCircle2, XCircle, ChevronDown, ChevronUp,
  FileQuestion, Clock, BarChart3, Pencil, ImageIcon, CalendarPlus,
  ListTodo, ExternalLink, GraduationCap, TrendingUp, Award,
  UserCheck, ChevronRight, RefreshCw, Star, Megaphone, Send,
} from "lucide-react";
import CourseContentManager from "@/pages/instructor/CourseContentManager";
import { cn } from "@/lib/utils";

/* ─── Announcement Card ─── */
function AnnouncementCard({ courses }: { courses: { id: number; title: string }[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState<string>("all");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;
    setSending(true);
    try {
      const body: any = { title: title.trim(), message: message.trim() };
      if (courseId !== "all") body.courseId = Number(courseId);
      const r = await fetch("/api/instructor/announce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
      toast({ title: "Announcement sent!", description: "Your students have been notified." });
      setTitle(""); setMessage(""); setCourseId("all"); setOpen(false);
    } catch {
      toast({ title: "Failed to send", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-amber-500" /> Send Announcement
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Notify your enrolled students directly.</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
          <Send className="h-3.5 w-3.5" /> Announce
        </Button>
      </CardHeader>

      {open && (
        <CardContent className="pt-0">
          <form onSubmit={handleSend} className="space-y-3 border border-border rounded-xl p-4 bg-secondary/30">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Target Course</label>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-border text-sm bg-background focus:outline-none focus:border-primary"
              >
                <option value="all">All my courses (all enrolled students)</option>
                {courses.map((c) => <option key={c.id} value={String(c.id)}>{c.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="e.g. New lesson released!"
                className="w-full h-9 px-3 rounded-lg border border-border text-sm bg-background focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Message *</label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={3}
                placeholder="Write your announcement here…"
                className="text-sm"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={sending || !title.trim() || !message.trim()} className="gap-1.5">
                <Send className="h-3.5 w-3.5" /> {sending ? "Sending…" : "Send to Students"}
              </Button>
            </div>
          </form>
        </CardContent>
      )}
    </Card>
  );
}

/* ─── helpers ─── */
function ThumbnailPreview({ url }: { url: string }) {
  if (!url) return null;
  return (
    <div className="mt-2 rounded-lg overflow-hidden border border-border aspect-video bg-muted relative">
      <img src={url} alt="Thumbnail preview" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
    </div>
  );
}

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const s = size === "sm" ? "w-7 h-7 text-[10px]" : "w-9 h-9 text-[11px]";
  return (
    <div className={`${s} rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary shrink-0`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

/* ─── Create Course Dialog ─── */
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
                <FormLabel className="flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" />Thumbnail URL</FormLabel>
                <FormControl><Input placeholder="https://example.com/image.jpg" {...field} /></FormControl>
                {thumbnailUrl && <ThumbnailPreview url={thumbnailUrl} />}
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem><FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger data-testid="select-course-category"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>{["forex","crypto","futures","options","stocks"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="level" render={({ field }) => (
                <FormItem><FormLabel>Level</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger data-testid="select-course-level"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>{["beginner","intermediate","advanced"].map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="price" render={({ field }) => (
              <FormItem><FormLabel>Price (USD, blank = free)</FormLabel><FormControl><Input data-testid="input-course-price" type="number" min="0" step="0.01" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>
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

/* ─── Edit Course Dialog ─── */
function EditCourseDialog({ course, onSuccess }: {
  course: { id: number; title: string; description?: string | null; category?: string | null; level?: string | null; price?: string | null; thumbnailUrl?: string | null };
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const form = useForm({
    defaultValues: { title: course.title, description: course.description ?? "", category: course.category ?? "forex", level: course.level ?? "beginner", price: course.price ? parseFloat(course.price) : undefined as number | undefined, thumbnailUrl: course.thumbnailUrl ?? "" },
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
        <Button size="sm" variant="outline" data-testid={`button-edit-course-${course.id}`}><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit</Button>
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
                <FormLabel className="flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" />Thumbnail URL</FormLabel>
                <FormControl><Input placeholder="https://example.com/image.jpg" {...field} /></FormControl>
                {thumbnailUrl && <ThumbnailPreview url={thumbnailUrl} />}
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem><FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>{["forex","crypto","futures","options","stocks"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="level" render={({ field }) => (
                <FormItem><FormLabel>Level</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>{["beginner","intermediate","advanced"].map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="price" render={({ field }) => (
              <FormItem><FormLabel>Price (USD, blank = free)</FormLabel><FormControl><Input type="number" min="0" step="0.01" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} /></FormControl></FormItem>
            )} />
            <Button type="submit" className="w-full" disabled={update.isPending}>{update.isPending ? "Saving..." : "Save Changes"}</Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Schedule Live Class Dialog ─── */
function ScheduleLiveClassDialog({ courses, onSuccess }: { courses?: { id: number; title: string }[]; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [audienceType, setAudienceType] = useState<"all" | "batch">("all");
  const [batches, setBatches] = useState<{ id: number; name: string }[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const { toast } = useToast();
  const form = useForm({ defaultValues: { title: "", description: "", scheduledAt: "", duration: 60 as number | undefined, courseId: "" as string, batchId: "" as string, maxAttendees: "" as string } });

  const selectedCourseId = form.watch("courseId");

  useEffect(() => {
    setBatches([]);
    form.setValue("batchId", "");
    setAudienceType("all");
    if (!selectedCourseId) return;
    setLoadingBatches(true);
    fetch(`/api/instructor/courses/${selectedCourseId}/batches`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setBatches(Array.isArray(data) ? data.map((b: { id: number; name: string }) => ({ id: b.id, name: b.name })) : []))
      .catch(() => setBatches([]))
      .finally(() => setLoadingBatches(false));
  }, [selectedCourseId]);

  const create = useCreateLiveClass({
    mutation: {
      onSuccess: () => { setOpen(false); form.reset(); setAudienceType("all"); setBatches([]); onSuccess(); toast({ title: "Live class scheduled" }); },
      onError: () => toast({ title: "Failed to schedule live class", variant: "destructive" }),
    },
  });

  const handleSubmit = form.handleSubmit((d) => {
    const batchId = audienceType === "batch" && d.batchId ? parseInt(d.batchId) : undefined;
    create.mutate({ data: {
      title: d.title,
      description: d.description || undefined,
      scheduledAt: new Date(d.scheduledAt).toISOString(),
      duration: d.duration || undefined,
      courseId: d.courseId ? parseInt(d.courseId) : undefined,
      batchId,
      maxAttendees: d.maxAttendees ? parseInt(d.maxAttendees) : undefined,
    }});
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-schedule-live-class"><CalendarPlus className="h-4 w-4 mr-2" />Schedule Live Class</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Schedule a Live Class</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField control={form.control} name="title" rules={{ required: "Title is required" }} render={({ field }) => (
              <FormItem><FormLabel>Title</FormLabel><FormControl><Input placeholder="e.g. Weekly Market Analysis" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="scheduledAt" rules={{ required: "Date & time required" }} render={({ field }) => (
              <FormItem><FormLabel>Date & Time</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="duration" render={({ field }) => (
                <FormItem><FormLabel>Duration (min)</FormLabel><FormControl><Input type="number" min="15" step="15" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="maxAttendees" render={({ field }) => (
                <FormItem><FormLabel>Max Attendees</FormLabel><FormControl><Input type="number" min="1" placeholder="Unlimited" {...field} /></FormControl></FormItem>
              )} />
            </div>

            {/* Course selector */}
            {courses && courses.length > 0 && (
              <FormField control={form.control} name="courseId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Course</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="None (open session)" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="none">None (open to all)</SelectItem>
                      {courses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            )}

            {/* Audience type selector — only shown when a course is selected */}
            {selectedCourseId && selectedCourseId !== "none" && (
              <FormItem>
                <FormLabel>Who can join?</FormLabel>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setAudienceType("all"); form.setValue("batchId", ""); }}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-sm text-left transition-colors",
                      audienceType === "all"
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border hover:bg-secondary/50"
                    )}
                  >
                    <Users className="h-4 w-4 mb-1" />
                    All enrolled students
                    <p className="text-[11px] text-muted-foreground font-normal mt-0.5">Everyone enrolled in the course</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAudienceType("batch")}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-sm text-left transition-colors",
                      audienceType === "batch"
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border hover:bg-secondary/50"
                    )}
                  >
                    <GraduationCap className="h-4 w-4 mb-1" />
                    Specific batch
                    <p className="text-[11px] text-muted-foreground font-normal mt-0.5">Only students in one batch</p>
                  </button>
                </div>
              </FormItem>
            )}

            {/* Batch dropdown — only shown when audienceType === "batch" */}
            {audienceType === "batch" && selectedCourseId && selectedCourseId !== "none" && (
              <FormField control={form.control} name="batchId" rules={{ required: "Select a batch" }} render={({ field }) => (
                <FormItem>
                  <FormLabel>Select Batch</FormLabel>
                  {loadingBatches ? (
                    <div className="h-9 rounded-md border border-border animate-pulse bg-secondary/30" />
                  ) : batches.length === 0 ? (
                    <p className="text-sm text-muted-foreground bg-secondary/30 rounded-md px-3 py-2">No batches found for this course. <button type="button" className="underline" onClick={() => setAudienceType("all")}>Switch to all students</button></p>
                  ) : (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Choose a batch…" /></SelectTrigger></FormControl>
                      <SelectContent>{batches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  <FormMessage />
                </FormItem>
              )} />
            )}

            <Button type="submit" className="w-full" disabled={create.isPending}>{create.isPending ? "Scheduling..." : "Schedule"}</Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Task Submissions Card ─── */
type TaskSubmission = { id: number; taskId: number; taskTitle: string; courseTitle: string; userId: string; userName: string; submission: string | null; fileUrl: string | null; fileName: string | null; status: string; reviewNote: string | null; submittedAt: string; };

function TaskSubmissionsCard() {
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<TaskSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [acting, setActing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/instructor/task-submissions?status=pending_review");
      if (res.ok) setSubmissions(await res.json());
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const approve = async (id: number) => {
    setActing(true);
    try {
      const res = await fetch(`/api/instructor/task-submissions/${id}/approve`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast({ title: "Task approved — XP awarded." });
      load();
    } catch { toast({ title: "Could not approve", variant: "destructive" }); }
    finally { setActing(false); }
  };

  const reject = async (id: number) => {
    if (!rejectNote.trim()) { toast({ title: "Feedback note is required", variant: "destructive" }); return; }
    setActing(true);
    try {
      const res = await fetch(`/api/instructor/task-submissions/${id}/reject`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewNote: rejectNote.trim() }) });
      if (!res.ok) throw new Error();
      toast({ title: "Task rejected." });
      setRejectId(null); setRejectNote(""); load();
    } catch { toast({ title: "Could not reject", variant: "destructive" }); }
    finally { setActing(false); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <CardTitle>Task Submissions</CardTitle>
          {submissions.length > 0 && <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold">{submissions.length}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <ListTodo className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">{Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : submissions.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground"><ListTodo className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No pending task submissions</p></div>
        ) : (
          <div className="space-y-3">
            {submissions.map((item) => {
              const expanded = expandedId === item.id;
              const rejecting = rejectId === item.id;
              return (
                <div key={item.id} className="rounded-lg border border-border overflow-hidden">
                  <div className="flex items-center gap-3 p-3">
                    <Avatar name={item.userName ?? "?"} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{item.userName}</p>
                      <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground flex-wrap">
                        <span className="truncate max-w-[140px]">{item.courseTitle}</span>
                        <span>·</span>
                        <span className="truncate max-w-[140px] font-medium text-foreground">{item.taskTitle}</span>
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground shrink-0 flex items-center gap-1">
                      <Clock className="h-3 w-3" />{new Date(item.submittedAt).toLocaleDateString()}
                    </div>
                    <button onClick={() => setExpandedId(expanded ? null : item.id)} className="p-1.5 rounded-md hover:bg-secondary transition-colors shrink-0">
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                  {expanded && (
                    <div className="px-3 pb-3 border-t border-border bg-secondary/20 space-y-2">
                      {item.submission && <div className="pt-2.5"><p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Written Answer</p><p className="text-[12.5px] leading-relaxed whitespace-pre-line">{item.submission}</p></div>}
                      {item.fileUrl && <div className="pt-1"><p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Attached File</p><a href={item.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12.5px] text-primary hover:underline font-medium"><ExternalLink className="h-3.5 w-3.5" />{item.fileName ?? "View file"}</a></div>}
                      {!item.submission && !item.fileUrl && <p className="text-[12px] text-muted-foreground pt-2">No written answer or file submitted.</p>}
                    </div>
                  )}
                  {rejecting ? (
                    <div className="px-3 pb-3 border-t border-border space-y-2 pt-3">
                      <p className="text-[12px] font-semibold">Rejection feedback (required)</p>
                      <textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Tell the student what needs to be improved…" rows={3} className="w-full p-2.5 text-[12.5px] rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
                      <div className="flex gap-2">
                        <Button size="sm" variant="destructive" onClick={() => reject(item.id)} disabled={acting}><XCircle className="h-3.5 w-3.5 mr-1.5" />Confirm Reject</Button>
                        <Button size="sm" variant="outline" onClick={() => { setRejectId(null); setRejectNote(""); }}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 pb-3">
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => approve(item.id)} disabled={acting}><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Approve</Button>
                      <Button size="sm" variant="outline" className="text-red-500 border-red-200" onClick={() => setRejectId(item.id)}><XCircle className="h-3.5 w-3.5 mr-1.5" />Reject</Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Reject Gate Dialog ─── */
type QuizQuestionDraft = { question: string; options: string[]; correctIndex: number; explanation: string };
const emptyQ = (): QuizQuestionDraft => ({ question: "", options: ["", "", "", ""], correctIndex: 0, explanation: "" });

function RejectDialog({ gate, onDone }: { gate: GateReviewItem; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { mutateAsync: reject, isPending } = useRejectGate();
  const [reviewNote, setReviewNote] = useState("");
  const [quizTitle, setQuizTitle] = useState("Replacement Quiz");
  const [passingScore, setPassingScore] = useState("70");
  const [questions, setQuestions] = useState<QuizQuestionDraft[]>([emptyQ()]);

  const updateQuestion = (idx: number, patch: Partial<QuizQuestionDraft>) => setQuestions((qs) => qs.map((q, i) => i === idx ? { ...q, ...patch } : q));
  const updateOption = (qIdx: number, oIdx: number, val: string) => setQuestions((qs) => qs.map((q, i) => i === qIdx ? { ...q, options: q.options.map((o, j) => j === oIdx ? val : o) } : q));

  const submit = async () => {
    if (!reviewNote.trim()) { toast({ title: "Review note required", variant: "destructive" }); return; }
    if (!quizTitle.trim()) { toast({ title: "Quiz title required", variant: "destructive" }); return; }
    const cleaned = questions.map((q, i) => ({ ...q, order: i + 1, options: q.options.map((o) => o.trim()).filter(Boolean) })).filter((q) => q.question.trim() && q.options.length >= 2);
    if (cleaned.length === 0) { toast({ title: "Add at least one complete question", variant: "destructive" }); return; }
    try {
      await reject({ gateId: gate.id, data: { reviewNote: reviewNote.trim(), newQuiz: { title: quizTitle.trim(), passingScore: parseInt(passingScore) || 70, questions: cleaned } } });
      toast({ title: "Gate rejected — new quiz assigned." });
      setOpen(false); onDone();
    } catch { toast({ title: "Could not reject gate", variant: "destructive" }); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive" data-testid={`button-reject-gate-${gate.id}`}><XCircle className="h-3.5 w-3.5 mr-1.5" />Reject</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Reject & Assign New Quiz</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="p-3 rounded-lg bg-secondary/50 border border-border text-sm">
            <p className="font-medium">{gate.userName ?? gate.userId}</p>
            <p className="text-muted-foreground text-[12px]">{gate.courseTitle} · {gate.lessonTitle}</p>
            <p className="text-muted-foreground mt-1 text-[12px]">Score: <strong>{gate.score}%</strong></p>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">Feedback to student <span className="text-red-500">*</span></label>
            <Textarea rows={2} placeholder="Explain why you're rejecting this attempt…" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
          </div>
          <div className="border border-border rounded-xl p-4 space-y-3">
            <h4 className="font-semibold text-sm">New Quiz for Student</h4>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground block mb-1">Quiz title</label><Input value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} /></div>
              <div><label className="text-xs text-muted-foreground block mb-1">Passing score (%)</label><Input type="number" min="0" max="100" value={passingScore} onChange={(e) => setPassingScore(e.target.value)} /></div>
            </div>
            <div className="space-y-3">
              {questions.map((q, qIdx) => (
                <div key={qIdx} className="rounded-lg border border-border p-3 space-y-2 bg-background">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Question {qIdx + 1}</span>
                    {questions.length > 1 && <button onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qIdx))} className="text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </div>
                  <Input placeholder="Question text" value={q.question} onChange={(e) => updateQuestion(qIdx, { question: e.target.value })} />
                  <div className="space-y-1.5">
                    {q.options.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-2">
                        <button type="button" onClick={() => updateQuestion(qIdx, { correctIndex: oIdx })} className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${q.correctIndex === oIdx ? "border-emerald-500 bg-emerald-500 text-white" : "border-border"}`}>
                          {q.correctIndex === oIdx && <CheckCircle2 className="h-3 w-3" />}
                        </button>
                        <Input placeholder={`Option ${oIdx + 1}`} value={opt} onChange={(e) => updateOption(qIdx, oIdx, e.target.value)} className="h-8 text-sm" />
                      </div>
                    ))}
                  </div>
                  <Input placeholder="Explanation (optional)" value={q.explanation} onChange={(e) => updateQuestion(qIdx, { explanation: e.target.value })} className="text-sm" />
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setQuestions((qs) => [...qs, emptyQ()])}><Plus className="h-3.5 w-3.5 mr-1" />Add Question</Button>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={submit} disabled={isPending}>{isPending ? "Rejecting…" : "Reject & Assign Quiz"}</Button>
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
  const { data: reviews, isLoading } = useListInstructorReviews({ status: "pending_review" }, { query: { queryKey: getListInstructorReviewsQueryKey({ status: "pending_review" }), refetchInterval: 30000 } });
  const { mutateAsync: approve, isPending: approving } = useApproveGate();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListInstructorReviewsQueryKey({ status: "pending_review" }) });
    qc.invalidateQueries({ queryKey: getGetInstructorReviewCountQueryKey() });
  };

  const doApprove = async (gateId: number) => {
    try { await approve({ gateId }); toast({ title: "Gate approved — next lesson unlocked." }); invalidate(); }
    catch { toast({ title: "Could not approve", variant: "destructive" }); }
  };

  const pending = reviews ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <CardTitle>Gate Reviews</CardTitle>
          {pending.length > 0 && <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold">{pending.length}</span>}
        </div>
        <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">{Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : pending.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground"><ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No pending gate reviews</p></div>
        ) : (
          <div className="space-y-3">
            {pending.map((item) => {
              const expanded = expandedId === item.id;
              return (
                <div key={item.id} className="rounded-lg border border-border overflow-hidden" data-testid={`row-review-${item.id}`}>
                  <div className="flex items-center gap-3 p-3">
                    <Avatar name={item.userName ?? item.userId ?? "?"} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{item.userName ?? item.userId}</p>
                      <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground flex-wrap">
                        <span className="truncate max-w-[140px]">{item.courseTitle}</span>
                        <span>·</span>
                        <span className="truncate max-w-[120px]">{item.lessonTitle}</span>
                        {item.score != null && <><span>·</span><span className={cn("font-semibold", item.score >= 70 ? "text-emerald-600" : "text-amber-600")}>{item.score}%</span></>}
                      </div>
                    </div>
                    {item.submittedAt && <div className="text-[11px] text-muted-foreground shrink-0 flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(item.submittedAt).toLocaleDateString()}</div>}
                    <button onClick={() => setExpandedId(expanded ? null : item.id)} className="p-1.5 rounded-md hover:bg-secondary transition-colors shrink-0">
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                  {expanded && (
                    <div className="px-3 pb-3 border-t border-border bg-secondary/20">
                      <div className="py-2.5 flex items-center gap-2 text-[12px] text-muted-foreground">
                        <FileQuestion className="h-3.5 w-3.5 shrink-0" /><span>Quiz: <strong className="text-foreground">{item.quizTitle}</strong></span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 px-3 pb-3">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => doApprove(item.id)} disabled={approving} data-testid={`button-approve-gate-${item.id}`}><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Approve</Button>
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
    { query: { queryKey: getGetGateAnalyticsQueryKey(selectedCourseId != null ? { courseId: selectedCourseId } : {}) } }
  );
  const rows = analytics ?? [];
  return (
    <Card data-testid="quiz-analytics-card">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle>Quiz Gate Analytics</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={selectedCourseId != null ? String(selectedCourseId) : "all"} onValueChange={(v) => setSelectedCourseId(v === "all" ? undefined : parseInt(v))}>
            <SelectTrigger className="w-44 h-8 text-sm" data-testid="select-analytics-course"><SelectValue placeholder="All courses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All courses</SelectItem>
              {courses?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground"><BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No gate data yet.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-left py-2 pr-3 font-medium">Lesson / Quiz</th>
                  {selectedCourseId == null && <th className="text-left py-2 pr-3 font-medium">Course</th>}
                  <th className="text-right py-2 pr-3 font-medium">Pass Rate</th>
                  <th className="text-right py-2 pr-3 font-medium">Avg Score</th>
                  <th className="text-right py-2 pr-3 font-medium">Total</th>
                  <th className="text-right py-2 pr-3 font-medium text-amber-500">Pending</th>
                  <th className="text-right py-2 pr-3 font-medium text-emerald-500">Approved</th>
                  <th className="text-right py-2 font-medium text-red-500">Rejected</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.courseId}:${row.lessonId}`} className="border-b border-border/40 hover:bg-secondary/20 transition-colors" data-testid={`analytics-row-${row.lessonId}`}>
                    <td className="py-2.5 pr-3">
                      <p className="font-medium truncate max-w-[180px]">{row.lessonTitle ?? `Lesson #${row.lessonId}`}</p>
                      {row.quizTitle && <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">{row.quizTitle}</p>}
                    </td>
                    {selectedCourseId == null && <td className="py-2.5 pr-3 text-muted-foreground truncate max-w-[140px]">{row.courseTitle}</td>}
                    <td className="py-2.5 pr-3 text-right">
                      <span className={cn("font-semibold", row.passRate >= 70 ? "text-emerald-600" : row.passRate >= 40 ? "text-amber-600" : "text-red-500")}>
                        {row.approved + row.rejected > 0 ? `${row.passRate}%` : <span className="text-muted-foreground text-xs font-normal">—</span>}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right text-muted-foreground">{row.averageScore != null ? `${row.averageScore}%` : "—"}</td>
                    <td className="py-2.5 pr-3 text-right font-medium">{row.total}</td>
                    <td className="py-2.5 pr-3 text-right">{row.pending > 0 ? <span className="text-amber-500 font-medium flex items-center justify-end gap-1"><Clock className="h-3 w-3" />{row.pending}</span> : <span className="text-muted-foreground">0</span>}</td>
                    <td className="py-2.5 pr-3 text-right"><span className={row.approved > 0 ? "text-emerald-600 font-medium" : "text-muted-foreground"}>{row.approved}</span></td>
                    <td className="py-2.5 text-right"><span className={row.rejected > 0 ? "text-red-500 font-medium" : "text-muted-foreground"}>{row.rejected}</span></td>
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

/* ─── Students Tab ─── */
type Student = { userId: string; displayName: string; email: string; avatarUrl: string | null; xp: number; coursesEnrolled: number; coursesCompleted: number; lessonsCompleted: number; certificates: number; lastActivity: string; };

function StudentsTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/instructor/students");
      if (res.ok) setStudents(await res.json());
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = students.filter((s) => !search || s.displayName.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input placeholder="Search students…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh</Button>
      </div>

      {loading ? (
        <div className="space-y-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground"><Users className="h-10 w-10 mx-auto mb-3 opacity-30" /><p>{search ? "No students match your search." : "No students enrolled yet."}</p></div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40">
              <tr className="border-b border-border text-muted-foreground text-xs">
                <th className="text-left px-4 py-3 font-medium">Student</th>
                <th className="text-right px-4 py-3 font-medium">XP</th>
                <th className="text-right px-4 py-3 font-medium">Courses</th>
                <th className="text-center px-4 py-3 font-medium">Progress</th>
                <th className="text-right px-4 py-3 font-medium">Lessons Done</th>
                <th className="text-right px-4 py-3 font-medium">Certs</th>
                <th className="text-right px-4 py-3 font-medium">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const completionPct = s.coursesEnrolled > 0 ? Math.round((s.coursesCompleted / s.coursesEnrolled) * 100) : 0;
                return (
                  <tr key={s.userId} className="border-b border-border/40 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {s.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate max-w-[160px]">{s.displayName}</p>
                          <p className="text-[11px] text-muted-foreground truncate max-w-[160px]">{s.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono font-semibold text-primary">{s.xp.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      <span className="font-medium text-foreground">{s.coursesCompleted}</span>/{s.coursesEnrolled}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-center">
                        <Progress value={completionPct} className="h-1.5 w-20" />
                        <span className="text-[11px] text-muted-foreground w-8 text-right">{completionPct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{s.lessonsCompleted}</td>
                    <td className="px-4 py-3 text-right">
                      {s.certificates > 0
                        ? <span className="inline-flex items-center gap-1 text-amber-500 font-medium"><Award className="h-3.5 w-3.5" />{s.certificates}</span>
                        : <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-[11px] text-muted-foreground">{new Date(s.lastActivity).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Analytics Tab ─── */
type CourseAnalytics = { courseId: number; totalEnrolled: number; completedCourse: number; completionRate: number; lessonStats: { lessonId: number; title: string; order: number; completions: number; completionRate: number }[]; quizStats: { quizId: number; title: string; passingScore: number; totalAttempts: number; passCount: number; passRate: number; avgScore: number }[]; taskStats: { pending: number; approved: number; rejected: number }; };

function AnalyticsTab({ courses }: { courses?: { id: number; title: string }[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [data, setData] = useState<CourseAnalytics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (courses && courses.length > 0 && selectedId === null) setSelectedId(courses[0].id);
  }, [courses]);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    fetch(`/api/instructor/course-analytics/${selectedId}`).then((r) => r.json()).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [selectedId]);

  if (!courses || courses.length === 0) {
    return <div className="py-16 text-center text-muted-foreground"><BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" /><p>No courses yet. Create a course to see analytics.</p></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Select value={selectedId ? String(selectedId) : ""} onValueChange={(v) => setSelectedId(parseInt(v))}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Select course" /></SelectTrigger>
          <SelectContent>{courses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-4">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : !data ? (
        <div className="py-12 text-center text-muted-foreground">Select a course to view analytics.</div>
      ) : (
        <div className="space-y-6">
          {/* Top stats */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            {[
              { label: "Total Enrolled", value: data.totalEnrolled, icon: Users, color: "text-blue-400" },
              { label: "Completed", value: data.completedCourse, icon: GraduationCap, color: "text-green-400" },
              { label: "Completion Rate", value: `${data.completionRate}%`, icon: TrendingUp, color: "text-purple-400" },
              { label: "Tasks Approved", value: data.taskStats.approved, icon: CheckCircle2, color: "text-emerald-400" },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
                  <Icon className={`h-4 w-4 ${color}`} />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold">{value}</div></CardContent>
              </Card>
            ))}
          </div>

          {/* Lesson completion funnel */}
          {data.lessonStats.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Lesson Completion Funnel</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  {data.lessonStats.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((ls) => (
                    <div key={ls.lessonId} className="flex items-center gap-3">
                      <span className="text-[11px] text-muted-foreground w-5 text-right">{ls.order}</span>
                      <span className="text-sm truncate flex-1 min-w-0">{ls.title}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <Progress value={ls.completionRate} className="h-1.5 w-28" />
                        <span className="text-[11px] text-muted-foreground w-10 text-right">{ls.completionRate}%</span>
                        <span className="text-[11px] text-muted-foreground w-12 text-right">{ls.completions}/{data.totalEnrolled}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quiz stats */}
          {data.quizStats.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Quiz Performance</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-xs">
                      <th className="text-left py-2 pr-3 font-medium">Quiz</th>
                      <th className="text-right py-2 pr-3 font-medium">Attempts</th>
                      <th className="text-right py-2 pr-3 font-medium">Pass Rate</th>
                      <th className="text-right py-2 font-medium">Avg Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.quizStats.map((q) => (
                      <tr key={q.quizId} className="border-b border-border/40">
                        <td className="py-2.5 pr-3 truncate max-w-[200px]">{q.title}</td>
                        <td className="py-2.5 pr-3 text-right text-muted-foreground">{q.totalAttempts}</td>
                        <td className="py-2.5 pr-3 text-right">
                          <span className={cn("font-semibold", q.passRate >= 70 ? "text-emerald-600" : q.passRate >= 40 ? "text-amber-600" : "text-red-500")}>
                            {q.totalAttempts > 0 ? `${q.passRate}%` : "—"}
                          </span>
                        </td>
                        <td className="py-2.5 text-right text-muted-foreground">{q.totalAttempts > 0 ? `${q.avgScore}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Task stats */}
          {(data.taskStats.pending + data.taskStats.approved + data.taskStats.rejected) > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Task Submission Overview</CardTitle></CardHeader>
              <CardContent>
                <div className="flex gap-6">
                  <div className="text-center"><div className="text-2xl font-bold text-amber-500">{data.taskStats.pending}</div><div className="text-xs text-muted-foreground mt-1">Pending Review</div></div>
                  <div className="text-center"><div className="text-2xl font-bold text-emerald-500">{data.taskStats.approved}</div><div className="text-xs text-muted-foreground mt-1">Approved</div></div>
                  <div className="text-center"><div className="text-2xl font-bold text-red-500">{data.taskStats.rejected}</div><div className="text-xs text-muted-foreground mt-1">Rejected</div></div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Enrollments Tab ─── */
type Enrollment = { id: number; userId: string; courseId: number; status: string; enrolledAt: string; completedAt: string | null; userName: string; userEmail: string; courseTitle: string; };

function EnrollmentsTab() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/instructor/enrollments");
      if (res.ok) setEnrollments(await res.json());
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const remove = async (id: number) => {
    if (!confirm("Remove this enrollment?")) return;
    try {
      await fetch(`/api/instructor/enrollments/${id}`, { method: "DELETE" });
      toast({ title: "Enrollment removed" });
      load();
    } catch { toast({ title: "Failed to remove", variant: "destructive" }); }
  };

  const filtered = enrollments.filter((e) => !search || e.userName.toLowerCase().includes(search.toLowerCase()) || e.courseTitle.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input placeholder="Search by student or course…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh</Button>
      </div>

      {loading ? (
        <div className="space-y-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground"><UserCheck className="h-10 w-10 mx-auto mb-3 opacity-30" /><p>{search ? "No matching enrollments." : "No enrollments yet."}</p></div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40">
              <tr className="border-b border-border text-muted-foreground text-xs">
                <th className="text-left px-4 py-3 font-medium">Student</th>
                <th className="text-left px-4 py-3 font-medium">Course</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Enrolled</th>
                <th className="text-right px-4 py-3 font-medium">Completed</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-b border-border/40 hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium truncate max-w-[160px]">{e.userName}</p>
                    <p className="text-[11px] text-muted-foreground truncate max-w-[160px]">{e.userEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground truncate max-w-[180px]">{e.courseTitle}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant="outline" className={e.status === "completed" ? "text-green-500 border-green-500/30" : e.status === "active" ? "text-blue-500 border-blue-500/30" : "text-muted-foreground"}>
                      {e.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-[11px] text-muted-foreground">{e.enrolledAt ? new Date(e.enrolledAt).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3 text-right text-[11px] text-muted-foreground">{e.completedAt ? new Date(e.completedAt).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive h-7 px-2" onClick={() => remove(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 bg-secondary/20 border-t border-border text-[11px] text-muted-foreground">{filtered.length} enrollment{filtered.length !== 1 ? "s" : ""}</div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   BATCHES TAB
════════════════════════════════════════════ */
type Batch = { id: number; courseId: number; name: string; description: string | null; startDate: string | null; endDate: string | null; maxStudents: number | null; status: string; createdAt: string; studentCount: number };
type BatchStudent = { id: number; batchId: number; userId: string; displayName: string | null; email: string | null; addedAt: string };
type BatchLiveClass = { id: number; title: string; scheduledAt: string; status: string; batchId: number | null };
type AvailableStudent = { id: string; displayName: string | null; email: string | null };

function BatchesTab({ courses }: { courses: { id: number; title: string }[] }) {
  const { toast } = useToast();
  const [selectedCourseId, setSelectedCourseId] = useState<string>(courses[0] ? String(courses[0].id) : "");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [openBatch, setOpenBatch] = useState<Batch | null>(null);

  // Create batch form
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createStart, setCreateStart] = useState("");
  const [createEnd, setCreateEnd] = useState("");
  const [createMax, setCreateMax] = useState("");
  const [creating, setCreating] = useState(false);

  const loadBatches = useCallback(async (courseId: string) => {
    if (!courseId) return;
    setLoadingBatches(true);
    try {
      const r = await fetch(`/api/instructor/courses/${courseId}/batches`);
      if (r.ok) setBatches(await r.json());
    } finally { setLoadingBatches(false); }
  }, []);

  useEffect(() => { if (selectedCourseId) loadBatches(selectedCourseId); }, [selectedCourseId, loadBatches]);

  const createBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || !selectedCourseId) return;
    setCreating(true);
    try {
      const r = await fetch(`/api/instructor/courses/${selectedCourseId}/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName.trim(), description: createDesc.trim() || undefined, startDate: createStart || undefined, endDate: createEnd || undefined, maxStudents: createMax || undefined }),
      });
      if (!r.ok) throw new Error();
      toast({ title: "Batch created!" });
      setShowCreate(false); setCreateName(""); setCreateDesc(""); setCreateStart(""); setCreateEnd(""); setCreateMax("");
      loadBatches(selectedCourseId);
    } catch { toast({ title: "Failed to create batch", variant: "destructive" }); }
    finally { setCreating(false); }
  };

  const deleteBatch = async (id: number) => {
    if (!confirm("Delete this batch? Students and sessions will be unassigned.")) return;
    try {
      await fetch(`/api/instructor/batches/${id}`, { method: "DELETE" });
      toast({ title: "Batch deleted" });
      if (openBatch?.id === id) setOpenBatch(null);
      loadBatches(selectedCourseId);
    } catch { toast({ title: "Failed to delete", variant: "destructive" }); }
  };

  if (openBatch) {
    return (
      <BatchDetail
        batch={openBatch}
        courses={courses}
        onBack={() => { setOpenBatch(null); loadBatches(selectedCourseId); }}
        onDelete={() => deleteBatch(openBatch.id)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedCourseId}
          onChange={(e) => { setSelectedCourseId(e.target.value); setOpenBatch(null); }}
          className="h-9 px-3 rounded-lg border border-border text-sm bg-background focus:outline-none focus:border-primary min-w-[220px]"
        >
          {courses.map((c) => <option key={c.id} value={String(c.id)}>{c.title}</option>)}
        </select>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)} className="gap-1.5 ml-auto">
          <Plus className="h-3.5 w-3.5" /> New Batch
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card className="border-primary/30 bg-primary/3">
          <CardContent className="pt-4">
            <form onSubmit={createBatch} className="space-y-3">
              <p className="text-sm font-semibold text-foreground mb-2">Create New Batch</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Batch Name *</label>
                  <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="e.g. Jan 2026 Cohort" required />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Max Students</label>
                  <Input type="number" min="1" value={createMax} onChange={(e) => setCreateMax(e.target.value)} placeholder="Unlimited" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Start Date</label>
                  <Input type="date" value={createStart} onChange={(e) => setCreateStart(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">End Date</label>
                  <Input type="date" value={createEnd} onChange={(e) => setCreateEnd(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
                <Textarea value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} rows={2} placeholder="Optional batch description…" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={creating || !createName.trim()}>{creating ? "Creating…" : "Create Batch"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Batch list */}
      {loadingBatches ? (
        <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : batches.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-25" />
            <p className="font-medium text-foreground">No batches yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Create your first batch to group students and schedule batch live sessions.</p>
            <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> New Batch</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {batches.map((b) => (
            <Card key={b.id} className="cursor-pointer hover:border-primary/40 transition-colors group" onClick={() => setOpenBatch(b)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm font-semibold truncate">{b.name}</CardTitle>
                    <Badge variant="outline" className={`mt-1 text-[10px] ${b.status === "active" ? "text-green-500 border-green-500/30" : b.status === "completed" ? "text-muted-foreground" : "text-amber-500 border-amber-500/30"}`}>{b.status}</Badge>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={(e) => { e.stopPropagation(); deleteBatch(b.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  <span>{b.studentCount} student{b.studentCount !== 1 ? "s" : ""}{b.maxStudents ? ` / ${b.maxStudents}` : ""}</span>
                </div>
                {(b.startDate || b.endDate) && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {b.startDate ? new Date(b.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}
                      {" → "}
                      {b.endDate ? new Date(b.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "ongoing"}
                    </span>
                  </div>
                )}
                {b.description && <p className="text-xs text-muted-foreground line-clamp-2">{b.description}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Batch Detail ─── */
function BatchDetail({ batch, courses, onBack, onDelete }: { batch: Batch; courses: { id: number; title: string }[]; onBack: () => void; onDelete: () => void }) {
  const { toast } = useToast();
  const [students, setStudents] = useState<BatchStudent[]>([]);
  const [available, setAvailable] = useState<AvailableStudent[]>([]);
  const [liveClasses, setLiveClasses] = useState<BatchLiveClass[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [studentSearch, setStudentSearch] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const loadAll = useCallback(async () => {
    setLoadingStudents(true); setLoadingClasses(true);
    const [s, a, l] = await Promise.all([
      fetch(`/api/instructor/batches/${batch.id}/students`).then((r) => r.ok ? r.json() : []),
      fetch(`/api/instructor/batches/${batch.id}/available-students`).then((r) => r.ok ? r.json() : []),
      fetch(`/api/instructor/batches/${batch.id}/live-classes`).then((r) => r.ok ? r.json() : []),
    ]);
    setStudents(s); setAvailable(a); setLoadingStudents(false);
    setLiveClasses(l); setLoadingClasses(false);
  }, [batch.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const addStudent = async (userId: string) => {
    setAddingId(userId);
    try {
      const r = await fetch(`/api/instructor/batches/${batch.id}/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!r.ok) throw new Error();
      toast({ title: "Student added to batch" });
      loadAll();
    } catch { toast({ title: "Failed to add student", variant: "destructive" }); }
    finally { setAddingId(null); }
  };

  const removeStudent = async (userId: string) => {
    setRemovingId(userId);
    try {
      await fetch(`/api/instructor/batches/${batch.id}/students/${userId}`, { method: "DELETE" });
      toast({ title: "Student removed from batch" });
      loadAll();
    } catch { toast({ title: "Failed to remove student", variant: "destructive" }); }
    finally { setRemovingId(null); }
  };

  const filteredAvailable = available.filter((u) =>
    !studentSearch ||
    (u.displayName ?? "").toLowerCase().includes(studentSearch.toLowerCase()) ||
    (u.email ?? "").toLowerCase().includes(studentSearch.toLowerCase())
  );

  return (
    <div className="space-y-5">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-1" onClick={onBack}>
          <ChevronRight className="h-4 w-4 rotate-180" /> All Batches
        </Button>
        <div className="h-4 w-px bg-border" />
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-lg truncate">{batch.name}</h2>
          {batch.description && <p className="text-sm text-muted-foreground truncate">{batch.description}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={`text-xs ${batch.status === "active" ? "text-green-500 border-green-500/30" : "text-muted-foreground"}`}>{batch.status}</Badge>
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive h-8 px-2" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Batch
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Students", value: students.length, icon: Users },
          { label: "Available Seats", value: batch.maxStudents ? batch.maxStudents - students.length : "∞", icon: UserCheck },
          { label: "Live Sessions", value: liveClasses.length, icon: Video },
          { label: "Dates", value: batch.startDate ? new Date(batch.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—", icon: Clock },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className="text-xl font-bold">{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Current students */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Enrolled Students ({students.length})</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingStudents ? (
              <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : students.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No students in this batch yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {students.map((s) => (
                  <div key={s.userId} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-secondary/40 transition-colors group">
                    <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {(s.displayName ?? s.email ?? "U").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.displayName ?? "—"}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{s.email}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive opacity-0 group-hover:opacity-100 shrink-0" disabled={removingId === s.userId}
                      onClick={() => removeStudent(s.userId)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add students */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><UserCheck className="h-4 w-4 text-emerald-500" /> Add Students ({filteredAvailable.length} available)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            <Input
              placeholder="Search enrolled students…"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              className="h-8 text-sm"
            />
            {loadingStudents ? (
              <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : filteredAvailable.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {available.length === 0 ? "All enrolled students are already in this batch." : "No students match your search."}
              </p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {filteredAvailable.map((u) => (
                  <div key={u.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-secondary/40 transition-colors">
                    <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold shrink-0">
                      {(u.displayName ?? u.email ?? "U").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.displayName ?? "—"}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                    </div>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-xs shrink-0 gap-1"
                      disabled={addingId === u.id} onClick={() => addStudent(u.id)}>
                      <Plus className="h-2.5 w-2.5" /> Add
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Live classes for this batch */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Video className="h-4 w-4 text-purple-500" /> Batch Live Sessions</CardTitle>
          <BatchScheduleDialog batchId={batch.id} courseId={batch.courseId} courses={courses} onSuccess={loadAll} />
        </CardHeader>
        <CardContent className="pt-0">
          {loadingClasses ? (
            <div className="space-y-2">{[1,2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : liveClasses.length === 0 ? (
            <div className="text-center py-6">
              <Video className="h-8 w-8 mx-auto mb-2 opacity-25" />
              <p className="text-sm text-muted-foreground">No live sessions scheduled for this batch yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {liveClasses.map((cls) => (
                <div key={cls.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-secondary/20">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
                    <Video className="h-4 w-4 text-purple-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{cls.title}</p>
                    <p className="text-xs text-muted-foreground">{new Date(cls.scheduledAt).toLocaleString()}</p>
                  </div>
                  <Badge variant={cls.status === "live" ? "destructive" : cls.status === "completed" ? "secondary" : "outline"}>{cls.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Batch Schedule Live Class Dialog ─── */
function BatchScheduleDialog({ batchId, courseId, courses, onSuccess }: { batchId: number; courseId: number; courses: { id: number; title: string }[]; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const form = useForm({ defaultValues: { title: "", description: "", scheduledAt: "", duration: 60 as number | undefined, maxAttendees: "" as string } });

  const handleSubmit = form.handleSubmit(async (d) => {
    try {
      const r = await fetch("/api/live-classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: d.title, description: d.description || undefined,
          scheduledAt: new Date(d.scheduledAt).toISOString(),
          duration: d.duration || undefined,
          maxAttendees: d.maxAttendees ? parseInt(d.maxAttendees) : undefined,
          courseId, batchId,
        }),
      });
      if (!r.ok) throw new Error();
      toast({ title: "Live class scheduled for batch!" });
      setOpen(false); form.reset(); onSuccess();
    } catch { toast({ title: "Failed to schedule", variant: "destructive" }); }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5"><CalendarPlus className="h-3.5 w-3.5" /> Schedule Session</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Schedule Batch Live Session</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField control={form.control} name="title" rules={{ required: "Title is required" }} render={({ field }) => (
              <FormItem><FormLabel>Title</FormLabel><FormControl><Input placeholder="e.g. Week 3 Live Q&A" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="scheduledAt" rules={{ required: "Date & time required" }} render={({ field }) => (
              <FormItem><FormLabel>Date & Time</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="duration" render={({ field }) => (
                <FormItem><FormLabel>Duration (min)</FormLabel><FormControl><Input type="number" min="15" step="15" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="maxAttendees" render={({ field }) => (
                <FormItem><FormLabel>Max Attendees</FormLabel><FormControl><Input type="number" min="1" placeholder="Unlimited" {...field} /></FormControl></FormItem>
              )} />
            </div>
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "Scheduling…" : "Schedule for Batch"}</Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/* ════════════════════════════════════════════
   MAIN INSTRUCTOR PANEL
════════════════════════════════════════════ */
export default function InstructorPanel() {
  const { data: myProfile } = useGetMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const clerkId = myProfile?.id ?? "";
  const [activeTab, setActiveTab] = useState("overview");

  const { data: courses, isLoading: coursesLoading } = useListCourses(
    { instructorId: clerkId },
    { query: { enabled: !!clerkId, queryKey: getListCoursesQueryKey({ instructorId: clerkId }) } }
  );
  const { data: liveClasses, isLoading: liveLoading } = useListLiveClasses(
    { instructorId: clerkId },
    { query: { enabled: !!clerkId, queryKey: getListLiveClassesQueryKey({ instructorId: clerkId }) } }
  );
  const { data: reviews } = useListInstructorReviews(
    { status: "pending_review" },
    { query: { queryKey: getListInstructorReviewsQueryKey({ status: "pending_review" }) } }
  );

  const updateCourse = useUpdateCourse({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListCoursesQueryKey({ instructorId: clerkId }) }); toast({ title: "Course updated" }); } } });
  const deleteCourse = useDeleteCourse({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListCoursesQueryKey({ instructorId: clerkId }) }); toast({ title: "Course deleted" }); } } });

  const totalStudents = courses?.reduce((a, c) => a + (c.enrollmentCount ?? 0), 0) ?? 0;
  const pendingCount = reviews?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Instructor Panel</h1>
          <p className="text-muted-foreground">Manage your courses, track students, and review submissions.</p>
        </div>
        <CreateCourseDialog onSuccess={() => qc.invalidateQueries({ queryKey: getListCoursesQueryKey({ instructorId: clerkId }) })} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="courses">
            Courses
            {courses && courses.length > 0 && <span className="ml-1.5 text-[10px] bg-primary/20 text-primary rounded-full px-1.5 py-0.5">{courses.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
          <TabsTrigger value="batches">Batches</TabsTrigger>
          <TabsTrigger value="reviews" className="relative">
            Reviews
            {pendingCount > 0 && <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold">{pendingCount}</span>}
          </TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Total Students", value: totalStudents, icon: Users, color: "text-blue-400" },
              { label: "Your Courses", value: courses?.length ?? 0, icon: BookOpen, color: "text-green-400" },
              { label: "Live Sessions", value: liveClasses?.length ?? 0, icon: Video, color: "text-purple-400" },
              { label: "Pending Reviews", value: pendingCount, icon: ClipboardCheck, color: pendingCount > 0 ? "text-amber-400" : "text-muted-foreground" },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label} className="cursor-pointer hover:bg-secondary/30 transition-colors" onClick={() => { if (label === "Pending Reviews") setActiveTab("reviews"); else if (label === "Your Courses") setActiveTab("courses"); else if (label === "Total Students") setActiveTab("students"); }}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                  <Icon className={`h-4 w-4 ${color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{value.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">Click to view <ChevronRight className="h-3 w-3" /></p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Recent live sessions */}
          {liveClasses && liveClasses.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Upcoming Sessions</CardTitle>
                <ScheduleLiveClassDialog courses={courses?.map((c) => ({ id: c.id, title: c.title }))} onSuccess={() => qc.invalidateQueries({ queryKey: getListLiveClassesQueryKey() })} />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {liveClasses.slice(0, 5).map((cls) => (
                    <div key={cls.id} className="flex items-center gap-3 p-3 rounded-lg border border-border" data-testid={`row-class-${cls.id}`}>
                      <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0"><Video className="h-4 w-4 text-purple-500" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{cls.title}</p>
                        <p className="text-xs text-muted-foreground">{new Date(cls.scheduledAt).toLocaleString()}</p>
                      </div>
                      <Badge variant={cls.status === "live" ? "destructive" : cls.status === "completed" ? "secondary" : "outline"}>{cls.status}</Badge>
                      <span className="text-xs text-muted-foreground shrink-0">{cls.registrationCount} registered</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick action if no sessions */}
          {(!liveClasses || liveClasses.length === 0) && (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center">
                <Video className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm text-muted-foreground mb-3">No live sessions scheduled yet.</p>
                <ScheduleLiveClassDialog courses={courses?.map((c) => ({ id: c.id, title: c.title }))} onSuccess={() => qc.invalidateQueries({ queryKey: getListLiveClassesQueryKey() })} />
              </CardContent>
            </Card>
          )}

          {/* Announcements */}
          <AnnouncementCard courses={courses?.map((c) => ({ id: c.id, title: c.title })) ?? []} />
        </TabsContent>

        {/* ── Courses ── */}
        <TabsContent value="courses" className="mt-6">
          <Card>
            <CardHeader><CardTitle>Your Courses</CardTitle></CardHeader>
            <CardContent>
              {coursesLoading ? (
                <div className="space-y-3">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
              ) : !courses || courses.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">No courses yet. Use the button above to create one.</div>
              ) : (
                <div className="space-y-3">
                  {courses.map((course) => (
                    <div key={course.id} className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-secondary/30 transition-colors" data-testid={`row-course-${course.id}`}>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{course.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className="text-xs capitalize">{course.category}</Badge>
                          <Badge variant="outline" className="text-xs capitalize">{course.level}</Badge>
                          <Badge variant={course.status === "published" ? "default" : "secondary"} className="text-xs">{course.status}</Badge>
                        </div>
                      </div>
                      <div className="text-right shrink-0 text-sm text-muted-foreground">
                        <p className="font-medium text-foreground">{course.enrollmentCount} students</p>
                        <p>{course.lessonCount} lessons</p>
                      </div>
                      <div className="flex gap-2 shrink-0 flex-wrap">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline" data-testid={`button-manage-course-${course.id}`}><Settings2 className="h-3.5 w-3.5 mr-1.5" />Content</Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                            <DialogHeader><DialogTitle>{course.title} — Content</DialogTitle></DialogHeader>
                            <CourseContentManager courseId={course.id} />
                          </DialogContent>
                        </Dialog>
                        <EditCourseDialog course={course} onSuccess={() => qc.invalidateQueries({ queryKey: getListCoursesQueryKey({ instructorId: clerkId }) })} />
                        <Button size="sm" variant="outline" data-testid={`button-toggle-status-${course.id}`} onClick={() => updateCourse.mutate({ courseId: course.id, data: { status: course.status === "published" ? "draft" : "published" } })}>
                          {course.status === "published" ? "Unpublish" : "Publish"}
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" data-testid={`button-delete-course-${course.id}`} onClick={() => { if (confirm("Delete this course?")) deleteCourse.mutate({ courseId: course.id }); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Students ── */}
        <TabsContent value="students" className="mt-6">
          <StudentsTab />
        </TabsContent>

        {/* ── Analytics ── */}
        <TabsContent value="analytics" className="mt-6">
          <AnalyticsTab courses={courses?.map((c) => ({ id: c.id, title: c.title }))} />
        </TabsContent>

        {/* ── Enrollments ── */}
        <TabsContent value="enrollments" className="mt-6">
          <EnrollmentsTab />
        </TabsContent>

        {/* ── Batches ── */}
        <TabsContent value="batches" className="mt-6">
          {courses && courses.length > 0
            ? <BatchesTab courses={courses.map((c) => ({ id: c.id, title: c.title }))} />
            : (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-25" />
                  <p className="font-medium text-foreground">No courses yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Create a course first to start managing batches.</p>
                </CardContent>
              </Card>
            )
          }
        </TabsContent>

        {/* ── Reviews ── */}
        <TabsContent value="reviews" className="space-y-6 mt-6">
          <ReviewQueueCard />
          <TaskSubmissionsCard />
          <QuizAnalyticsCard courses={courses?.map((c) => ({ id: c.id, title: c.title }))} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
