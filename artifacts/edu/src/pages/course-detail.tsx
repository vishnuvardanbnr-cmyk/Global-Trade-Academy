import { useState } from "react";
import { useRoute, Link } from "wouter";
import {
  useGetCourse, useListLessons, useListEnrollments, useCreateEnrollment,
  getListEnrollmentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  BookOpen, Clock, Users, Star, Play, CheckCircle2, Lock, ChevronRight,
  Award, Target, ArrowLeft, ChevronDown, ChevronUp, FileQuestion, ListTodo,
  MessageSquare, Trophy, Zap, BarChart2, PlayCircle, CheckCheck,
} from "lucide-react";

/* ─── Chapter builder (from DB lessons) ─────────────────────────── */
const CHAPTER_TITLES: Record<string, string[]> = {
  forex:   ["Forex Foundations", "Technical Analysis", "Trade Execution", "Risk & Psychology", "Advanced Mastery"],
  crypto:  ["Blockchain & Crypto Basics", "Trading Techniques", "DeFi & On-Chain", "Portfolio Strategy"],
  options: ["Options Fundamentals", "Core Strategies", "Advanced Greeks", "Income Mastery"],
  futures: ["Futures Basics", "Contracts & Mechanics", "Advanced Strategies", "Risk Management"],
  stocks:  ["Market Foundations", "Security Analysis", "Portfolio Building", "Advanced Techniques"],
};
const CHAPTER_SIZE = 4;

type DbLesson = { id: number; title: string; duration: number | null; order: number; isFree: boolean; type: string };

function buildChapters(dbLessons: DbLesson[], category: string) {
  const titles = CHAPTER_TITLES[(category ?? "").toLowerCase()] ?? [];
  const groups: { id: number; title: string; dur: string; lessons: DbLesson[] }[] = [];
  for (let i = 0; i < dbLessons.length; i += CHAPTER_SIZE) {
    const chunk = dbLessons.slice(i, i + CHAPTER_SIZE);
    const totalMin = chunk.reduce((s, l) => s + (l.duration ?? 0), 0);
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    groups.push({
      id: i / CHAPTER_SIZE + 1,
      title: titles[i / CHAPTER_SIZE] ?? `Chapter ${i / CHAPTER_SIZE + 1}`,
      dur: h > 0 ? `${h}h ${m}m` : `${m}m`,
      lessons: chunk,
    });
  }
  return groups;
}

/* ─── Quiz ─────────────────────────────────────────────────────── */
const QUIZ: { q: string; opts: string[]; ans: number }[] = [
  { q: "Which candlestick pattern signals a strong bullish reversal after a downtrend?",
    opts: ["Shooting Star","Hammer","Doji","Hanging Man"], ans: 1 },
  { q: "RSI above 70 typically indicates:",
    opts: ["Oversold condition","Overbought condition","Neutral momentum","Strong downtrend"], ans: 1 },
  { q: "A 'head and shoulders' pattern signals:",
    opts: ["Trend continuation","Trend reversal","Consolidation","Breakout"], ans: 1 },
  { q: "Recommended risk-reward ratio for professional traders:",
    opts: ["1:1","1:2 or better","2:1","3:1 only"], ans: 1 },
  { q: "Support levels represent zones where:",
    opts: ["Price always reverses","Buying pressure tends to exceed selling pressure","Random price points","MA intersections only"], ans: 1 },
];

/* ─── Tasks ────────────────────────────────────────────────────── */
const TASKS = [
  { id: 1, t: "Identify 3 Support & Resistance Levels", d: "On a 4H BTC/USD chart, mark at least 3 clear S/R levels and explain your reasoning.", xp: 50 },
  { id: 2, t: "Document a Complete Trade Setup",        d: "Find a valid setup using the techniques learned. Include entry, SL, TP, and R:R ratio.", xp: 75 },
  { id: 3, t: "Analyze a Historical Price Action",      d: "Pick any major market move from the past 3 months and write a 200-word technical analysis.", xp: 60 },
  { id: 4, t: "Create Your Trading Plan",               d: "One-page plan covering: trading hours, instruments, strategy rules, risk per trade, max daily loss.", xp: 100 },
];

type QuizState = "idle" | "taking" | "done";

