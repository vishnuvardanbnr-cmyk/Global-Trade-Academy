import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRoute, Link } from "wouter";
import {
  useGetCourse, useListLessons, useListCourseSections, getListCourseSectionsQueryKey,
  useListEnrollments, useCreateEnrollment,
  getListEnrollmentsQueryKey,
  useGetCourseProgress, getGetCourseProgressQueryKey,
  useUpdateLessonProgress,
  useListQuizzes, useGetQuiz, useSubmitQuizAttempt, getListQuizzesQueryKey,
  useListTasks, useCompleteTask, getListTasksQueryKey,
  useListReviews, useUpsertReview, getListReviewsQueryKey,
  useListNotes, useCreateNote, useDeleteNote, getListNotesQueryKey,
  useListBookmarks, useToggleBookmark, getListBookmarksQueryKey,
  getGetDashboardSummaryQueryKey,
  useGetLessonGate, getGetLessonGateQueryKey,
  useListLiveClasses, useRegisterLiveClass, getListLiveClassesQueryKey,
  type QuizAttemptResult,
  type LessonGate,
  type LiveClass,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  BookOpen, Clock, Users, Star, Play, CheckCircle2, Lock, ChevronRight,
  Award, ArrowLeft, ChevronDown, ChevronUp, FileQuestion, ListTodo,
  StickyNote, Trophy, Zap, BarChart2, PlayCircle, CheckCheck, Bookmark,
  Trash2, Loader2, ClipboardCheck, AlertTriangle, ShieldCheck,
  Video, FileText, GraduationCap, SkipForward, MonitorPlay,
  Radio, Calendar, ExternalLink,
} from "lucide-react";

/* ─── Helpers ─────────────────────────────────────────────────── */
type DbLesson = {
  id: number; title: string; duration: number | null; order: number;
  isFree: boolean; type: string; sectionId?: number | null;
  videoUrl?: string | null; content?: string | null;
};
type ChapterGroup = { id: number; title: string; dur: string; lessons: DbLesson[] };

function durStr(mins: number) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function buildSectionGroups(
  dbLessons: DbLesson[],
  sections: { id: number; title: string; position: number }[],
): ChapterGroup[] {
  const sorted = [...sections].sort((a, b) => a.position - b.position);
  const groups: ChapterGroup[] = [];

  // Sections with lessons
  for (const sec of sorted) {
    const sectionLessons = dbLessons.filter((l) => l.sectionId === sec.id).sort((a, b) => a.order - b.order);
    const totalMin = sectionLessons.reduce((s, l) => s + (l.duration ?? 0), 0);
    groups.push({ id: sec.id, title: sec.title, dur: durStr(totalMin), lessons: sectionLessons });
  }

  // Unsectioned lessons go at the end
  const unsectioned = dbLessons.filter((l) => !l.sectionId).sort((a, b) => a.order - b.order);
  if (unsectioned.length > 0) {
    const totalMin = unsectioned.reduce((s, l) => s + (l.duration ?? 0), 0);
    groups.push({ id: 0, title: sections.length > 0 ? "Other Lessons" : "Course Content", dur: durStr(totalMin), lessons: unsectioned });
  }

  return groups;
}

function buildFlatGroups(dbLessons: DbLesson[]): ChapterGroup[] {
  const totalMin = dbLessons.reduce((s, l) => s + (l.duration ?? 0), 0);
  return dbLessons.length === 0 ? [] : [{ id: 1, title: "Course Content", dur: durStr(totalMin), lessons: dbLessons }];
}

/* ─── URL type helpers ─────────────────────────────────────────── */
function extractYtId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^&?/\s]+)/);
  return m?.[1] ?? null;
}
function extractVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m?.[1] ?? null;
}
function isDirectVideo(url: string): boolean {
  return /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url);
}

/* ─── YouTube IFrame API loader (module-level singleton) ───────── */
let _ytReady = false;
const _ytCallbacks: Array<() => void> = [];

function loadYTApi(onReady: () => void) {
  if (_ytReady) { onReady(); return; }
  _ytCallbacks.push(onReady);
  if (!document.getElementById("yt-api-script")) {
    const w = window as unknown as Record<string, unknown>;
    const prev = w.onYouTubeIframeAPIReady as (() => void) | undefined;
    w.onYouTubeIframeAPIReady = () => {
      if (prev) prev();
      _ytReady = true;
      _ytCallbacks.forEach((fn) => fn());
      _ytCallbacks.length = 0;
    };
    const s = document.createElement("script");
    s.id = "yt-api-script";
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  }
}

/* ─── YouTube sub-player (IFrame API → accurate ended event) ───── */
function YtPlayer({ videoId, onEnded }: { videoId: string; onEnded?: () => void }) {
  const divRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const onEndedRef = useRef(onEnded);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

  useEffect(() => {
    if (!divRef.current) return;
    const container = divRef.current;
    let destroyed = false;
    loadYTApi(() => {
      if (destroyed || !container) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      playerRef.current = new (window as any).YT.Player(container, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1, autoplay: 0 },
        events: {
          onStateChange: (e: { data: number }) => {
            if (e.data === 0) onEndedRef.current?.(); // 0 = ENDED
          },
        },
      });
    });
    return () => {
      destroyed = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [videoId]);

  return <div className="w-full aspect-video bg-black"><div ref={divRef} className="w-full h-full" /></div>;
}

/* ─── Vimeo sub-player (postMessage → finish event) ────────────── */
function VimeoPlayer({ videoId, onEnded }: { videoId: string; onEnded?: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onEndedRef = useRef(onEnded);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

  useEffect(() => {
    const handle = (e: MessageEvent) => {
      if (!String(e.origin).includes("vimeo.com")) return;
      try {
        const d = (typeof e.data === "string" ? JSON.parse(e.data) : e.data) as Record<string, unknown>;
        if (d.event === "finish") onEndedRef.current?.();
      } catch { /* ignore */ }
    };
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, []);

  const onLoad = () => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ method: "addEventListener", value: "finish" }),
      "https://player.vimeo.com",
    );
  };

  return (
    <div className="w-full aspect-video bg-black">
      <iframe
        ref={iframeRef}
        src={`https://player.vimeo.com/video/${videoId}?api=1&responsive=1&color=3b82f6&title=0&byline=0&portrait=0`}
        className="w-full h-full"
        allowFullScreen
        onLoad={onLoad}
      />
    </div>
  );
}

