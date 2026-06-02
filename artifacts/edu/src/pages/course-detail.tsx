import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useGetCourse, useListLessons, useListEnrollments, useCreateEnrollment, getListEnrollmentsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  BookOpen, Clock, Users, Star, Play, CheckCircle2, Lock, ChevronRight,
  Award, Target, ArrowLeft, ChevronDown, ChevronUp, FileQuestion, ListTodo,
  MessageSquare, Trophy, Zap, Video,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Mock quiz data ────────────────────────────────────────────────── */
const QUIZ_QUESTIONS = [
  {
    q: "Which candlestick pattern signals a strong bullish reversal after a downtrend?",
    options: ["Shooting Star", "Hammer", "Doji", "Hanging Man"],
    correct: 1,
  },
  {
    q: "What does RSI above 70 typically indicate?",
    options: ["Oversold condition", "Overbought condition", "Neutral momentum", "Strong downtrend"],
    correct: 1,
  },
  {
    q: "In technical analysis, a 'head and shoulders' pattern is a signal of:",
    options: ["Trend continuation", "Trend reversal", "Consolidation", "Breakout"],
    correct: 1,
  },
  {
    q: "What is the standard risk-reward ratio recommended for professional traders?",
    options: ["1:1", "1:2 or better", "2:1", "3:1 only"],
    correct: 1,
  },
  {
    q: "Support levels in technical analysis represent:",
    options: ["Where price always reverses", "Price zones where buying pressure tends to exceed selling pressure", "Random price points", "Moving average intersections only"],
    correct: 1,
  },
];

/* ─── Mock tasks ────────────────────────────────────────────────────── */
const TASKS = [
  { id: 1, title: "Identify 3 Support & Resistance Levels", desc: "On a 4H BTC/USD chart, mark at least 3 clear S/R levels and explain your reasoning in the discussion.", xp: 50 },
  { id: 2, title: "Document a Complete Trade Setup", desc: "Find a valid trade setup using what you've learned. Include entry, stop loss, take profit, and R:R ratio.", xp: 75 },
  { id: 3, title: "Analyze a Historical Price Action", desc: "Pick any major market move from the past 3 months and write a 200-word analysis using the concepts from this course.", xp: 60 },
  { id: 4, title: "Create Your Trading Plan", desc: "Write a one-page trading plan covering: trading hours, instruments, strategy rules, risk per trade, and max daily loss.", xp: 100 },
];

/* ─── Static curriculum chapters ─────────────────────────────────── */
const CHAPTERS = [
  {
    id: 1, title: "Foundations of Price Action",
    lessons: ["What is Price Action?", "Reading Candlestick Charts", "Support & Resistance Basics", "Trend Identification"],
  },
  {
    id: 2, title: "Technical Analysis Essentials",
    lessons: ["Chart Patterns Overview", "Moving Averages Deep Dive", "RSI & MACD Explained", "Bollinger Bands Strategy"],
  },
  {
    id: 3, title: "Risk Management Mastery",
    lessons: ["Position Sizing Formula", "Stop Loss Strategies", "Risk-Reward Optimization", "Portfolio Risk Management"],
  },
  {
    id: 4, title: "Advanced Entry & Exit",
    lessons: ["Multi-Timeframe Analysis", "Order Flow Basics", "Scaling In & Out", "Psychology of a Trade"],
  },
];

type QuizState = "idle" | "taking" | "complete";