export default function CourseDetail() {
  const [, params] = useRoute<{ id: string }>("/courses/:id");
  const courseId = params?.id ? parseInt(params.id) : 0;

  const { data: course, isLoading } = useGetCourse(courseId > 0 ? courseId : -1);
  const { data: lessons } = useListLessons(courseId > 0 ? courseId : -1);
  const { data: enrollments } = useListEnrollments();
  const { mutateAsync: enroll, isPending: enrolling } = useCreateEnrollment();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [tab,          setTab]          = useState<"overview"|"quiz"|"tasks"|"discuss">("overview");
  const [activeIdx,    setActiveIdx]    = useState(0);
  const [expanded,     setExpanded]     = useState<number>(1);
  const [done,         setDone]         = useState<Set<string>>(new Set());
  const [quizState,    setQuizState]    = useState<QuizState>("idle");
  const [answers,      setAnswers]      = useState<Record<number,number>>({});
  const [score,        setScore]        = useState(0);
  const [doneTasks,    setDoneTasks]    = useState<Set<number>>(new Set());

  const isEnrolled    = enrollments?.some(e => e.courseId === courseId) ?? false;
  const dbLessons     = (lessons ?? []) as DbLesson[];
  const chapterGroups = buildChapters(dbLessons, course?.category ?? "forex");
  const totalL        = dbLessons.length;
  const pct           = totalL ? Math.round((done.size / totalL) * 100) : 0;
  const cur           = dbLessons[activeIdx];
  const curChapter    = chapterGroups.find(ch => ch.lessons.some(l => l.id === cur?.id));
  const chIdx         = curChapter ? chapterGroups.indexOf(curChapter) : 0;

  const doEnroll = async () => {
    try {
      await enroll({ data: { courseId } });
      await qc.invalidateQueries({ queryKey: getListEnrollmentsQueryKey() });
      toast({ title: "Enrolled!", description: "Start your first lesson below." });
    } catch { toast({ title: "Enrollment failed", variant: "destructive" }); }
  };

  const markDone = () => {
    setDone(p => new Set([...p, String(activeIdx)]));
    if (activeIdx < totalL - 1) setActiveIdx(p => p + 1);
  };

  const submitQuiz = () => {
    const s = QUIZ.reduce((a,q,i) => a + (answers[i]===q.ans ? 1 : 0), 0);
    setScore(s); setQuizState("done");
  };

  /* display fallback if no DB course yet */
  const C = course ?? {
    title: "Complete Forex & Technical Analysis Masterclass",
    description: "From price action foundations to advanced multi-timeframe setups — a professional curriculum for serious traders.",
    instructorName: "Alex Morgan",
    category: "Forex",
    level: "Intermediate",
    enrollmentCount: 4820,
    duration: 24,
    price: null,
  };

  if (isLoading) return (
    <div className="space-y-3">
      <Skeleton className="h-48 rounded-2xl" />
      <div className="grid grid-cols-[300px,1fr] gap-4">
        <Skeleton className="h-72 rounded-xl" /><Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );

  return (
    <div className="space-y-4 pb-6">
      {/* breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12.5px] text-slate-400">
        <Link href="/courses" className="flex items-center gap-1 hover:text-blue-600 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Academy
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-slate-700 font-medium truncate max-w-xs">{C.title}</span>
      </div>

      {/* ─── Course Banner ─── */}
      <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white border border-slate-800">
        <div className="grid lg:grid-cols-[1fr,300px]">
          {/* left info */}
          <div className="p-6 lg:p-8">
            <div className="flex flex-wrap gap-1.5 mb-3">
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[11px] font-semibold">{(C as any).category}</span>
              <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/70 border border-white/20 text-[11px] font-semibold">{(C as any).level}</span>
            </div>
            <h1 className="text-xl lg:text-2xl font-extrabold leading-tight mb-2.5">{C.title}</h1>
            <p className="text-[13px] text-white/60 mb-4 max-w-lg leading-relaxed">{C.description}</p>

            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-white/70 mb-5">
              <div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 opacity-70" />{((C as any).enrollmentCount ?? 0).toLocaleString()} students</div>
              <div className="flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5 opacity-70" />{totalL} lessons</div>
              <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 opacity-70" />{(C as any).duration ?? 24}h total</div>
              <div className="flex items-center gap-1.5">
                {[1,2,3,4,5].map(s => <Star key={s} className="h-3 w-3 fill-amber-400 text-amber-400" />)}
                <span>4.9 (382 reviews)</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-[12px] font-bold text-white">
                {(C.instructorName ?? "I").charAt(0)}
              </div>
              <div>
                <p className="text-[13px] font-semibold">{C.instructorName ?? "Instructor"}</p>
                <p className="text-[11px] text-white/50">Senior Market Analyst · 12y experience</p>
              </div>
            </div>
          </div>

          {/* enroll card */}
          <div className="border-t lg:border-t-0 lg:border-l border-white/10 p-6 flex flex-col justify-center bg-white/5">
            {isEnrolled ? (
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-[12px] mb-1.5">
                    <span className="text-white/60">Progress</span>
                    <span className="font-bold text-white">{pct}%</span>
                  </div>
                  <div className="w-full bg-white/15 rounded-full h-1.5">
                    <div className="bg-emerald-400 h-1.5 rounded-full transition-all" style={{ width:`${pct}%` }} />
                  </div>
                  <p className="text-[11px] text-white/50 mt-1">{done.size}/{totalL} lessons done</p>
                </div>
                <button onClick={() => setTab("overview")}
                  className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-semibold text-[13px] transition-colors flex items-center justify-center gap-2">
                  <PlayCircle className="h-4 w-4" /> Continue Learning
                </button>
                {pct === 100 && (
                  <div className="flex items-center gap-1.5 text-amber-300 text-[12px] font-medium justify-center">
                    <Award className="h-4 w-4" /> Claim your certificate
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 text-center">
                <div>
                  <p className="text-[32px] font-extrabold text-white leading-none">
                    {(C as any).price ? `$${(C as any).price}` : "Free"}
                  </p>
                  <p className="text-[11px] text-white/50 mt-0.5">Full lifetime access</p>
                </div>
                <button onClick={doEnroll} disabled={enrolling}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-[13px] transition-colors disabled:opacity-60">
                  {enrolling ? "Enrolling…" : "Enroll Now — Free"}
                </button>
                <ul className="text-[11px] text-white/60 space-y-1.5 text-left">
                  {[`${totalL} interactive lessons`, "5 practice quizzes", "4 real-world tasks", "Certificate of completion", "Lifetime access"].map(f => (
                    <li key={f} className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />{f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Main Layout ─── */}
      <div className="grid xl:grid-cols-[300px,1fr] gap-4 items-start">

        {/* Curriculum sidebar */}
        <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="text-[13px] font-bold text-slate-800">Course Content</h3>
            <span className="text-[11px] text-slate-400">{totalL} lessons</span>
          </div>
          <div className="overflow-y-auto max-h-[560px] divide-y divide-slate-100">
            {chapterGroups.length === 0 && (
              <p className="px-4 py-6 text-[12px] text-slate-400 text-center">Curriculum loading…</p>
            )}
            {chapterGroups.map((ch, ci) => {
              const startIdx = chapterGroups.slice(0, ci).reduce((a, c) => a + c.lessons.length, 0);
              const open = expanded === ch.id;
              const chDone = ch.lessons.every((_, li) => done.has(String(startIdx + li)));
              return (
                <div key={ch.id}>
                  <button onClick={() => setExpanded(open ? -1 : ch.id)}
                    className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-slate-50 transition-colors text-left">
                    <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                      chDone ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500")}>
                      {chDone ? <CheckCheck className="h-3 w-3" /> : ci + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-semibold text-slate-700 truncate">{ch.title}</p>
                      <p className="text-[11px] text-slate-400">{ch.lessons.length} lessons · {ch.dur}</p>
                    </div>
                    {open ? <ChevronUp className="h-3.5 w-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                  </button>

                  {open && (
                    <div className="bg-slate-50/60">
                      {ch.lessons.map((l, li) => {
                        const idx = startIdx + li;
                        const isDone   = done.has(String(idx));
                        const isActive = activeIdx === idx;
                        const locked   = !isEnrolled && !l.isFree && idx > 1;
                        return (
                          <button key={l.id} disabled={locked}
                            onClick={() => { setActiveIdx(idx); setTab("overview"); }}
                            className={cn("w-full flex items-center gap-2.5 px-5 py-2 text-left transition-colors",
                              isActive ? "bg-blue-50 border-l-[3px] border-blue-600" : "border-l-[3px] border-transparent hover:bg-slate-100",
                              locked && "opacity-40 cursor-not-allowed")}>
                            <div className="shrink-0 w-3.5">
                              {locked  ? <Lock className="h-3 w-3 text-slate-400" />
                             : isDone  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                             : <PlayCircle className="h-3.5 w-3.5 text-slate-400" />}
                            </div>
                            <span className={cn("flex-1 text-[12px] truncate",
                              isActive ? "text-blue-700 font-semibold"
                            : isDone  ? "text-slate-400 line-through" : "text-slate-600")}>
                              {l.title}
                            </span>
                            <span className="text-[10.5px] text-slate-400 shrink-0">
                              {l.duration ? `${l.duration}m` : "—"}
                            </span>
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

        {/* Content area */}
        <div className="space-y-3 min-w-0">
          {/* Video player */}
          {(tab === "overview" || tab === "discuss") && (
            <div className="rounded-xl overflow-hidden bg-slate-900 aspect-video flex items-center justify-center relative">
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <button className="relative w-14 h-14 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur flex items-center justify-center transition-all hover:scale-105">
                <Play className="h-6 w-6 text-white fill-white ml-0.5" />
              </button>
              <div className="absolute bottom-3 left-4 right-4">
                <p className="text-white font-semibold text-[13px]">{cur?.title}</p>
                <p className="text-white/60 text-[11px]">{curChapter?.title ?? ""} · {cur?.duration ? `${cur.duration}m` : "—"}</p>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
                <div className="h-full bg-blue-500 w-1/3" />
              </div>
            </div>
          )}

          {/* Tab strip + content */}
          <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
            <div className="flex border-b border-slate-100 overflow-x-auto">
              {[
                { k: "overview", label: "Overview",   Icon: BookOpen },
                { k: "quiz",     label: "Quiz",        Icon: FileQuestion },
                { k: "tasks",    label: "Tasks",       Icon: ListTodo },
                { k: "discuss",  label: "Discussion",  Icon: MessageSquare },
              ].map(({ k, label, Icon }) => (
                <button key={k} onClick={() => setTab(k as any)}
                  className={cn("flex items-center gap-1.5 px-5 py-3 text-[12.5px] font-semibold transition-colors whitespace-nowrap",
                    tab===k ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-400 hover:text-slate-600")}>
                  <Icon className="h-3.5 w-3.5" />{label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {/* ── Overview ── */}
              {tab === "overview" && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-[17px] font-bold text-slate-800 mb-0.5">{cur?.title}</h2>
                    <p className="text-[12px] text-slate-400">{curChapter?.title ?? ""}</p>
                  </div>
                  <p className="text-[13px] text-slate-500 leading-relaxed">
                    In this lesson you'll explore <em>{cur?.title?.toLowerCase()}</em> in depth. Professional traders use these
                    techniques to identify high-probability setups with clear entry, stop loss, and take profit levels.
                    By the end you'll have a practical framework applicable to any market immediately.
                  </p>
                  <div className="grid sm:grid-cols-3 gap-2.5">
                    {[
                      { Icon: Clock,    l: "Duration", v: cur?.duration ? `${cur.duration}m` : "—" },
                      { Icon: Zap,      l: "XP Reward", v: "+50 XP" },
                      { Icon: BarChart2,l: "Chapter", v: `Ch. ${chIdx + 1}` },
                    ].map(item => (
                      <div key={item.l} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <item.Icon className="h-4 w-4 text-blue-600 shrink-0" />
                        <div>
                          <p className="text-[10.5px] text-slate-400">{item.l}</p>
                          <p className="text-[13px] font-semibold text-slate-700">{item.v}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {isEnrolled ? (
                    <div className="flex flex-wrap gap-2">
                      <button onClick={markDone}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[13px] font-semibold transition-colors">
                        <CheckCircle2 className="h-4 w-4" />
                        {done.has(String(activeIdx)) ? "Completed ✓" : "Mark as Complete"}
                      </button>
                      {activeIdx < totalL-1 && (
                        <button onClick={() => setActiveIdx(p=>p+1)}
                          className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-[13px] font-semibold transition-colors">
                          Next Lesson <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                      <Lock className="h-5 w-5 text-amber-600 shrink-0" />
                      <div className="flex-1">
                        <p className="text-[13px] font-semibold text-amber-800">Enroll to unlock all lessons</p>
                        <p className="text-[11.5px] text-amber-600">First 2 lessons free to preview</p>
                      </div>
                      <button onClick={doEnroll} disabled={enrolling}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[12px] font-bold transition-colors shrink-0">
                        {enrolling ? "…" : "Enroll Free"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Quiz ── */}
              {tab === "quiz" && (
                <div className="space-y-4">
                  {quizState === "idle" && (
                    <div className="text-center py-6">
                      <div className="w-14 h-14 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center mx-auto mb-3">
                        <FileQuestion className="h-7 w-7 text-violet-600" />
                      </div>
                      <h3 className="text-[17px] font-bold text-slate-800 mb-1">Chapter Quiz</h3>
                      <p className="text-[12.5px] text-slate-400 mb-4">{QUIZ.length} questions · Pass at 80% · Unlimited attempts</p>
                      <div className="flex justify-center gap-6 text-[12px] text-slate-400 mb-6">
                        {[{Icon:Clock,l:"10 minutes"},{Icon:Trophy,l:"+150 XP"},{Icon:Zap,l:"Instant results"}].map(i=>(
                          <div key={i.l} className="flex items-center gap-1.5"><i.Icon className="h-3.5 w-3.5" />{i.l}</div>
                        ))}
                      </div>
                      <button onClick={() => { setQuizState("taking"); setAnswers({}); }}
                        className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-[13px] transition-colors">
                        Start Quiz
                      </button>
                    </div>
                  )}

                  {quizState === "taking" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[14px] font-bold text-slate-800">Chapter Quiz</h3>
                        <span className="text-[11.5px] font-medium text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">
                          {Object.keys(answers).length}/{QUIZ.length} answered
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5">
                        <div className="bg-blue-600 h-1.5 rounded-full transition-all"
                          style={{ width:`${(Object.keys(answers).length/QUIZ.length)*100}%` }} />
                      </div>
                      {QUIZ.map((q, qi) => (
                        <div key={qi} className="p-4 rounded-xl border border-slate-200">
                          <p className="text-[13px] font-semibold text-slate-700 mb-3">
                            <span className="text-blue-600 mr-1.5">Q{qi+1}.</span>{q.q}
                          </p>
                          <div className="space-y-1.5">
                            {q.opts.map((opt, oi) => (
                              <button key={oi} onClick={() => setAnswers(p => ({...p,[qi]:oi}))}
                                className={cn("w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-[12.5px] text-left transition-all",
                                  answers[qi]===oi ? "border-blue-600 bg-blue-50 text-blue-700 font-medium"
                                                   : "border-slate-200 hover:border-blue-300 hover:bg-slate-50 text-slate-600")}>
                                <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                                  answers[qi]===oi ? "border-blue-600 bg-blue-600" : "border-slate-300")}>
                                  {answers[qi]===oi && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                </div>
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-1">
                        <button onClick={() => setQuizState("idle")}
                          className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-lg text-[12.5px] font-medium transition-colors">
                          Cancel
                        </button>
                        <button onClick={submitQuiz}
                          disabled={Object.keys(answers).length < QUIZ.length}
                          className="px-8 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg text-[13px] font-bold transition-colors">
                          Submit Quiz
                        </button>
                      </div>
                    </div>
                  )}

                  {quizState === "done" && (
                    <div className="text-center py-4">
                      <div className={cn("w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3",
                        score >= 4 ? "bg-emerald-100" : "bg-amber-100")}>
                        {score >= 4 ? <Trophy className="h-8 w-8 text-emerald-600" /> : <FileQuestion className="h-8 w-8 text-amber-600" />}
                      </div>
                      <h3 className="text-[20px] font-extrabold text-slate-800 mb-0.5">{score >= 4 ? "Excellent!" : "Keep Practicing"}</h3>
                      <p className="text-[12.5px] text-slate-400 mb-1">You scored <strong className="text-slate-700">{score}/{QUIZ.length}</strong></p>
                      <div className={cn("text-[36px] font-extrabold mb-3", score>=4 ? "text-emerald-600" : "text-amber-500")}>
                        {Math.round((score/QUIZ.length)*100)}%
                      </div>
                      {score>=4 && (
                        <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[11.5px] font-semibold mb-4">+150 XP Earned</span>
                      )}
                      <div className="space-y-1.5 text-left mt-3">
                        {QUIZ.map((q,i) => (
                          <div key={i} className={cn("flex items-center gap-2 p-2.5 rounded-lg text-[12px]",
                            answers[i]===q.ans ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200")}>
                            {answers[i]===q.ans
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              : <div className="h-3.5 w-3.5 rounded-full bg-red-400 text-white text-[9px] font-bold flex items-center justify-center shrink-0">✗</div>}
                            <span className="flex-1 text-slate-600 line-clamp-1">{q.q}</span>
                            <span className="text-slate-400 shrink-0 text-[11px]">{q.opts[q.ans]}</span>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => { setQuizState("idle"); setAnswers({}); }}
                        className="mt-5 px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-[13px] transition-colors">
                        Retake Quiz
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Tasks ── */}
              {tab === "tasks" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-[15px] font-bold text-slate-800">Practical Tasks</h3>
                      <p className="text-[12px] text-slate-400">Complete real-world exercises to earn XP</p>
                    </div>
                    <span className="text-[12px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">{doneTasks.size}/{TASKS.length} done</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className="bg-emerald-500 h-1.5 rounded-full transition-all"
                      style={{ width:`${(doneTasks.size/TASKS.length)*100}%` }} />
                  </div>
                  {TASKS.map(task => {
                    const isDone = doneTasks.has(task.id);
                    return (
                      <div key={task.id}
                        className={cn("p-4 rounded-xl border transition-all",
                          isDone ? "bg-emerald-50/60 border-emerald-200" : "bg-white border-slate-200 hover:border-slate-300")}>
                        <div className="flex items-start gap-3">
                          <button onClick={() => setDoneTasks(p => { const n=new Set(p); n.has(task.id)?n.delete(task.id):n.add(task.id); return n; })}
                            className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all",
                              isDone ? "bg-emerald-500 border-emerald-500" : "border-slate-300 hover:border-blue-500")}>
                            {isDone && <CheckCircle2 className="h-3 w-3 text-white" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-0.5">
                              <p className={cn("text-[13px] font-semibold", isDone && "line-through text-slate-400")}>{task.t}</p>
                              <span className="text-[10.5px] px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700 font-semibold">+{task.xp} XP</span>
                            </div>
                            <p className="text-[12px] text-slate-400 leading-relaxed">{task.d}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {doneTasks.size === TASKS.length && (
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                      <Trophy className="h-7 w-7 text-emerald-600 mx-auto mb-1" />
                      <p className="text-[13px] font-bold text-emerald-800">All tasks complete! 🎉</p>
                      <p className="text-[11.5px] text-emerald-600">+{TASKS.reduce((a,t)=>a+t.xp,0)} XP earned from tasks</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Discussion ── */}
              {tab === "discuss" && (
                <div className="space-y-3">
                  <h3 className="text-[15px] font-bold text-slate-800">Discussion</h3>
                  {[
                    { u:"Sarah M.",  av:"SM", bg:"#8b5cf6", ago:"2 days ago",  text:"The S/R section was extremely clear. I've been trading 2 years and this gave me a new perspective.", likes:24 },
                    { u:"Jake T.",   av:"JT", bg:"#3b82f6", ago:"5 days ago",  text:"Could you add more examples on RSI divergence in trending markets? Otherwise fantastic course!", likes:11 },
                    { u:"Priya K.",  av:"PK", bg:"#ef4444", ago:"1 week ago",  text:"Completed the first quiz — 5/5! The questions are well-designed and make you think rather than just memorize.", likes:18 },
                  ].map((p,i) => (
                    <div key={i} className="flex gap-3 p-3.5 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                        style={{ background: p.bg }}>{p.av}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="text-[12.5px] font-semibold text-slate-700">{p.u}</span>
                          <span className="text-[11px] text-slate-400">{p.ago}</span>
                        </div>
                        <p className="text-[12.5px] text-slate-600 leading-snug">{p.text}</p>
                        <div className="flex gap-4 mt-1.5 text-[11px] text-slate-400">
                          <button className="hover:text-rose-500 transition-colors">♥ {p.likes}</button>
                          <button className="hover:text-blue-600 transition-colors">Reply</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-3 pt-1">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-[11px] font-bold shrink-0">Y</div>
                    <div className="flex-1">
                      <textarea placeholder="Share your thoughts or ask a question…"
                        className="w-full p-3 text-[12.5px] rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none transition-all resize-none"
                        rows={2} />
                      <button className="mt-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[12.5px] font-semibold transition-colors">
                        Post
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