/* ─── Master smart VideoPlayer ─────────────────────────────────── */
function VideoPlayer({
  url, title, lessonType, duration, onEnded,
}: {
  url?: string | null; title?: string; lessonType?: string; duration?: number | null; onEnded?: () => void;
}) {
  if (!url) {
    const isArticle = lessonType === "article";
    return (
      <div className="w-full aspect-video relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 flex flex-col items-center justify-center">
        {/* decorative blobs */}
        <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-10 w-56 h-56 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        {/* subtle grid */}
        <div className="absolute inset-0 opacity-[0.025] pointer-events-none"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px)", backgroundSize: "48px 48px" }} />

        <div className="relative z-10 flex flex-col items-center text-center px-8 gap-5 max-w-lg">
          {/* icon badge */}
          <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-sm flex items-center justify-center shadow-xl">
            {isArticle
              ? <FileText className="h-7 w-7 text-blue-300" />
              : <BookOpen className="h-7 w-7 text-blue-300" />}
          </div>

          {/* lesson title */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-400/70">
              {isArticle ? "Reading Lesson" : "Lesson"}
            </p>
            <h2 className="text-white font-bold text-[22px] leading-snug">{title}</h2>
            {duration && (
              <p className="text-white/35 text-[12px]">{duration} min read</p>
            )}
          </div>

          {/* CTA pill */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/8 border border-white/12 text-white/45 text-[11.5px] font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Scroll down to read the lesson content
          </div>
        </div>
      </div>
    );
  }

  const ytId = extractYtId(url);
  if (ytId) return <YtPlayer videoId={ytId} onEnded={onEnded} />;

  const vimeoId = extractVimeoId(url);
  if (vimeoId) return <VimeoPlayer videoId={vimeoId} onEnded={onEnded} />;

  if (isDirectVideo(url)) {
    return (
      <div className="w-full aspect-video bg-black">
        <video src={url} controls className="w-full h-full" onEnded={onEnded}>
          <source src={url} />
        </video>
      </div>
    );
  }

  // Generic embed — no end-detection possible, show inside the same frame
  return (
    <div className="w-full aspect-video bg-black">
      <iframe src={url} className="w-full h-full" allowFullScreen title={title} />
    </div>
  );
}

/* ─── Live Sessions Tab ─────────────────────────────────────── */
function LiveSessionsTab({ courseId }: { courseId: number }) {
  const { toast } = useToast();
  const { data: sessions = [], isLoading } = useListLiveClasses({ courseId }, {
    query: { queryKey: getListLiveClassesQueryKey({ courseId }), refetchInterval: 30_000 },
  });

  const { mutate: register, isPending: registering } = useRegisterLiveClass({
    mutation: {
      onSuccess: () => toast({ title: "Registered for session!" }),
      onError: () => toast({ title: "Could not register", variant: "destructive" }),
    },
  });

  function formatSessionTime(d: string | Date) {
    return new Date(d).toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }
  function durStr(mins: number) {
    const h = Math.floor(mins / 60), m = mins % 60;
    return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}` : `${m}m`;
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  const allSessions = sessions as LiveClass[];
  const liveSessions = allSessions.filter((s) => s.status === "live");
  const upcoming = allSessions.filter((s) => s.status === "scheduled");
  const past = allSessions.filter((s) => s.status === "completed");

  if (allSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <Radio className="h-10 w-10 text-slate-300" />
        <p className="text-slate-500 font-medium">No live sessions scheduled</p>
        <p className="text-slate-400 text-[13px]">Check back later for upcoming live sessions.</p>
      </div>
    );
  }

  function SessionCard({ session }: { session: LiveClass }) {
    const isLive = session.status === "live";
    const isPast = session.status === "completed";
    return (
      <div className={cn(
        "flex items-start gap-4 p-4 rounded-xl border transition-colors",
        isLive ? "bg-red-50 border-red-200" : isPast ? "bg-slate-50 border-slate-200 opacity-70" : "bg-white border-slate-200 hover:border-blue-200",
      )}>
        <div className={cn(
          "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center mt-0.5",
          isLive ? "bg-red-100 text-red-500" : isPast ? "bg-slate-200 text-slate-400" : "bg-blue-100 text-blue-500",
        )}>
          {isLive ? <Radio className="h-5 w-5 animate-pulse" /> : isPast ? <MonitorPlay className="h-5 w-5" /> : <Video className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 justify-between">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 text-[14px] leading-snug truncate">{session.title}</p>
              {session.description && (
                <p className="text-slate-500 text-[12px] mt-0.5 line-clamp-1">{session.description}</p>
              )}
            </div>
            {isLive && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500 text-white text-[10.5px] font-bold uppercase shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                Live
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-[12px] text-slate-500">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              {formatSessionTime(session.scheduledAt)}
            </span>
            {session.duration && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                {durStr(session.duration)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5 text-slate-400" />
              {session.registrationCount} registered
            </span>
          </div>
          {session.agenda && (
            <p className="text-[11.5px] text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">{session.agenda}</p>
          )}
          <div className="flex items-center gap-2 mt-3">
            {isLive ? (
              <Link href={`/live/${session.id}/room`}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-[12.5px] font-bold transition-colors">
                <Play className="h-3.5 w-3.5" />
                Join Now
              </Link>
            ) : isPast ? (
              session.replayUrl ? (
                <a href={session.replayUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-[12.5px] font-bold transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Watch Replay
                </a>
              ) : (
                <span className="text-[12px] text-slate-400">Session ended</span>
              )
            ) : (
              <div className="flex items-center gap-2">
                <Link href={`/live/${session.id}/room`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[12.5px] font-bold transition-colors">
                  <Video className="h-3.5 w-3.5" />
                  Open Room
                </Link>
                <button onClick={() => register({ classId: session.id })} disabled={registering}
                  className="px-3 py-2 rounded-lg text-[12px] font-semibold border border-slate-200 text-slate-600 hover:border-blue-200 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                  <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Register</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {liveSessions.length > 0 && (
        <section>
          <h3 className="text-[13px] font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Happening Now
          </h3>
          <div className="space-y-3">
            {liveSessions.map((s) => <SessionCard key={s.id} session={s} />)}
          </div>
        </section>
      )}
      {upcoming.length > 0 && (
        <section>
          <h3 className="text-[13px] font-bold text-slate-700 uppercase tracking-wide mb-3">Upcoming Sessions</h3>
          <div className="space-y-3">
            {upcoming.map((s) => <SessionCard key={s.id} session={s} />)}
          </div>
        </section>
      )}
      {past.length > 0 && (
        <section>
          <h3 className="text-[13px] font-bold text-slate-500 uppercase tracking-wide mb-3">Past Sessions</h3>
          <div className="space-y-3">
            {past.map((s) => <SessionCard key={s.id} session={s} />)}
          </div>
        </section>
      )}
    </div>
  );
}

type Tab = "overview" | "quiz" | "tasks" | "notes" | "reviews" | "live";

export default function CourseDetail() {
  const [, params] = useRoute<{ id: string }>("/courses/:id");
  const courseId = params?.id ? parseInt(params.id) : 0;
  const validId = courseId > 0 ? courseId : -1;

  const { data: course, isLoading } = useGetCourse(validId);
  const { data: lessons } = useListLessons(validId);
  const { data: sections } = useListCourseSections(validId, {
    query: { enabled: courseId > 0, queryKey: getListCourseSectionsQueryKey(validId) },
  });
  const { data: enrollments } = useListEnrollments();
  const { mutateAsync: enroll, isPending: enrolling } = useCreateEnrollment();
  const qc = useQueryClient();
  const { toast } = useToast();

  const isEnrolled = enrollments?.some((e) => e.courseId === courseId) ?? false;

  const { data: progress } = useGetCourseProgress(validId, {
    query: { enabled: courseId > 0 && isEnrolled, queryKey: getGetCourseProgressQueryKey(validId) },
  });

  const [tab, setTab] = useState<Tab>("overview");
  const [activeIdx, setActiveIdx] = useState(0);
  const [expanded, setExpanded] = useState<number>(1);

  const dbLessons = (lessons ?? []) as DbLesson[];
  const chapterGroups = useMemo(() => {
    const secs = sections ?? [];
    return secs.length > 0
      ? buildSectionGroups(dbLessons, secs)
      : buildFlatGroups(dbLessons);
  }, [dbLessons, sections]);
  const totalL = dbLessons.length;

  const completedSet = useMemo(
    () => new Set((progress?.lessons ?? []).filter((p) => p.completed).map((p) => p.lessonId)),
    [progress],
  );
  const unlockedSet = useMemo(() => new Set(progress?.unlockedLessonIds ?? []), [progress]);
  const pct = progress?.percent ?? 0;
  const completedCount = progress?.completedLessons ?? completedSet.size;

  const cur = dbLessons[activeIdx];
  const curChapter = chapterGroups.find((ch) => ch.lessons.some((l) => l.id === cur?.id));
  const chIdx = curChapter ? chapterGroups.indexOf(curChapter) : 0;
  const curDone = cur ? completedSet.has(cur.id) : false;

  // Gate for the currently active lesson
  const { data: gate } = useGetLessonGate(cur?.id ?? -1, {
    query: {
      enabled: isEnrolled && curDone && (cur?.id ?? 0) > 0,
      queryKey: getGetLessonGateQueryKey(cur?.id ?? -1),
      retry: false,
    },
  });
  // Treat 404 (no gate) as null by relying on `data` being undefined

  function lessonLocked(l: DbLesson): boolean {
    if (!isEnrolled) return !l.isFree;
    if (progress?.unlockedLessonIds) return !unlockedSet.has(l.id);
    return false;
  }

  const invalidateProgress = async () => {
    await qc.invalidateQueries({ queryKey: getGetCourseProgressQueryKey(courseId) });
    await qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    if (cur) await qc.invalidateQueries({ queryKey: getGetLessonGateQueryKey(cur.id) });
  };

  const doEnroll = async () => {
    try {
      await enroll({ data: { courseId } });
      await qc.invalidateQueries({ queryKey: getListEnrollmentsQueryKey() });
      toast({ title: "Enrolled!", description: "Start your first lesson below." });
    } catch { toast({ title: "Enrollment failed", variant: "destructive" }); }
  };

  /* ─── Video-driven lesson completion ─── */
  const { mutateAsync: updateProgress } = useUpdateLessonProgress();

  const onVideoEnded = useCallback(async () => {
    if (!isEnrolled) return;
    if (!cur) return;
    try {
      if (!curDone) {
        const res = await updateProgress({ lessonId: cur.id, data: { completed: true } });
        await qc.invalidateQueries({ queryKey: getGetCourseProgressQueryKey(courseId) });
        await qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        await qc.invalidateQueries({ queryKey: getGetLessonGateQueryKey(cur.id) });
        if (res.courseCompleted) {
          toast({ title: "Course complete! 🎓", description: `+${res.xpAwarded} XP earned · Certificate issued.` });
          return;
        }
        toast({ title: "Lesson complete ✓", description: `+${res.xpAwarded} XP earned` });
      }
      // Auto-advance to next lesson after a brief pause
      if (activeIdx < totalL - 1) {
        setTimeout(() => setActiveIdx((p) => p + 1), 1400);
      }
    } catch {
      toast({ title: "Could not save progress", variant: "destructive" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id, curDone, isEnrolled, activeIdx, totalL, courseId]);

  if (isLoading) return (
    <div className="space-y-0 -mx-4 -mt-4 md:-mx-6 md:-mt-6 lg:-mx-8 lg:-mt-8">
      <Skeleton className="h-14 w-full rounded-none" />
      <div className="grid lg:grid-cols-[1fr_360px]">
        <div className="space-y-0">
          <Skeleton className="aspect-video w-full rounded-none" />
          <Skeleton className="h-20 w-full rounded-none" />
          <Skeleton className="h-12 w-full rounded-none" />
          <Skeleton className="h-64 w-full rounded-none" />
        </div>
        <Skeleton className="h-full min-h-[500px] w-full rounded-none" />
      </div>
    </div>
  );

  if (!course) return (
    <div className="text-center py-20">
      <GraduationCap className="h-12 w-12 text-slate-200 mx-auto mb-4" />
      <p className="text-slate-500 text-sm font-medium">Course not found.</p>
      <Link href="/courses" className="text-blue-600 text-sm font-medium mt-3 inline-flex items-center gap-1 hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Academy
      </Link>
    </div>
  );

  return (
    <div className="-mx-4 -mt-4 md:-mx-6 md:-mt-6 lg:-mx-8 lg:-mt-8 flex flex-col">

      {/* ── Top navigation bar ───────────────────────────── */}
      <div className="bg-slate-900 border-b border-slate-700/60 px-5 py-2.5 flex items-center gap-3 shrink-0">
        <Link href="/courses"
          className="flex items-center gap-1.5 text-white/50 hover:text-white text-[12px] font-medium transition-colors shrink-0">
          <ArrowLeft className="h-3.5 w-3.5" /> Academy
        </Link>
        <span className="text-white/20 text-xs shrink-0">/</span>
        <span className="text-white/80 text-[12.5px] font-medium truncate flex-1">{course.title}</span>

        {isEnrolled && (
          <div className="hidden sm:flex items-center gap-2.5 shrink-0">
            <div className="w-28 bg-white/10 rounded-full h-1.5">
              <div className="bg-emerald-400 h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] text-white/50 font-medium">{completedCount}/{totalL} done</span>
          </div>
        )}
      </div>

      {/* ── Two-column main area ──────────────────────────── */}
      <div className="flex flex-col lg:grid lg:grid-cols-[1fr_360px] min-h-0">

        {/* LEFT: player + lesson content */}
        <div className="flex flex-col min-w-0 border-r border-slate-100 bg-slate-950">

          {/* Video player */}
          <div className="w-full">
            <VideoPlayer
              url={cur?.videoUrl}
              title={cur?.title}
              lessonType={cur?.type}
              duration={cur?.duration}
              onEnded={isEnrolled ? onVideoEnded : undefined}
            />
          </div>

          {/* Status bar below video */}
          {isEnrolled && cur?.videoUrl && (
            <div className={cn(
              "px-5 py-2.5 text-[12px] font-semibold flex items-center gap-2.5 transition-all",
              curDone
                ? "bg-emerald-500 text-white"
                : "bg-slate-800 text-white/40",
            )}>
              {curDone
                ? <><CheckCircle2 className="h-4 w-4 shrink-0" /> Lesson completed — great work!</>
                : <><Play className="h-3.5 w-3.5 shrink-0" /> Watch the full video to mark this lesson complete</>}
            </div>
          )}

          {/* Lesson header — white card */}
          <div className="bg-white border-b border-slate-100 shrink-0">
            {/* Top meta row */}
            <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                {curChapter && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    {curChapter.title}
                  </span>
                )}
                {cur?.type && cur.type !== "video" && (
                  <span className={cn("text-[11px] font-semibold px-2.5 py-1 rounded-full border shrink-0",
                    cur.type === "article"
                      ? "bg-violet-50 text-violet-700 border-violet-100"
                      : "bg-slate-50 text-slate-500 border-slate-200")}>
                    {cur.type === "article" ? "Reading" : cur.type.charAt(0).toUpperCase() + cur.type.slice(1)}
                  </span>
                )}
                {curDone && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0">
                    <CheckCircle2 className="h-3 w-3" /> Completed
                  </span>
                )}
                <span className="text-[11px] text-slate-400 shrink-0">
                  {activeIdx + 1} / {totalL}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isEnrolled && cur && <BookmarkButton courseId={courseId} lessonId={cur.id} />}
                <button
                  disabled={activeIdx === 0}
                  onClick={() => { setActiveIdx((p) => p - 1); setTab("overview"); }}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-25 disabled:cursor-not-allowed transition-all border border-transparent hover:border-slate-200"
                  title="Previous lesson"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  disabled={activeIdx >= totalL - 1}
                  onClick={() => { setActiveIdx((p) => p + 1); setTab("overview"); }}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-25 disabled:cursor-not-allowed transition-all border border-transparent hover:border-slate-200"
                  title="Next lesson"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Lesson title */}
            <div className="px-6 pb-4">
              <h1 className="text-[22px] font-extrabold text-slate-900 leading-tight tracking-tight">
                {cur?.title ?? course.title}
              </h1>

              {/* Gate banner */}
              {isEnrolled && curDone && gate && (
                <div className="mt-3">
                  <LessonGateBanner gate={gate} onGoToQuiz={() => setTab("quiz")} />
                </div>
              )}
            </div>

            {/* Tab bar — pill style */}
            <div className="flex items-center gap-1 px-4 pb-3 overflow-x-auto">
              {[
                { k: "overview", label: "Overview", Icon: BookOpen },
                { k: "quiz", label: "Quizzes", Icon: FileQuestion },
                { k: "tasks", label: "Tasks", Icon: ListTodo },
                { k: "notes", label: "Notes", Icon: StickyNote },
                { k: "reviews", label: "Reviews", Icon: Star },
                { k: "live", label: "Live", Icon: Radio },
              ].map(({ k, label, Icon }) => (
                <button key={k} onClick={() => setTab(k as Tab)}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12.5px] font-semibold transition-all whitespace-nowrap",
                    tab === k
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100",
                  )}>
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  {k === "quiz" && gate && (gate.status === "awaiting_quiz" || gate.status === "rejected") && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 bg-white p-6 pb-12">
            {tab === "overview" && (
              <OverviewTab
                cur={cur} chIdx={chIdx}
                isEnrolled={isEnrolled} curDone={curDone}
                doEnroll={doEnroll} enrolling={enrolling}
                gate={gate} onGoToQuiz={() => setTab("quiz")}
              />
            )}
            {tab === "quiz" && (
              <QuizTab courseId={courseId} isEnrolled={isEnrolled} onGraded={invalidateProgress} gate={gate} />
            )}
            {tab === "tasks" && <TasksTab courseId={courseId} isEnrolled={isEnrolled} onDone={invalidateProgress} />}
            {tab === "notes" && <NotesTab lesson={cur} isEnrolled={isEnrolled} />}
            {tab === "reviews" && <ReviewsTab courseId={courseId} isEnrolled={isEnrolled} />}
            {tab === "live" && <LiveSessionsTab courseId={courseId} />}
          </div>
        </div>

        {/* RIGHT: Sticky sidebar ──────────────────────────── */}
        <div className="lg:sticky lg:top-0 lg:max-h-screen lg:overflow-y-auto flex flex-col bg-white border-l border-slate-100">

          {/* Course thumbnail */}
          {course.thumbnailUrl && (
            <div className="relative shrink-0 overflow-hidden h-44">
              <img
                src={course.thumbnailUrl}
                alt={course.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/40 to-transparent" />
              <div className="absolute bottom-3 left-4 flex gap-1.5">
                <span className="px-2.5 py-0.5 rounded-full bg-blue-500/90 text-white text-[10px] font-bold uppercase tracking-wide backdrop-blur-sm">
                  {course.category}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-bold uppercase tracking-wide backdrop-blur-sm border border-white/20">
                  {course.level}
                </span>
              </div>
            </div>
          )}

          {/* Course info card */}
          <div className="bg-white px-5 pt-4 pb-5 border-b border-slate-100 shrink-0">
            <h2 className="text-[14px] font-bold text-slate-900 leading-snug mb-1">{course.title}</h2>
            <p className="text-[12px] text-slate-500 leading-relaxed mb-4 line-clamp-2">{course.description}</p>

            {/* Instructor row */}
            <div className="flex items-center gap-2.5 mb-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[12px] font-bold text-white shrink-0">
                {(course.instructorName ?? "I").charAt(0)}
              </div>
              <div>
                <p className="text-[12.5px] font-semibold text-slate-800 leading-none">{course.instructorName ?? "Instructor"}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Course Instructor</p>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {[
                { Icon: Users, val: `${(course.enrollmentCount ?? 0).toLocaleString()}`, label: "students" },
                { Icon: BookOpen, val: `${totalL}`, label: "lessons" },
                { Icon: Clock, val: `${course.duration ?? 0}h`, label: "content" },
                { Icon: Star, val: course.rating ? course.rating.toFixed(1) : "New", label: "rating" },
              ].map(({ Icon, val, label }) => (
                <div key={label} className="flex flex-col gap-0.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    <span className="text-[13px] font-bold text-slate-800">{val}</span>
                  </div>
                  <span className="text-[10.5px] text-slate-400 capitalize">{label}</span>
                </div>
              ))}
            </div>

            {isEnrolled ? (
              <div className="space-y-2.5">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex justify-between text-[12px] mb-2 text-slate-600">
                    <span className="font-semibold">Your progress</span>
                    <span className="font-extrabold text-slate-900">{pct}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-emerald-500 h-2.5 rounded-full transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">{completedCount} of {totalL} lessons completed</p>
                </div>
                {progress?.courseCompleted && progress.certificateSerial && (
                  <Link href="/dashboard"
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 text-amber-800 text-[12px] font-semibold hover:border-amber-300 transition-colors">
                    <Award className="h-5 w-5 text-amber-500 shrink-0" />
                    Certificate #{progress.certificateSerial}
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-end justify-center gap-1.5 py-1">
                  <p className="text-[34px] font-black text-slate-900 leading-none">
                    {course.price ? `$${course.price}` : "Free"}
                  </p>
                  {!course.price && (
                    <span className="text-[12px] text-slate-400 pb-1.5">Full lifetime access</span>
                  )}
                </div>
                <button onClick={doEnroll} disabled={enrolling}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-xl font-bold text-[14px] transition-all shadow-md shadow-blue-600/20 hover:shadow-blue-500/30 disabled:opacity-60 active:scale-[0.98]">
                  {enrolling ? "Enrolling…" : course.price ? "Enroll Now" : "Enroll Free"}
                </button>
                <ul className="space-y-2">
                  {[`${totalL} lessons`, "Quizzes & tasks", "Certificate on completion", "Lifetime access"].map((f) => (
                    <li key={f} className="flex items-center gap-2 text-[12px] text-slate-600">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />{f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Curriculum header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0 bg-slate-50">
            <span className="text-[12.5px] font-bold text-slate-800">Course Content</span>
            <span className="text-[11px] font-medium text-slate-400 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full">{totalL} lessons</span>
          </div>

          {/* Curriculum list */}
          <div className="flex-1 overflow-y-auto">
            {chapterGroups.length === 0 && (
              <p className="px-5 py-8 text-[12px] text-slate-400 text-center">Curriculum coming soon…</p>
            )}
            {chapterGroups.map((ch, ci) => {
              const open = expanded === ch.id;
              const chLessonsDone = ch.lessons.filter((l) => completedSet.has(l.id)).length;
              const chDone = ch.lessons.length > 0 && chLessonsDone === ch.lessons.length;
              return (
                <div key={ch.id} className="border-b border-slate-100 last:border-0">
                  <button onClick={() => setExpanded(open ? -1 : ch.id)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left">
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-extrabold shrink-0",
                      chDone
                        ? "bg-emerald-100 text-emerald-700"
                        : open
                          ? "bg-blue-100 text-blue-700"
                          : "bg-slate-100 text-slate-500",
                    )}>
                      {chDone ? <CheckCheck className="h-3.5 w-3.5" /> : ci + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-semibold text-slate-800 truncate leading-snug">{ch.title}</p>
                      <p className="text-[10.5px] text-slate-400 mt-0.5">
                        {ch.lessons.length} lessons · {ch.dur}
                        {chLessonsDone > 0 && ` · ${chLessonsDone}/${ch.lessons.length} done`}
                      </p>
                    </div>
                    {open
                      ? <ChevronUp className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                      : <ChevronDown className="h-3.5 w-3.5 text-slate-300 shrink-0" />}
                  </button>

                  {open && (
                    <div className="bg-slate-50/60">
                      {ch.lessons.map((l) => {
                        const idx = dbLessons.findIndex((dl) => dl.id === l.id);
                        const isDone = completedSet.has(l.id);
                        const isActive = cur?.id === l.id;
                        const locked = lessonLocked(l);
                        const LessonIcon = l.type === "article" ? FileText : l.type === "quiz" ? FileQuestion : PlayCircle;
                        return (
                          <button key={l.id} disabled={locked}
                            onClick={() => { setActiveIdx(idx); setTab("overview"); }}
                            className={cn(
                              "w-full flex items-center gap-3 pl-[52px] pr-4 py-2.5 text-left transition-all",
                              isActive
                                ? "bg-blue-600 text-white"
                                : "hover:bg-white/80",
                              locked && "opacity-40 cursor-not-allowed",
                            )}>
                            <div className="shrink-0">
                              {locked
                                ? <Lock className="h-3 w-3 text-slate-400" />
                                : isDone
                                  ? <CheckCircle2 className={cn("h-3.5 w-3.5", isActive ? "text-white/80" : "text-emerald-500")} />
                                  : <LessonIcon className={cn("h-3.5 w-3.5", isActive ? "text-white/80" : "text-slate-400")} />}
                            </div>
                            <span className={cn(
                              "flex-1 text-[12px] leading-snug truncate",
                              isActive ? "text-white font-semibold"
                                : isDone ? "text-slate-400" : "text-slate-700",
                            )}>
                              {l.title}
                            </span>
                            {l.isFree && !isEnrolled && (
                              <span className="text-[9.5px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full shrink-0">FREE</span>
                            )}
                            {l.duration && (
                              <span className={cn("text-[10.5px] shrink-0 tabular-nums", isActive ? "text-white/60" : "text-slate-400")}>
                                {l.duration}m
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Bookmark button (extracted to avoid hooks-in-loop) ─── */
function BookmarkButton({ courseId, lessonId }: { courseId: number; lessonId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: bookmarks } = useListBookmarks(courseId, { query: { queryKey: getListBookmarksQueryKey(courseId) } });
  const { mutateAsync: toggleBookmark, isPending: bookmarking } = useToggleBookmark();
  const isBookmarked = (bookmarks ?? []).some((b) => b.lessonId === lessonId);

  const onClick = async () => {
    try {
      await toggleBookmark({ lessonId });
      await qc.invalidateQueries({ queryKey: getListBookmarksQueryKey(courseId) });
    } catch { toast({ title: "Could not update bookmark", variant: "destructive" }); }
  };

  return (
    <button onClick={onClick} disabled={bookmarking}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold transition-colors border",
        isBookmarked
          ? "bg-amber-50 border-amber-200 text-amber-700"
          : "border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300",
      )}>
      <Bookmark className={cn("h-3.5 w-3.5", isBookmarked && "fill-amber-500 text-amber-500")} />
      {isBookmarked ? "Saved" : "Save"}
    </button>
  );
}

/* ════════════════════ Gate Banner ════════════════════ */
function LessonGateBanner({ gate, onGoToQuiz }: { gate: LessonGate; onGoToQuiz: () => void }) {
  if (gate.status === "approved") {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
        <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
        <p className="text-[12.5px] font-semibold text-emerald-800">Gate approved — next lesson is unlocked!</p>
      </div>
    );
  }
  if (gate.status === "pending_review") {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-200">
        <ClipboardCheck className="h-5 w-5 text-blue-600 shrink-0" />
        <div className="flex-1">
          <p className="text-[12.5px] font-semibold text-blue-800">Quiz submitted — awaiting instructor review</p>
          <p className="text-[11.5px] text-blue-600">Score: {gate.score}%. You'll be notified once reviewed.</p>
        </div>
      </div>
    );
  }
  if (gate.status === "rejected") {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200">
        <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
        <div className="flex-1">
          <p className="text-[12.5px] font-semibold text-red-800">Quiz attempt rejected</p>
          {gate.reviewNote && <p className="text-[11.5px] text-red-600 mt-0.5">Instructor feedback: {gate.reviewNote}</p>}
          <p className="text-[11.5px] text-red-600 mt-0.5">A new quiz has been assigned — pass it to continue.</p>
        </div>
        <button onClick={onGoToQuiz}
          className="shrink-0 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[12px] font-semibold transition-colors">
          Take Quiz
        </button>
      </div>
    );
  }
  // awaiting_quiz
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
      <FileQuestion className="h-5 w-5 text-amber-600 shrink-0" />
      <div className="flex-1">
        <p className="text-[12.5px] font-semibold text-amber-800">Pass the lesson quiz to unlock the next lesson</p>
        <p className="text-[11.5px] text-amber-600">Your answer will be reviewed by the instructor before you proceed.</p>
      </div>
      <button onClick={onGoToQuiz}
        className="shrink-0 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[12px] font-semibold transition-colors">
        Take Quiz
      </button>
    </div>
  );
}

/* ════════════════════ Overview Tab ════════════════════ */
function OverviewTab({
  cur, chIdx, isEnrolled, curDone, doEnroll, enrolling, gate, onGoToQuiz,
}: {
  cur: DbLesson | undefined; chIdx: number;
  isEnrolled: boolean; curDone: boolean;
  doEnroll: () => void; enrolling: boolean;
  gate?: LessonGate; onGoToQuiz: () => void;
}) {
  if (!cur) return (
    <div className="text-center py-12">
      <MonitorPlay className="h-10 w-10 text-slate-200 mx-auto mb-3" />
      <p className="text-[13px] text-slate-400">Select a lesson from the sidebar to begin.</p>
    </div>
  );

  const gateBlocksNext = gate && gate.status !== "approved";

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Lesson metadata pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { Icon: Clock, label: cur.duration ? `${cur.duration} min` : "—", color: "text-blue-600 bg-blue-50 border-blue-100" },
          { Icon: Zap, label: "+50 XP", color: "text-amber-600 bg-amber-50 border-amber-100" },
          { Icon: BarChart2, label: `Section ${chIdx + 1}`, color: "text-slate-600 bg-slate-50 border-slate-200" },
          ...(cur.type && cur.type !== "video" ? [{ Icon: cur.type === "article" ? FileText : FileQuestion, label: cur.type === "article" ? "Reading" : cur.type.charAt(0).toUpperCase() + cur.type.slice(1), color: "text-violet-600 bg-violet-50 border-violet-100" }] : []),
        ].map(({ Icon, label, color }) => (
          <div key={label} className={cn("flex items-center gap-1.5 px-3 py-1.5 border rounded-full text-[12px] font-medium", color)}>
            <Icon className="h-3.5 w-3.5" />
            {label}
          </div>
        ))}
      </div>

      {/* About this lesson */}
      <div>
        <h3 className="text-[13px] font-bold text-slate-500 uppercase tracking-wider mb-3">About this lesson</h3>
        {cur.description ? (
          <p className="text-[14px] text-slate-700 leading-relaxed">{cur.description}</p>
        ) : (
          <p className="text-[14px] text-slate-400 leading-relaxed italic">
            Select the Overview tab after starting the lesson to see details here.
          </p>
        )}
      </div>

      {/* Lesson content (markdown/article) */}
      {cur.content && (
        <div>
          <h3 className="text-[13px] font-bold text-slate-500 uppercase tracking-wider mb-3">Lesson Content</h3>
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="prose prose-sm prose-slate max-w-none text-[13.5px] leading-relaxed whitespace-pre-wrap">
              {cur.content}
            </div>
          </div>
        </div>
      )}

      {/* Enroll CTA for non-enrolled visitors */}
      {!isEnrolled && (
        <div className="flex items-start gap-4 p-5 rounded-2xl bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 border border-blue-200/60">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-md shadow-blue-600/20">
            <Lock className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-bold text-slate-900 mb-0.5">Unlock all {totalL} lessons</p>
            <p className="text-[12.5px] text-slate-500">Free preview lessons are available now. Enroll to access quizzes, tasks, notes, and your certificate.</p>
          </div>
          <button onClick={doEnroll} disabled={enrolling}
            className="shrink-0 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[13px] font-bold transition-colors disabled:opacity-60 shadow-sm whitespace-nowrap">
            {enrolling ? "Enrolling…" : "Enroll Free"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ════════════════════ Quiz Tab ════════════════════ */
function QuizTab({
  courseId, isEnrolled, onGraded, gate,
}: {
  courseId: number; isEnrolled: boolean; onGraded: () => void; gate?: LessonGate;
}) {
  const { data: quizzes, isLoading } = useListQuizzes(courseId, {
    query: { enabled: courseId > 0, queryKey: getListQuizzesQueryKey(courseId) },
  });
  const [activeQuizId, setActiveQuizId] = useState<number | null>(null);

  if (!isEnrolled) return <GateBlock label="Enroll to access quizzes." />;
  if (isLoading) return <Skeleton className="h-40 rounded-xl" />;
  if (!quizzes || quizzes.length === 0) return <Empty Icon={FileQuestion} label="No quizzes for this course yet." />;

  if (activeQuizId !== null) {
    return (
      <QuizRunner
        quizId={activeQuizId}
        isGateQuiz={gate?.requiredQuizId === activeQuizId}
        onBack={() => setActiveQuizId(null)}
        onGraded={onGraded}
      />
    );
  }

  // Separate gate quiz from regular quizzes
  const gateQuiz = gate ? quizzes.find((q) => q.id === gate.requiredQuizId) : null;
  const regularQuizzes = gate ? quizzes.filter((q) => q.id !== gate.requiredQuizId) : quizzes;
  const isActiveGate = gate && (gate.status === "awaiting_quiz" || gate.status === "rejected");
  const isPendingReview = gate?.status === "pending_review";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-bold text-slate-800">Practice Quizzes</h3>
          <p className="text-[12px] text-slate-400">Test your understanding and earn XP</p>
        </div>
        <span className="text-[12px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
          {quizzes.filter((q) => q.passed).length}/{quizzes.length} passed
        </span>
      </div>

      {/* Gate quiz — pinned at top when active */}
      {gateQuiz && (
        <div className={cn("rounded-xl border-2 p-4 space-y-3",
          isActiveGate ? "border-amber-400 bg-amber-50/60" :
          isPendingReview ? "border-blue-300 bg-blue-50/50" :
          gate?.status === "approved" ? "border-emerald-300 bg-emerald-50/50" :
          "border-slate-200 bg-white")}>
          {/* Gate status header */}
          {isActiveGate && (
            <div className="flex items-center gap-2 text-[11.5px] font-semibold text-amber-700">
              <FileQuestion className="h-3.5 w-3.5" />
              {gate?.status === "rejected" ? "Retake Required — Instructor assigned a new quiz" : "Lesson Gate — Pass to unlock the next lesson"}
            </div>
          )}
          {isPendingReview && (
            <div className="flex items-center gap-2 text-[11.5px] font-semibold text-blue-700">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Awaiting instructor review · Score: {gate?.score}%
            </div>
          )}
          {gate?.status === "approved" && (
            <div className="flex items-center gap-2 text-[11.5px] font-semibold text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Gate approved ✓
            </div>
          )}

          {/* Quiz card */}
          <div className="flex items-center gap-3">
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
              isActiveGate ? "bg-amber-100" : isPendingReview ? "bg-blue-100" : "bg-emerald-100")}>
              <FileQuestion className={cn("h-4 w-4",
                isActiveGate ? "text-amber-600" : isPendingReview ? "text-blue-600" : "text-emerald-600")} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[13px] text-slate-800 truncate">{gateQuiz.title}</p>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                <span>{gateQuiz.questionCount ?? 0} questions</span>
                <span>·</span>
                <span>Pass {gateQuiz.passingScore}%</span>
                {gateQuiz.bestScore != null && <span>· Best: {gateQuiz.bestScore}%</span>}
              </div>
            </div>
            {!isPendingReview && (
              <button onClick={() => setActiveQuizId(gateQuiz.id)}
                className={cn("px-4 py-2 rounded-lg text-[12.5px] font-bold transition-colors shrink-0",
                  isActiveGate ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-blue-600 hover:bg-blue-700 text-white")}>
                {gateQuiz.passed && gate?.status !== "rejected" ? "Retake" : "Start"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Regular quizzes */}
      {regularQuizzes.map((q) => (
        <div key={q.id} className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors">
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
            q.passed ? "bg-emerald-100" : "bg-slate-100")}>
            <FileQuestion className={cn("h-4 w-4", q.passed ? "text-emerald-600" : "text-slate-400")} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-[13px] text-slate-800">{q.title}</p>
              {q.passed && <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold">Passed</span>}
            </div>
            <p className="text-[11.5px] text-slate-400 mt-0.5">
              {q.questionCount ?? 0} questions · Pass {q.passingScore}%
              {q.bestScore != null && ` · Best: ${q.bestScore}%`}
            </p>
          </div>
          <button onClick={() => setActiveQuizId(q.id)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[12.5px] font-bold transition-colors shrink-0">
            {q.passed ? "Retake" : "Start"}
          </button>
        </div>
      ))}
    </div>
  );
}

function QuizRunner({
  quizId, isGateQuiz, onBack, onGraded,
}: {
  quizId: number; isGateQuiz: boolean; onBack: () => void; onGraded: () => void;
}) {
  const { toast } = useToast();
  const { data: quiz, isLoading } = useGetQuiz(quizId);
  const { mutateAsync: submit, isPending: submitting } = useSubmitQuizAttempt();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<QuizAttemptResult | null>(null);

  if (isLoading || !quiz) return <Skeleton className="h-60 rounded-xl" />;
  const questions = quiz.questions ?? [];

  const onSubmit = async () => {
    const ordered = questions.map((_, i) => answers[i] ?? -1);
    try {
      const res = await submit({ quizId, data: { answers: ordered } });
      setResult(res);
      if (res.passed && res.xpAwarded > 0) toast({ title: "Quiz passed! 🎉", description: `+${res.xpAwarded} XP` });
      onGraded();
    } catch { toast({ title: "Could not submit quiz", variant: "destructive" }); }
  };

  if (result) {
    const resultMap = new Map((result.results ?? []).map((r) => [r.questionId, r]));
    const gateStatus = (result as unknown as Record<string, unknown>).gateStatus as string | undefined;
    return (
      <div className="text-center py-4">
        <div className={cn("w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3",
          result.passed ? "bg-emerald-100" : "bg-amber-100")}>
          {result.passed ? <Trophy className="h-8 w-8 text-emerald-600" /> : <FileQuestion className="h-8 w-8 text-amber-600" />}
        </div>
        <h3 className="text-[20px] font-extrabold text-slate-800 mb-0.5">{result.passed ? "Passed!" : "Keep Practicing"}</h3>
        <p className="text-[12.5px] text-slate-400 mb-1">You scored <strong className="text-slate-700">{result.correctCount}/{result.total}</strong></p>
        <div className={cn("text-[36px] font-extrabold mb-3", result.passed ? "text-emerald-600" : "text-amber-500")}>{result.score}%</div>
        {result.xpAwarded > 0 && (
          <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[11.5px] font-semibold mb-3">+{result.xpAwarded} XP Earned</span>
        )}

        {/* Gate-specific status message */}
        {isGateQuiz && result.passed && gateStatus === "pending_review" && (
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50 border border-blue-200 mb-3 text-left">
            <ClipboardCheck className="h-5 w-5 text-blue-600 shrink-0" />
            <div>
              <p className="text-[12.5px] font-semibold text-blue-800">Submitted for instructor review</p>
              <p className="text-[11.5px] text-blue-600">Your result has been sent to the instructor. Once approved, the next lesson will unlock.</p>
            </div>
          </div>
        )}

        <div className="space-y-1.5 text-left mt-3">
          {questions.map((q) => {
            const r = resultMap.get(q.id);
            const correct = r?.correct ?? false;
            return (
              <div key={q.id} className={cn("p-2.5 rounded-lg text-[12px] border",
                correct ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200")}>
                <div className="flex items-center gap-2">
                  {correct
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    : <div className="h-3.5 w-3.5 rounded-full bg-red-400 text-white text-[9px] font-bold flex items-center justify-center shrink-0">✗</div>}
                  <span className="flex-1 text-slate-600">{q.question}</span>
                  {r != null && <span className="text-slate-400 shrink-0 text-[11px]">{q.options[r.correctIndex]}</span>}
                </div>
                {!correct && r?.explanation && <p className="text-[11px] text-slate-500 mt-1.5 pl-5.5">{r.explanation}</p>}
              </div>
            );
          })}
        </div>
        <div className="flex justify-center gap-2 mt-5">
          <button onClick={onBack} className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-semibold text-[13px] transition-colors">Back to Quizzes</button>
          {(!isGateQuiz || !result.passed) && (
            <button onClick={() => { setResult(null); setAnswers({}); }} className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-[13px] transition-colors">Retake</button>
          )}
        </div>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).length;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className="text-[12px] text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-1"><ArrowLeft className="h-3 w-3" /> Quizzes</button>
          <h3 className="text-[15px] font-bold text-slate-800">{quiz.title}</h3>
          {isGateQuiz && <p className="text-[11px] text-amber-600 mt-0.5 flex items-center gap-1"><FileQuestion className="h-3 w-3" /> Lesson Gate Quiz</p>}
        </div>
        <span className="text-[11.5px] font-medium text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">{answeredCount}/{questions.length} answered</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-1.5">
        <div className="bg-blue-600 h-1.5 rounded-full transition-all" style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }} />
      </div>
      {questions.map((q, qi) => (
        <div key={q.id} className="p-4 rounded-xl border border-slate-200">
          <p className="text-[13px] font-semibold text-slate-700 mb-3"><span className="text-blue-600 mr-1.5">Q{qi + 1}.</span>{q.question}</p>
          <div className="space-y-1.5">
            {q.options.map((opt, oi) => (
              <button key={oi} onClick={() => setAnswers((p) => ({ ...p, [qi]: oi }))}
                className={cn("w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-[12.5px] text-left transition-all",
                  answers[qi] === oi ? "border-blue-600 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 hover:border-blue-300 hover:bg-slate-50 text-slate-600")}>
                <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                  answers[qi] === oi ? "border-blue-600 bg-blue-600" : "border-slate-300")}>
                  {answers[qi] === oi && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        <button onClick={onBack} className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-lg text-[12.5px] font-medium transition-colors">Cancel</button>
        <button onClick={onSubmit} disabled={answeredCount < questions.length || submitting}
          className="px-8 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg text-[13px] font-bold transition-colors flex items-center gap-2">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Submit Quiz
        </button>
      </div>
    </div>
  );
}

/* ════════════════════ Tasks Tab ════════════════════ */
function TasksTab({ courseId, isEnrolled, onDone }: { courseId: number; isEnrolled: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: tasks, isLoading } = useListTasks(courseId, { query: { enabled: courseId > 0, queryKey: getListTasksQueryKey(courseId) } });
  const { mutateAsync: complete, isPending } = useCompleteTask();
  const [submissions, setSubmissions] = useState<Record<number, string>>({});
  const [openId, setOpenId] = useState<number | null>(null);

  if (!isEnrolled) return <GateBlock label="Enroll to complete tasks and earn XP." />;
  if (isLoading) return <Skeleton className="h-40 rounded-xl" />;
  if (!tasks || tasks.length === 0) return <Empty Icon={ListTodo} label="No tasks for this course yet." />;

  const doneCount = tasks.filter((t) => t.completed).length;

  const onComplete = async (taskId: number) => {
    try {
      const res = await complete({ taskId, data: { submission: submissions[taskId] ?? undefined } });
      await qc.invalidateQueries({ queryKey: getListTasksQueryKey(courseId) });
      onDone();
      if ((res.xpAwarded ?? 0) > 0) toast({ title: "Task complete", description: `+${res.xpAwarded} XP` });
      setOpenId(null);
    } catch { toast({ title: "Could not submit task", variant: "destructive" }); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-bold text-slate-800">Practical Tasks</h3>
          <p className="text-[12px] text-slate-400">Complete real-world exercises to earn XP</p>
        </div>
        <span className="text-[12px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">{doneCount}/{tasks.length} done</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-1.5">
        <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${(doneCount / tasks.length) * 100}%` }} />
      </div>
      {tasks.map((task) => {
        const isDone = !!task.completed;
        const open = openId === task.id;
        return (
          <div key={task.id} className={cn("p-4 rounded-xl border transition-all", isDone ? "bg-emerald-50/60 border-emerald-200" : "bg-white border-slate-200")}>
            <div className="flex items-start gap-3">
              <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
                isDone ? "bg-emerald-500 border-emerald-500" : "border-slate-300")}>
                {isDone && <CheckCircle2 className="h-3 w-3 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                  <p className={cn("text-[13px] font-semibold", isDone && "line-through text-slate-400")}>{task.title}</p>
                  <span className="text-[10.5px] px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700 font-semibold">+{task.xpReward} XP</span>
                </div>
                {task.description && <p className="text-[12px] text-slate-400 leading-relaxed">{task.description}</p>}
                {isDone && task.submission && <p className="text-[11.5px] text-slate-500 mt-2 p-2 rounded-lg bg-white border border-slate-100">{task.submission}</p>}
                {!isDone && (
                  open ? (
                    <div className="mt-2 space-y-2">
                      <textarea value={submissions[task.id] ?? ""} onChange={(e) => setSubmissions((p) => ({ ...p, [task.id]: e.target.value }))}
                        placeholder="Describe your work or paste your answer (optional)…" rows={2}
                        className="w-full p-2.5 text-[12px] rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none resize-none" />
                      <div className="flex gap-2">
                        <button onClick={() => onComplete(task.id)} disabled={isPending}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[12px] font-bold transition-colors disabled:opacity-60 flex items-center gap-1.5">
                          {isPending && <Loader2 className="h-3 w-3 animate-spin" />} Submit & Complete
                        </button>
                        <button onClick={() => setOpenId(null)} className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-lg text-[12px] font-medium transition-colors">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setOpenId(task.id)} className="mt-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[12px] font-semibold transition-colors">Mark Complete</button>
                  )
                )}
              </div>
            </div>
          </div>
        );
      })}
      {doneCount === tasks.length && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
          <Trophy className="h-7 w-7 text-emerald-600 mx-auto mb-1" />
          <p className="text-[13px] font-bold text-emerald-800">All tasks complete! 🎉</p>
          <p className="text-[11.5px] text-emerald-600">+{tasks.reduce((a, t) => a + t.xpReward, 0)} XP available from tasks</p>
        </div>
      )}
    </div>
  );
}