export default function CourseDetail() {
  const [, params] = useRoute<{ id: string }>("/courses/:id");
  const courseId = params?.id ? parseInt(params.id) : 0;

  const { data: course, isLoading: courseLoading } = useGetCourse(courseId > 0 ? courseId : -1);
  const { data: lessons } = useListLessons(courseId > 0 ? courseId : -1);
  const { data: enrollments } = useListEnrollments();
  const { mutateAsync: enroll, isPending: enrolling } = useCreateEnrollment();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"lessons" | "tests" | "tasks" | "discuss">("lessons");
  const [activeLesson, setActiveLesson] = useState(0);
  const [expandedChapter, setExpandedChapter] = useState<number | null>(1);
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());
  const [quizState, setQuizState] = useState<QuizState>("idle");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [quizScore, setQuizScore] = useState(0);
  const [completedTasks, setCompletedTasks] = useState<Set<number>>(new Set());

  const isEnrolled = enrollments?.some((e) => e.courseId === courseId) ?? false;
  const totalLessons = CHAPTERS.reduce((acc, c) => acc + c.lessons.length, 0);
  const progress = totalLessons > 0 ? Math.round((completedLessons.size / totalLessons) * 100) : 0;

  /* flat lesson list for active display */
  const allLessons = CHAPTERS.flatMap((c) => c.lessons.map((l) => ({ title: l, chapter: c.title })));
  const currentLesson = allLessons[activeLesson];

  const handleEnroll = async () => {
    try {
      await enroll({ data: { courseId } });
      await qc.invalidateQueries({ queryKey: getListEnrollmentsQueryKey() });
      toast({ title: "Enrolled successfully!", description: "Your learning journey begins now." });
    } catch {
      toast({ title: "Enrollment failed", variant: "destructive" });
    }
  };

  const markLessonComplete = () => {
    setCompletedLessons((prev) => new Set([...prev, String(activeLesson)]));
    if (activeLesson < allLessons.length - 1) setActiveLesson((p) => p + 1);
  };

  const submitQuiz = () => {
    const score = QUIZ_QUESTIONS.reduce((acc, q, i) => acc + (answers[i] === q.correct ? 1 : 0), 0);
    setQuizScore(score);
    setQuizState("complete");
  };

  const toggleTask = (id: number) => {
    setCompletedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (courseLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-56 w-full rounded-2xl" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-64 col-span-1 rounded-xl" />
          <Skeleton className="h-64 col-span-2 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!course && courseId > 0) {
    return (
      <div className="text-center py-20">
        <BookOpen className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-muted-foreground">Course not found.</p>
        <Link href="/courses"><Button variant="outline" className="mt-4">Back to Academy</Button></Link>
      </div>
    );
  }

  /* Fallback demo course when courseId is 0 or no real data */
  const displayCourse = course ?? {
    title: "Complete Forex & Technical Analysis Masterclass",
    description: "A comprehensive trading education course covering everything from price action basics to advanced multi-timeframe analysis. Designed for traders who want consistent, systematic results.",
    instructorName: "Alex Morgan",
    category: "Forex",
    level: "Intermediate",
    enrollmentCount: 4820,
    lessonCount: totalLessons,
    duration: 24,
    price: null,
    rating: 4.9,
    thumbnailUrl: null,
  };

  return (
    <div className="space-y-0 -mt-2">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Link href="/courses" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Academy
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium truncate max-w-xs">{displayCourse.title}</span>
      </div>

      {/* Course Banner */}
      <div className="rounded-2xl overflow-hidden border border-border bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white relative mb-6">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_right,_#3b82f6,_transparent)]" />
        <div className="relative grid lg:grid-cols-3 gap-0">
          <div className="lg:col-span-2 p-8">
            <div className="flex gap-2 mb-3">
              <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs">{displayCourse.category}</Badge>
              <Badge className="bg-white/10 text-white/80 border-white/20 text-xs">{displayCourse.level}</Badge>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold leading-tight mb-3">{displayCourse.title}</h1>
            <p className="text-sm text-white/70 mb-5 max-w-xl leading-relaxed">{displayCourse.description}</p>

            <div className="flex flex-wrap gap-4 text-sm text-white/80 mb-6">
              <div className="flex items-center gap-1.5"><Users className="h-4 w-4" />{((displayCourse as any).enrollmentCount ?? 0).toLocaleString()} students</div>
              <div className="flex items-center gap-1.5"><BookOpen className="h-4 w-4" />{totalLessons} lessons</div>
              <div className="flex items-center gap-1.5"><Clock className="h-4 w-4" />{(displayCourse as any).duration ?? 24}h total</div>
              <div className="flex items-center gap-1.5">
                <div className="flex gap-0.5">{[1,2,3,4,5].map((s) => <Star key={s} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />)}</div>
                <span>4.9 (382 reviews)</span>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                {(displayCourse.instructorName ?? "I").charAt(0)}
              </div>
              <div>
                <p className="text-sm font-semibold">{displayCourse.instructorName ?? "Instructor"}</p>
                <p className="text-xs text-white/60">Senior Market Analyst</p>
              </div>
            </div>
          </div>

          {/* Enroll card */}
          <div className="lg:col-span-1 p-6 border-l border-white/10 flex flex-col justify-center">
            {isEnrolled ? (
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-white/70">Your progress</span>
                    <span className="font-bold text-white">{progress}%</span>
                  </div>
                  <div className="w-full bg-white/20 rounded-full h-2">
                    <div className="bg-emerald-400 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-xs text-white/60 mt-1">{completedLessons.size} of {totalLessons} lessons completed</p>
                </div>
                <Button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-lg" size="lg"
                  onClick={() => setActiveTab("lessons")}>
                  <Play className="h-4 w-4 mr-2" /> Continue Learning
                </Button>
                {progress === 100 && (
                  <div className="flex items-center gap-2 text-amber-300 text-sm font-medium">
                    <Award className="h-5 w-5" /> Claim your certificate →
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4 text-center">
                <div>
                  <p className="text-4xl font-extrabold text-white">
                    {displayCourse.price ? `$${displayCourse.price}` : "Free"}
                  </p>
                  <p className="text-white/60 text-sm mt-1">Full lifetime access</p>
                </div>
                <Button className="w-full bg-primary hover:bg-primary/90 text-white font-semibold shadow-xl" size="lg"
                  onClick={handleEnroll} disabled={enrolling}>
                  {enrolling ? "Enrolling..." : "Enroll Now — Free"}
                </Button>
                <ul className="text-xs text-white/70 space-y-1.5 text-left">
                  {["24h of on-demand video", `${totalLessons} interactive lessons`, "5 practice quizzes", "4 real-world tasks", "Certificate of completion"].map((f) => (
                    <li key={f} className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />{f}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="grid lg:grid-cols-[320px,1fr] gap-5 items-start">
        {/* ── Curriculum sidebar ── */}
        <div className="border border-border rounded-2xl bg-white overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Course Content</h3>
            <span className="text-xs text-muted-foreground">{totalLessons} lessons · 24h</span>
          </div>

          <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
            {CHAPTERS.map((chapter, ci) => {
              const chapterLessonIndexStart = CHAPTERS.slice(0, ci).reduce((a, c) => a + c.lessons.length, 0);
              const isExpanded = expandedChapter === chapter.id;
              const chapterCompleted = chapter.lessons.every((_, li) => completedLessons.has(String(chapterLessonIndexStart + li)));

              return (
                <div key={chapter.id}>
                  <button
                    onClick={() => setExpandedChapter(isExpanded ? null : chapter.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left"
                  >
                    <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                      chapterCompleted ? "bg-emerald-100 text-emerald-600" : "bg-secondary text-muted-foreground"
                    )}>
                      {chapterCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : ci + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{chapter.title}</p>
                      <p className="text-xs text-muted-foreground">{chapter.lessons.length} lessons</p>
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                  </button>

                  {isExpanded && (
                    <div className="bg-secondary/30">
                      {chapter.lessons.map((lesson, li) => {
                        const lessonIdx = chapterLessonIndexStart + li;
                        const isDone = completedLessons.has(String(lessonIdx));
                        const isActive = activeLesson === lessonIdx;
                        const isLocked = !isEnrolled && lessonIdx > 1;

                        return (
                          <button
                            key={li}
                            disabled={isLocked}
                            onClick={() => { setActiveLesson(lessonIdx); setActiveTab("lessons"); }}
                            className={cn(
                              "w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors",
                              isActive ? "bg-primary/10 border-l-2 border-primary" : "hover:bg-secondary border-l-2 border-transparent",
                              isLocked && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            <div className="shrink-0">
                              {isLocked ? (
                                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                              ) : isDone ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              ) : (
                                <Play className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                            </div>
                            <span className={cn("text-xs flex-1 truncate", isActive ? "text-primary font-semibold" : isDone ? "text-muted-foreground line-through" : "text-foreground")}>
                              {lesson}
                            </span>
                            <span className="text-[10px] text-muted-foreground shrink-0">8:24</span>
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

        {/* ── Content area ── */}
        <div className="space-y-4">
          {/* Video player */}
          {(activeTab === "lessons" || activeTab === "discuss") && (
            <div className="rounded-2xl overflow-hidden border border-border bg-slate-900 aspect-video flex items-center justify-center relative group">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/30" />
              <button className="relative w-16 h-16 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur flex items-center justify-center transition-all group-hover:scale-110">
                <Play className="h-7 w-7 text-white fill-white ml-1" />
              </button>
              <div className="absolute bottom-4 left-4 right-4">
                <p className="text-white font-semibold text-sm">{currentLesson?.title}</p>
                <p className="text-white/60 text-xs">{currentLesson?.chapter}</p>
              </div>
              {/* Progress bar */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                <div className="h-full bg-primary w-1/3" />
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="border border-border rounded-2xl bg-white overflow-hidden">
            <div className="flex border-b border-border overflow-x-auto">
              {[
                { key: "lessons", label: "Overview", icon: BookOpen },
                { key: "tests", label: "Quiz", icon: FileQuestion },
                { key: "tasks", label: "Tasks", icon: ListTodo },
                { key: "discuss", label: "Discussion", icon: MessageSquare },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key as any)}
                  className={cn(
                    "flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors whitespace-nowrap",
                    activeTab === key ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>

            <div className="p-6">
              {/* ── Overview tab ── */}
              {activeTab === "lessons" && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-xl font-bold text-foreground mb-1">{currentLesson?.title}</h2>
                    <p className="text-sm text-muted-foreground">{currentLesson?.chapter}</p>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    In this lesson, we'll explore the core concepts of {currentLesson?.title?.toLowerCase()}. 
                    You'll learn how professional traders use these techniques to identify high-probability 
                    trade setups with clear entry, stop loss, and take profit levels. By the end of this 
                    lesson, you'll have a practical framework you can apply to any market immediately.
                  </p>
                  <div className="grid sm:grid-cols-3 gap-3">
                    {[
                      { icon: Clock, label: "Duration", value: "8 min 24 sec" },
                      { icon: Zap, label: "XP Reward", value: "+50 XP" },
                      { icon: Trophy, label: "Chapter", value: currentLesson?.chapter?.split(" ")[0] ?? "1" },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
                        <item.icon className="h-5 w-5 text-primary" />
                        <div>
                          <p className="text-xs text-muted-foreground">{item.label}</p>
                          <p className="text-sm font-semibold text-foreground">{item.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {isEnrolled ? (
                    <div className="flex items-center gap-3">
                      <Button onClick={markLessonComplete} className="gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        {completedLessons.has(String(activeLesson)) ? "Mark as Incomplete" : "Mark as Complete"}
                      </Button>
                      {activeLesson < allLessons.length - 1 && (
                        <Button variant="outline" onClick={() => setActiveLesson((p) => p + 1)} className="gap-2">
                          Next Lesson <ChevronRight className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-3">
                      <Lock className="h-5 w-5 text-amber-600 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-amber-800">Enroll to unlock all lessons</p>
                        <p className="text-xs text-amber-600">First 2 lessons are free to preview</p>
                      </div>
                      <Button size="sm" className="ml-auto" onClick={handleEnroll} disabled={enrolling}>
                        {enrolling ? "..." : "Enroll Free"}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Quiz tab ── */}
              {activeTab === "tests" && (
                <div className="space-y-5">
                  {quizState === "idle" && (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-4">
                        <FileQuestion className="h-8 w-8 text-violet-600" />
                      </div>
                      <h3 className="text-xl font-bold text-foreground mb-2">Chapter Quiz</h3>
                      <p className="text-sm text-muted-foreground mb-1">{QUIZ_QUESTIONS.length} multiple-choice questions</p>
                      <p className="text-sm text-muted-foreground mb-6">Test your understanding of the course material. You need 80% to pass.</p>
                      <div className="flex items-center justify-center gap-4 text-sm mb-8">
                        {[
                          { icon: Clock, label: "10 minutes" },
                          { icon: Trophy, label: "+150 XP on pass" },
                          { icon: Zap, label: "Unlimited attempts" },
                        ].map((item) => (
                          <div key={item.label} className="flex items-center gap-1.5 text-muted-foreground">
                            <item.icon className="h-4 w-4" />{item.label}
                          </div>
                        ))}
                      </div>
                      <Button size="lg" onClick={() => { setQuizState("taking"); setAnswers({}); }} className="px-10">
                        Start Quiz
                      </Button>
                    </div>
                  )}

                  {quizState === "taking" && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-foreground">Chapter Quiz</h3>
                        <Badge variant="secondary">{Object.keys(answers).length}/{QUIZ_QUESTIONS.length} answered</Badge>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${(Object.keys(answers).length / QUIZ_QUESTIONS.length) * 100}%` }} />
                      </div>
                      {QUIZ_QUESTIONS.map((q, qi) => (
                        <div key={qi} className="p-4 rounded-xl border border-border">
                          <p className="text-sm font-semibold text-foreground mb-3">
                            <span className="text-primary mr-2">Q{qi + 1}.</span>{q.q}
                          </p>
                          <div className="space-y-2">
                            {q.options.map((opt, oi) => (
                              <button
                                key={oi}
                                onClick={() => setAnswers((prev) => ({ ...prev, [qi]: oi }))}
                                className={cn(
                                  "w-full flex items-center gap-3 p-3 rounded-lg border text-sm text-left transition-all",
                                  answers[qi] === oi
                                    ? "border-primary bg-primary/5 text-primary font-medium"
                                    : "border-border hover:border-primary/40 hover:bg-secondary text-foreground"
                                )}
                              >
                                <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                                  answers[qi] === oi ? "border-primary bg-primary" : "border-border"
                                )}>
                                  {answers[qi] === oi && <div className="w-2 h-2 rounded-full bg-white" />}
                                </div>
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between items-center pt-2">
                        <Button variant="outline" onClick={() => setQuizState("idle")}>Cancel</Button>
                        <Button
                          onClick={submitQuiz}
                          disabled={Object.keys(answers).length < QUIZ_QUESTIONS.length}
                          className="px-8"
                        >
                          Submit Quiz
                        </Button>
                      </div>
                    </div>
                  )}

                  {quizState === "complete" && (
                    <div className="text-center py-8">
                      <div className={cn("w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4",
                        quizScore >= 4 ? "bg-emerald-100" : "bg-amber-100"
                      )}>
                        {quizScore >= 4
                          ? <Trophy className="h-10 w-10 text-emerald-600" />
                          : <FileQuestion className="h-10 w-10 text-amber-600" />}
                      </div>
                      <h3 className="text-2xl font-extrabold text-foreground mb-1">
                        {quizScore >= 4 ? "Excellent Work!" : "Keep Practicing!"}
                      </h3>
                      <p className="text-muted-foreground mb-2">
                        You scored <strong className="text-foreground">{quizScore}/{QUIZ_QUESTIONS.length}</strong>
                      </p>
                      <div className="text-4xl font-extrabold mb-4">
                        <span className={quizScore >= 4 ? "text-emerald-600" : "text-amber-600"}>
                          {Math.round((quizScore / QUIZ_QUESTIONS.length) * 100)}%
                        </span>
                      </div>
                      {quizScore >= 4 && (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 mb-4">+150 XP Earned</Badge>
                      )}
                      <div className="space-y-2 mt-6">
                        {QUIZ_QUESTIONS.map((q, i) => (
                          <div key={i} className={cn("flex items-center gap-3 p-3 rounded-lg text-sm text-left border",
                            answers[i] === q.correct ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
                          )}>
                            {answers[i] === q.correct
                              ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                              : <div className="h-4 w-4 rounded-full bg-red-400 flex items-center justify-center shrink-0"><span className="text-white text-[10px] font-bold">✗</span></div>}
                            <span className="flex-1 line-clamp-1">{q.q}</span>
                            <span className="text-xs text-muted-foreground shrink-0">Correct: {q.options[q.correct]}</span>
                          </div>
                        ))}
                      </div>
                      <Button className="mt-6 px-10" onClick={() => { setQuizState("idle"); setAnswers({}); }}>
                        Retake Quiz
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Tasks tab ── */}
              {activeTab === "tasks" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">Practical Tasks</h3>
                    <p className="text-sm text-muted-foreground">Complete real-world exercises to reinforce your learning and earn XP.</p>
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex-1 bg-secondary rounded-full h-2 overflow-hidden">
                      <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${(completedTasks.size / TASKS.length) * 100}%` }} />
                    </div>
                    <span className="text-muted-foreground whitespace-nowrap">{completedTasks.size}/{TASKS.length} complete</span>
                  </div>

                  {TASKS.map((task) => {
                    const done = completedTasks.has(task.id);
                    return (
                      <div key={task.id} className={cn("p-4 rounded-xl border transition-all", done ? "bg-emerald-50/50 border-emerald-200" : "bg-white border-border hover:border-primary/20")}>
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => toggleTask(task.id)}
                            className={cn(
                              "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all",
                              done ? "bg-emerald-500 border-emerald-500" : "border-border hover:border-primary"
                            )}
                          >
                            {done && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                          </button>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className={cn("text-sm font-semibold", done && "line-through text-muted-foreground")}>{task.title}</p>
                              <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-[10px]">+{task.xp} XP</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{task.desc}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {completedTasks.size === TASKS.length && (
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                      <Trophy className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
                      <p className="text-sm font-bold text-emerald-800">All tasks completed! 🎉</p>
                      <p className="text-xs text-emerald-600">You earned {TASKS.reduce((a, t) => a + t.xp, 0)} XP from tasks</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Discussion tab ── */}
              {activeTab === "discuss" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-foreground">Discussion</h3>
                  {[
                    { user: "Sarah M.", avatar: "SM", avatarBg: "bg-violet-500", time: "2 days ago", text: "The support/resistance section was extremely clear. I've been trading for 2 years and this gave me a new perspective on levels.", likes: 24 },
                    { user: "Jake T.", avatar: "JT", avatarBg: "bg-blue-500", time: "5 days ago", text: "Could you add more examples on how RSI divergence works in trending markets? Otherwise fantastic course!", likes: 11 },
                    { user: "Priya K.", avatar: "PK", avatarBg: "bg-rose-500", time: "1 week ago", text: "Completed the first quiz and got 5/5! The questions are well-designed and really make you think rather than just memorize.", likes: 18 },
                  ].map((post, i) => (
                    <div key={i} className="flex gap-3 p-4 rounded-xl border border-border hover:bg-secondary/30 transition-colors">
                      <div className={`w-9 h-9 rounded-full ${post.avatarBg} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                        {post.avatar}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-sm font-semibold text-foreground">{post.user}</span>
                          <span className="text-xs text-muted-foreground">{post.time}</span>
                        </div>
                        <p className="text-sm text-foreground leading-relaxed">{post.text}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <button className="flex items-center gap-1 hover:text-primary transition-colors">
                            ♥ {post.likes}
                          </button>
                          <button className="hover:text-primary transition-colors">Reply</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0">
                      Y
                    </div>
                    <div className="flex-1">
                      <textarea
                        placeholder="Share your thoughts or ask a question..."
                        className="w-full p-3 text-sm rounded-xl border border-border bg-secondary focus:bg-white focus:border-primary outline-none transition-all resize-none"
                        rows={3}
                      />
                      <Button size="sm" className="mt-2">Post Comment</Button>
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