/* ════════════════════ Notes Tab ════════════════════ */
function NotesTab({ lesson, isEnrolled }: { lesson: DbLesson | undefined; isEnrolled: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const lessonId = lesson?.id ?? -1;
  const { data: notes, isLoading } = useListNotes(lessonId, { query: { enabled: isEnrolled && lessonId > 0, queryKey: getListNotesQueryKey(lessonId) } });
  const { mutateAsync: createNote, isPending: creating } = useCreateNote();
  const { mutateAsync: deleteNote } = useDeleteNote();
  const [content, setContent] = useState("");

  if (!isEnrolled) return <GateBlock label="Enroll to take lesson notes." />;
  if (!lesson) return <Empty Icon={StickyNote} label="Select a lesson to take notes." />;

  const invalidate = () => qc.invalidateQueries({ queryKey: getListNotesQueryKey(lessonId) });

  const onAdd = async () => {
    if (!content.trim()) return;
    try {
      await createNote({ lessonId, data: { content: content.trim() } });
      setContent("");
      await invalidate();
    } catch { toast({ title: "Could not save note", variant: "destructive" }); }
  };
  const onDelete = async (noteId: number) => {
    try { await deleteNote({ noteId }); await invalidate(); }
    catch { toast({ title: "Could not delete note", variant: "destructive" }); }
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-[15px] font-bold text-slate-800">My Notes</h3>
        <p className="text-[12px] text-slate-400">For: {lesson.title}</p>
      </div>
      <div className="flex gap-2">
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={2}
          placeholder="Write a note for this lesson…"
          className="flex-1 p-2.5 text-[12.5px] rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none resize-none" />
        <button onClick={onAdd} disabled={creating || !content.trim()}
          className="px-4 self-start py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[12.5px] font-semibold transition-colors disabled:opacity-50">
          {creating ? "…" : "Add"}
        </button>
      </div>
      {isLoading ? <Skeleton className="h-16 rounded-lg" /> : (
        (notes ?? []).length === 0
          ? <p className="text-[12px] text-slate-400 text-center py-6">No notes yet for this lesson.</p>
          : <div className="space-y-2">
              {(notes ?? []).map((n) => (
                <div key={n.id} className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-100 group">
                  <StickyNote className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="flex-1 text-[12.5px] text-slate-600 whitespace-pre-wrap">{n.content}</p>
                  <button onClick={() => onDelete(n.id)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
      )}
    </div>
  );
}

/* ════════════════════ Reviews Tab ════════════════════ */
function ReviewsTab({ courseId, isEnrolled }: { courseId: number; isEnrolled: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: summary, isLoading } = useListReviews(courseId, { query: { enabled: courseId > 0, queryKey: getListReviewsQueryKey(courseId) } });
  const { mutateAsync: upsert, isPending } = useUpsertReview();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (summary?.myReview) { setRating(summary.myReview.rating); setComment(summary.myReview.comment ?? ""); }
  }, [summary?.myReview]);

  if (isLoading) return <Skeleton className="h-40 rounded-xl" />;

  const onSubmit = async () => {
    if (rating < 1) { toast({ title: "Pick a star rating", variant: "destructive" }); return; }
    try {
      await upsert({ courseId, data: { rating, comment: comment.trim() || undefined } });
      await qc.invalidateQueries({ queryKey: getListReviewsQueryKey(courseId) });
      toast({ title: "Review saved", description: "Thanks for your feedback!" });
    } catch { toast({ title: "Could not save review", description: "You must be enrolled to review.", variant: "destructive" }); }
  };

  const avg = summary?.average ?? 0;
  const count = summary?.count ?? 0;
  const dist = summary?.distribution ?? [0, 0, 0, 0, 0];

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-[160px,1fr] gap-4">
        <div className="text-center p-4 rounded-xl bg-slate-50 border border-slate-100">
          <div className="text-[36px] font-extrabold text-slate-800 leading-none">{avg.toFixed(1)}</div>
          <div className="flex justify-center gap-0.5 my-1.5">
            {[1, 2, 3, 4, 5].map((s) => <Star key={s} className={cn("h-3.5 w-3.5", s <= Math.round(avg) ? "fill-amber-400 text-amber-400" : "text-slate-300")} />)}
          </div>
          <p className="text-[11.5px] text-slate-400">{count} review{count === 1 ? "" : "s"}</p>
        </div>
        <div className="space-y-1 self-center">
          {[5, 4, 3, 2, 1].map((star) => {
            const n = dist[star - 1] ?? 0;
            const pctBar = count ? (n / count) * 100 : 0;
            return (
              <div key={star} className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="w-3">{star}</span>
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <div className="flex-1 bg-slate-100 rounded-full h-1.5"><div className="bg-amber-400 h-1.5 rounded-full" style={{ width: `${pctBar}%` }} /></div>
                <span className="w-6 text-right">{n}</span>
              </div>
            );
          })}
        </div>
      </div>

      {isEnrolled && (
        <div className="p-4 rounded-xl border border-slate-200">
          <p className="text-[13px] font-semibold text-slate-700 mb-2">{summary?.myReview ? "Update your review" : "Write a review"}</p>
          <div className="flex gap-1 mb-2.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} onClick={() => setRating(s)}>
                <Star className={cn("h-6 w-6 transition-colors", s <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300 hover:text-amber-300")} />
              </button>
            ))}
          </div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
            placeholder="Share your experience (optional)…"
            className="w-full p-2.5 text-[12.5px] rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none resize-none" />
          <button onClick={onSubmit} disabled={isPending}
            className="mt-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[12.5px] font-bold transition-colors disabled:opacity-60">
            {isPending ? "Saving…" : summary?.myReview ? "Update Review" : "Submit Review"}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {(summary?.reviews ?? []).length === 0
          ? <p className="text-[12px] text-slate-400 text-center py-4">No reviews yet. Be the first!</p>
          : (summary?.reviews ?? []).map((r) => (
            <div key={r.id} className="flex gap-3 p-3.5 rounded-xl border border-slate-100">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                {(r.userName ?? "U").charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[12.5px] font-semibold text-slate-700">{r.userName ?? "Anonymous"}</span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => <Star key={s} className={cn("h-2.5 w-2.5", s <= r.rating ? "fill-amber-400 text-amber-400" : "text-slate-300")} />)}
                  </div>
                </div>
                {r.comment && <p className="text-[12.5px] text-slate-600 leading-snug">{r.comment}</p>}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

/* ─── small shared bits ─── */
function GateBlock({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
      <Lock className="h-5 w-5 text-amber-600 shrink-0" />
      <p className="text-[13px] font-medium text-amber-800">{label}</p>
    </div>
  );
}
function Empty({ Icon, label }: { Icon: typeof FileQuestion; label: string }) {
  return (
    <div className="text-center py-10">
      <Icon className="h-8 w-8 text-slate-300 mx-auto mb-2" />
      <p className="text-[12.5px] text-slate-400">{label}</p>
    </div>
  );
}
