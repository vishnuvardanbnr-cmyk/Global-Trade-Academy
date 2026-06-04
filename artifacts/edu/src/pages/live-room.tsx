import { useEffect, useRef, useState, useCallback } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useUser } from "@/lib/authContext";
import {
  useGetLiveClass, useStartLiveClass, useEndLiveClass,
  useListLiveClassMessages, useCreateLiveClassMessage, getListLiveClassMessagesQueryKey,
  useListLiveClassQuestions, useCreateLiveClassQuestion, useUpdateLiveClassQuestion, useUpvoteLiveClassQuestion, getListLiveClassQuestionsQueryKey,
  useListLiveClassPolls, useCreateLiveClassPoll, useUpdateLiveClassPoll, useVoteLiveClassPoll, getListLiveClassPollsQueryKey,
  getGetLiveClassQueryKey,
  type LiveClassMessage, type LiveClassQuestion, type LiveClassPoll,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Users, Clock, Video, VideoOff, Mic, MicOff,
  MessageSquare, PhoneOff, AlertTriangle,
  BookOpen, Calendar, Wifi, WifiOff, Loader2, Play,
  ChevronRight, Send, ThumbsUp, Pin, CheckCircle2, BarChart2,
  X, PlusCircle, ChevronLeft, Info, Hand,
} from "lucide-react";
import "@livekit/components-styles";
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  ControlBar,
  useTracks,
  useParticipants,
  useLocalParticipant,
} from "@livekit/components-react";
import { Track } from "livekit-client";

/* ─── Helpers ──────────────────────────────────────────────────── */
function formatTime(d: string | Date) {
  return new Date(d).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function formatMsgTime(d: string | Date) {
  return new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
function durStr(mins: number) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}` : `${m}m`;
}

/* ─── Status badge ─────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  if (status === "live") return (
    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 text-[11px] font-bold uppercase tracking-wide">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
      Live
    </span>
  );
  if (status === "scheduled") return (
    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[11px] font-bold uppercase tracking-wide">
      <Clock className="h-3 w-3" />
      Scheduled
    </span>
  );
  return (
    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-500/20 border border-slate-500/40 text-slate-400 text-[11px] font-bold uppercase tracking-wide">
      Ended
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Chat Panel
══════════════════════════════════════════════════════════════════ */
function ChatPanel({ classId, currentUserId }: { classId: number; currentUserId: string }) {
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: messages = [], refetch } = useListLiveClassMessages(classId, {
    query: { queryKey: getListLiveClassMessagesQueryKey(classId), refetchInterval: 3000 },
  });

  const { mutate: sendMsg, isPending } = useCreateLiveClassMessage({
    mutation: {
      onSuccess: () => { setText(""); refetch(); },
      onError: () => toast({ title: "Could not send message", variant: "destructive" }),
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = () => {
    if (!text.trim()) return;
    sendMsg({ classId, data: { message: text.trim() } });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-center gap-2">
            <MessageSquare className="h-7 w-7 text-white/10" />
            <p className="text-white/30 text-[11.5px]">No messages yet — say hi!</p>
          </div>
        )}
        {(messages as LiveClassMessage[]).map((msg) => {
          const isMe = msg.userId === currentUserId;
          return (
            <div key={msg.id} className={cn("flex gap-2", isMe && "flex-row-reverse")}>
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5",
                isMe ? "bg-blue-500" : "bg-slate-600",
              )}>
                {(msg.userName ?? "?").charAt(0).toUpperCase()}
              </div>
              <div className={cn("max-w-[75%]", isMe && "items-end flex flex-col")}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] text-white/40">{msg.userName ?? "Unknown"}</span>
                  <span className="text-[9.5px] text-white/20">{formatMsgTime(msg.createdAt)}</span>
                </div>
                <div className={cn(
                  "px-3 py-1.5 rounded-xl text-[12px] leading-snug",
                  isMe ? "bg-blue-600 text-white rounded-tr-sm" : "bg-white/10 text-white/85 rounded-tl-sm",
                )}>
                  {msg.message}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Type a message…"
            maxLength={500}
            className="flex-1 bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-[12px] text-white placeholder-white/30 focus:outline-none focus:border-white/30 focus:bg-white/15"
          />
          <button onClick={send} disabled={isPending || !text.trim()}
            className="p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg transition-colors">
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Q&A Panel
══════════════════════════════════════════════════════════════════ */
function QAPanel({ classId, isInstructor }: { classId: number; isInstructor: boolean }) {
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<"all" | "unanswered" | "answered">("all");
  const [answeringId, setAnsweringId] = useState<number | null>(null);
  const [answerText, setAnswerText] = useState("");
  const { toast } = useToast();

  const { data: questions = [], refetch } = useListLiveClassQuestions(classId, {
    query: { queryKey: getListLiveClassQuestionsQueryKey(classId), refetchInterval: 4000 },
  });

  const { mutate: ask, isPending: asking } = useCreateLiveClassQuestion({
    mutation: {
      onSuccess: () => { setText(""); refetch(); },
      onError: () => toast({ title: "Could not post question", variant: "destructive" }),
    },
  });

  const { mutate: upvote } = useUpvoteLiveClassQuestion({
    mutation: { onSuccess: () => refetch() },
  });

  const { mutate: updateQ } = useUpdateLiveClassQuestion({
    mutation: {
      onSuccess: () => { setAnsweringId(null); refetch(); },
    },
  });

  const filtered = (questions as LiveClassQuestion[]).filter((q) => {
    if (filter === "unanswered") return !q.isAnswered;
    if (filter === "answered") return q.isAnswered;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Filter */}
      <div className="p-2.5 border-b border-white/10 shrink-0">
        <div className="flex gap-1">
          {(["all", "unanswered", "answered"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn(
                "flex-1 py-1 rounded-lg text-[10.5px] font-semibold transition-colors capitalize",
                filter === f ? "bg-blue-600 text-white" : "text-white/35 hover:text-white/55 hover:bg-white/5",
              )}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-28 text-center gap-2">
            <Hand className="h-6 w-6 text-white/10" />
            <p className="text-white/30 text-[11.5px]">No questions yet.</p>
          </div>
        )}
        {filtered.map((q: LiveClassQuestion) => (
          <div key={q.id} className={cn(
            "p-3 rounded-xl border",
            q.isPinned ? "bg-amber-500/10 border-amber-500/30" : "bg-white/5 border-white/10",
          )}>
            {q.isPinned && (
              <div className="flex items-center gap-1 text-amber-400 text-[10px] font-semibold mb-1.5">
                <Pin className="h-2.5 w-2.5" />Pinned
              </div>
            )}
            <p className="text-[12px] text-white/85 leading-snug">{q.question}</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-white/30">{q.userName ?? "Anonymous"}</span>
              <div className="flex items-center gap-1.5">
                {q.isAnswered && (
                  <span className="flex items-center gap-0.5 text-emerald-400 text-[10px] font-semibold">
                    <CheckCircle2 className="h-3 w-3" />Answered
                  </span>
                )}
                <button onClick={() => upvote({ classId, questionId: q.id })}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold transition-colors border",
                    q.hasUpvoted
                      ? "bg-blue-500/25 text-blue-300 border-blue-500/40"
                      : "text-white/35 hover:text-blue-300 hover:bg-blue-500/10 border-transparent",
                  )}>
                  <ThumbsUp className="h-2.5 w-2.5" />{q.upvoteCount}
                </button>
              </div>
            </div>

            {q.answer && (
              <div className="mt-2 pt-2 border-t border-white/10">
                <p className="text-[10px] font-semibold text-emerald-400 mb-0.5">Instructor:</p>
                <p className="text-[11.5px] text-white/60 leading-snug">{q.answer}</p>
              </div>
            )}

            {isInstructor && (
              <div className="flex gap-1 mt-2 pt-2 border-t border-white/10">
                <button onClick={() => updateQ({ classId, questionId: q.id, data: { isPinned: !q.isPinned } })}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition-colors",
                    q.isPinned ? "text-amber-300 bg-amber-500/15" : "text-white/25 hover:text-amber-300 hover:bg-amber-500/10",
                  )}>
                  <Pin className="h-2.5 w-2.5" />{q.isPinned ? "Unpin" : "Pin"}
                </button>
                <button onClick={() => { setAnsweringId(q.id); setAnswerText(""); }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold text-white/25 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors">
                  <MessageSquare className="h-2.5 w-2.5" />Answer
                </button>
              </div>
            )}

            {answeringId === q.id && (
              <div className="mt-2 space-y-1.5">
                <textarea value={answerText} onChange={(e) => setAnswerText(e.target.value)}
                  rows={2} placeholder="Your answer…"
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-2 py-1.5 text-[11.5px] text-white placeholder-white/30 focus:outline-none resize-none" />
                <div className="flex gap-1">
                  <button
                    onClick={() => updateQ({ classId, questionId: q.id, data: { answer: answerText, isAnswered: true } })}
                    disabled={!answerText.trim()}
                    className="flex-1 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded text-[10.5px] font-bold transition-colors">
                    Submit
                  </button>
                  <button onClick={() => setAnsweringId(null)}
                    className="px-2 py-1 text-white/30 hover:text-white hover:bg-white/10 rounded transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Ask */}
      <div className="p-3 border-t border-white/10 shrink-0">
        <div className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (text.trim()) ask({ classId, data: { question: text.trim() } }); } }}
            placeholder="Ask a question…"
            className="flex-1 bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-[12px] text-white placeholder-white/30 focus:outline-none focus:border-white/30" />
          <button onClick={() => { if (text.trim()) ask({ classId, data: { question: text.trim() } }); }}
            disabled={asking || !text.trim()}
            className="p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg transition-colors">
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Polls Panel
══════════════════════════════════════════════════════════════════ */
function PollsPanel({ classId, isInstructor }: { classId: number; isInstructor: boolean }) {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newOptions, setNewOptions] = useState(["", ""]);

  const { data: polls = [], refetch } = useListLiveClassPolls(classId, {
    query: { queryKey: getListLiveClassPollsQueryKey(classId), refetchInterval: 4000 },
  });

  const { mutate: createPoll, isPending: creating } = useCreateLiveClassPoll({
    mutation: {
      onSuccess: () => { setShowCreate(false); setNewQuestion(""); setNewOptions(["", ""]); refetch(); },
      onError: () => toast({ title: "Could not create poll", variant: "destructive" }),
    },
  });

  const { mutate: updatePoll } = useUpdateLiveClassPoll({
    mutation: { onSuccess: () => refetch() },
  });

  const { mutate: vote } = useVoteLiveClassPoll({
    mutation: { onSuccess: () => refetch() },
  });

  const allPolls = polls as LiveClassPoll[];
  const activePoll = allPolls.find((p) => p.isActive);
  const closedPolls = allPolls.filter((p) => !p.isActive);

  function PollCard({ poll }: { poll: LiveClassPoll }) {
    const totalVotes = poll.options.reduce((s, o) => s + o.voteCount, 0);
    const hasVoted = poll.myVoteOptionId !== null;
    return (
      <div className={cn(
        "p-3 rounded-xl border",
        poll.isActive ? "bg-blue-500/10 border-blue-500/30" : "bg-white/5 border-white/10",
      )}>
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <p className="text-[12.5px] font-semibold text-white leading-snug flex-1">{poll.question}</p>
          {poll.isActive && (
            <span className="flex items-center gap-1 text-[10px] text-blue-400 font-semibold shrink-0">
              <Radio className="h-2.5 w-2.5 animate-pulse" />Active
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          {poll.options.map((opt) => {
            const pct = totalVotes > 0 ? Math.round((opt.voteCount / totalVotes) * 100) : 0;
            const isMyVote = poll.myVoteOptionId === opt.id;
            if (poll.isActive && !hasVoted) {
              return (
                <button key={opt.id} onClick={() => vote({ classId, pollId: poll.id, data: { optionId: opt.id } })}
                  className="w-full flex items-center gap-2 p-2 rounded-lg bg-white/10 hover:bg-blue-500/20 border border-white/10 hover:border-blue-500/30 text-left transition-colors">
                  <div className="w-3 h-3 rounded-full border-2 border-white/30 shrink-0" />
                  <span className="text-[12px] text-white/80">{opt.text}</span>
                </button>
              );
            }
            return (
              <div key={opt.id} className={cn("p-2 rounded-lg border", isMyVote ? "border-blue-500/40 bg-blue-500/15" : "border-white/10 bg-white/5")}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    {isMyVote && <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />}
                    <span className="text-[11.5px] text-white/75">{opt.text}</span>
                  </div>
                  <span className="text-[11px] text-white/40 font-semibold">{pct}%</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-1.5">
                  <div className={cn("h-1.5 rounded-full transition-all duration-500", isMyVote ? "bg-blue-400" : "bg-white/25")}
                    style={{ width: `${pct}%` }} />
                </div>
                <div className="text-right text-[9.5px] text-white/20 mt-0.5">{opt.voteCount} votes</div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-2 text-[10px] text-white/25">
          <span>{totalVotes} total votes</span>
          {isInstructor && (
            <button onClick={() => updatePoll({ classId, pollId: poll.id, data: { isActive: !poll.isActive } })}
              className={cn("px-2 py-0.5 rounded font-semibold transition-colors",
                poll.isActive ? "text-red-400 hover:bg-red-500/15" : "text-emerald-400 hover:bg-emerald-500/15")}>
              {poll.isActive ? "Close" : "Reopen"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {activePoll && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-400/60 mb-1.5">Active</p>
            <PollCard poll={activePoll} />
          </div>
        )}
        {closedPolls.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-1.5">Past polls</p>
            <div className="space-y-2">
              {closedPolls.map((p) => <PollCard key={p.id} poll={p} />)}
            </div>
          </div>
        )}
        {allPolls.length === 0 && (
          <div className="flex flex-col items-center justify-center h-28 text-center gap-2">
            <BarChart2 className="h-6 w-6 text-white/10" />
            <p className="text-white/30 text-[11.5px]">No polls yet.</p>
          </div>
        )}
      </div>

      {isInstructor && (
        <div className="p-3 border-t border-white/10 shrink-0">
          {!showCreate ? (
            <button onClick={() => setShowCreate(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 rounded-lg text-[11.5px] font-semibold transition-colors">
              <PlusCircle className="h-3.5 w-3.5" />Create Poll
            </button>
          ) : (
            <div className="space-y-2">
              <input value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="Poll question…"
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-[12px] text-white placeholder-white/30 focus:outline-none" />
              {newOptions.map((opt, i) => (
                <div key={i} className="flex gap-1">
                  <input value={opt} onChange={(e) => { const o = [...newOptions]; o[i] = e.target.value; setNewOptions(o); }}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 bg-white/10 border border-white/20 rounded-lg px-2 py-1.5 text-[11.5px] text-white placeholder-white/30 focus:outline-none" />
                  {newOptions.length > 2 && (
                    <button onClick={() => setNewOptions(newOptions.filter((_, j) => j !== i))}
                      className="text-white/25 hover:text-red-400 transition-colors px-1">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
              {newOptions.length < 6 && (
                <button onClick={() => setNewOptions([...newOptions, ""])}
                  className="text-[10.5px] text-white/30 hover:text-white/50 flex items-center gap-1 transition-colors">
                  <PlusCircle className="h-2.5 w-2.5" />Add option
                </button>
              )}
              <div className="flex gap-1.5 pt-0.5">
                <button
                  onClick={() => createPoll({ classId, data: { question: newQuestion, options: newOptions.filter(Boolean) } })}
                  disabled={creating || !newQuestion.trim() || newOptions.filter(Boolean).length < 2}
                  className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-[11.5px] font-bold transition-colors">
                  {creating ? "Launching…" : "Launch Poll"}
                </button>
                <button onClick={() => setShowCreate(false)}
                  className="px-2.5 py-1.5 text-white/30 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Info Panel
══════════════════════════════════════════════════════════════════ */
interface LiveClassInfo {
  title: string;
  description?: string | null;
  scheduledAt: string | Date;
  duration?: number | null;
  instructorName?: string | null;
  courseName?: string | null;
  courseId?: number | null;
  agenda?: string | null;
  registrationCount?: number;
  status: string;
}
function InfoPanel({ cls, participantCount }: { cls: LiveClassInfo; participantCount: number }) {
  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-1.5">Session</p>
        <p className="text-[13.5px] font-bold text-white leading-snug">{cls.title}</p>
        {cls.description && <p className="text-[11.5px] text-white/45 mt-1 leading-relaxed">{cls.description}</p>}
      </div>
      <div className="space-y-2">
        {cls.courseName && (
          <div className="flex items-center gap-2 text-[11.5px]">
            <BookOpen className="h-3.5 w-3.5 text-white/20 shrink-0" />
            <Link href={`/courses/${cls.courseId}`} className="text-blue-400 hover:text-blue-300 transition-colors">
              {cls.courseName}
            </Link>
          </div>
        )}
        <div className="flex items-center gap-2 text-[11.5px] text-white/45">
          <Calendar className="h-3.5 w-3.5 text-white/20 shrink-0" />
          <span>{formatTime(cls.scheduledAt)}</span>
        </div>
        {cls.duration && (
          <div className="flex items-center gap-2 text-[11.5px] text-white/45">
            <Clock className="h-3.5 w-3.5 text-white/20 shrink-0" />
            <span>{durStr(cls.duration)}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-[11.5px] text-white/45">
          <Users className="h-3.5 w-3.5 text-white/20 shrink-0" />
          <span>{cls.registrationCount} registered · {participantCount} in room</span>
        </div>
        {cls.instructorName && (
          <div className="flex items-center gap-2 text-[11.5px] text-white/45">
            <Video className="h-3.5 w-3.5 text-white/20 shrink-0" />
            <span>Hosted by <span className="text-white/65 font-medium">{cls.instructorName}</span></span>
          </div>
        )}
      </div>
      {cls.agenda && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-1.5">Agenda</p>
          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <p className="text-[11.5px] text-white/55 leading-relaxed whitespace-pre-line">{cls.agenda}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   LiveKit video area — inner components (must be inside LiveKitRoom)
══════════════════════════════════════════════════════════════════ */
function LiveKitGrid({
  onJoined,
  onParticipantCount,
  onAudioMuted,
  onVideoMuted,
}: {
  onJoined: () => void;
  onParticipantCount: (n: number) => void;
  onAudioMuted: (m: boolean) => void;
  onVideoMuted: (m: boolean) => void;
}) {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const joined = useRef(false);
  useEffect(() => {
    if (!joined.current && localParticipant) {
      joined.current = true;
      onJoined();
    }
  }, [localParticipant, onJoined]);

  useEffect(() => {
    onParticipantCount(participants.length);
  }, [participants.length, onParticipantCount]);

  useEffect(() => {
    if (!localParticipant) return;
    onAudioMuted(!localParticipant.isMicrophoneEnabled);
    onVideoMuted(!localParticipant.isCameraEnabled);
  }, [localParticipant?.isMicrophoneEnabled, localParticipant?.isCameraEnabled, onAudioMuted, onVideoMuted, localParticipant]);

  return (
    <div className="flex flex-col h-full" data-lk-theme="default">
      <div className="flex-1 min-h-0">
        <GridLayout tracks={tracks} style={{ height: "100%" }}>
          <ParticipantTile />
        </GridLayout>
      </div>
      <div className="shrink-0 bg-slate-900 border-t border-slate-700/50">
        <ControlBar
          variation="minimal"
          controls={{ microphone: true, camera: true, screenShare: true, leave: false, chat: false }}
        />
      </div>
    </div>
  );
}

function LiveKitVideoArea({
  token,
  serverUrl,
  onJoined,
  onDisconnected,
  onParticipantCount,
  onAudioMuted,
  onVideoMuted,
}: {
  token: string;
  serverUrl: string;
  onJoined: () => void;
  onDisconnected: () => void;
  onParticipantCount: (n: number) => void;
  onAudioMuted: (m: boolean) => void;
  onVideoMuted: (m: boolean) => void;
}) {
  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect
      audio
      video={false}
      onDisconnected={onDisconnected}
      style={{ height: "100%", background: "transparent" }}
    >
      <LiveKitGrid
        onJoined={onJoined}
        onParticipantCount={onParticipantCount}
        onAudioMuted={onAudioMuted}
        onVideoMuted={onVideoMuted}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Main live room
══════════════════════════════════════════════════════════════════ */
type SidebarTab = "chat" | "qa" | "polls" | "info";

export default function LiveRoom() {
  const [, params] = useRoute<{ classId: string }>("/live/:classId/room");
  const classId = params?.classId ? parseInt(params.classId) : 0;
  const [, navigate] = useLocation();
  const { user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: cls, isLoading } = useGetLiveClass(classId, {
    query: {
      enabled: classId > 0,
      queryKey: getGetLiveClassQueryKey(classId),
      refetchInterval: 10_000,
    },
  });

  const { mutateAsync: startClass, isPending: starting } = useStartLiveClass();
  const { mutateAsync: endClass, isPending: ending } = useEndLiveClass();

  const isInstructor = !!user && cls?.instructorId === user.id;

  /* ─── LiveKit state ──────────────────────────────────────────── */
  const [roomJoined, setRoomJoined] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [audioMuted, setAudioMuted] = useState(true);
  const [videoMuted, setVideoMuted] = useState(true);

  const isLiveStatus = cls?.status === "live";

  const { data: livekitToken, error: tokenError } = useQuery({
    queryKey: ["livekit-token", classId],
    queryFn: async () => {
      const res = await fetch(`/api/live-classes/${classId}/token`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to get room token");
      }
      return res.json() as Promise<{ token: string; url: string }>;
    },
    enabled: isLiveStatus && classId > 0,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  /* ─── Sidebar state ──────────────────────────────────────────── */
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLiveKitJoined = useCallback(() => setRoomJoined(true), []);
  const handleLiveKitDisconnected = useCallback(() => {
    setRoomJoined(false);
    if (!isInstructor) navigate("/live");
  }, [isInstructor, navigate]);

  const handleStart = async () => {
    try {
      await startClass({ classId });
      await qc.invalidateQueries({ queryKey: getGetLiveClassQueryKey(classId) });
      toast({ title: "Session started! Room is now live." });
    } catch {
      toast({ title: "Could not start session", variant: "destructive" });
    }
  };

  const handleEnd = async () => {
    if (!confirm("End this session for all participants?")) return;
    try {
      await endClass({ classId });
      await qc.invalidateQueries({ queryKey: getGetLiveClassQueryKey(classId) });
      toast({ title: "Session ended." });
      setTimeout(() => navigate("/live"), 1500);
    } catch {
      toast({ title: "Could not end session", variant: "destructive" });
    }
  };

  if (isLoading || !cls) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  const isLive = cls.status === "live";
  const isCompleted = cls.status === "completed";
  const isScheduled = cls.status === "scheduled";

  const sidebarTabs: { k: SidebarTab; label: string; icon: typeof MessageSquare }[] = [
    { k: "chat", label: "Chat", icon: MessageSquare },
    { k: "qa", label: "Q&A", icon: Hand },
    { k: "polls", label: "Polls", icon: BarChart2 },
    { k: "info", label: "Info", icon: Info },
  ];

  return (
    <div className="h-screen bg-slate-950 flex flex-col overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────── */}
      <div className="shrink-0 bg-slate-900 border-b border-slate-700/50 px-4 py-2.5 flex items-center gap-3">
        <Link href="/live"
          className="flex items-center gap-1.5 text-white/40 hover:text-white text-[12px] font-medium transition-colors shrink-0">
          <ArrowLeft className="h-3.5 w-3.5" />
          Sessions
        </Link>
        <span className="text-white/20 shrink-0">/</span>

        {cls.courseName && (
          <>
            <Link href={`/courses/${cls.courseId}`}
              className="text-blue-400/70 hover:text-blue-400 text-[12px] font-medium transition-colors truncate max-w-[120px] shrink-0">
              {cls.courseName}
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-white/20 shrink-0" />
          </>
        )}

        <span className="text-white/70 text-[13px] font-semibold truncate flex-1">{cls.title}</span>

        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={cls.status} />

          {isLive && roomJoined && (
            <span className="flex items-center gap-1.5 text-[12px] text-white/50">
              <Users className="h-3.5 w-3.5" />{participantCount}
            </span>
          )}

          {isInstructor && isLive && (
            <div className="flex items-center gap-1.5 border-l border-slate-700 pl-2.5">
              <button onClick={handleEnd} disabled={ending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[12px] font-bold transition-colors disabled:opacity-60">
                <PhoneOff className="h-3.5 w-3.5" />End Session
              </button>
            </div>
          )}

          {/* Sidebar toggle (live only) */}
          {isLive && (
            <button onClick={() => setSidebarOpen(!sidebarOpen)}
              title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors border-l border-slate-700 pl-2.5">
              {sidebarOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* ── Main area ────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* Video / waiting */}
        <div className="flex-1 min-w-0 relative">
          {isLive && livekitToken && (
            <LiveKitVideoArea
              token={livekitToken.token}
              serverUrl={livekitToken.url}
              onJoined={handleLiveKitJoined}
              onDisconnected={handleLiveKitDisconnected}
              onParticipantCount={setParticipantCount}
              onAudioMuted={setAudioMuted}
              onVideoMuted={setVideoMuted}
            />
          )}

          {isLive && !livekitToken && !tokenError && (
            <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center gap-4 z-10">
              <Wifi className="h-5 w-5 text-blue-400 animate-pulse" />
              <span className="text-white/60 text-[14px]">Connecting to room…</span>
            </div>
          )}

          {isLive && tokenError && (
            <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center gap-3 z-10 p-8">
              <AlertTriangle className="h-8 w-8 text-amber-400" />
              <p className="text-white/70 text-[14px] font-medium text-center">Could not connect to video room</p>
              <p className="text-white/35 text-[12px] text-center">{(tokenError as Error).message}</p>
            </div>
          )}

          {!isLive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-slate-950 via-blue-950/30 to-slate-950 p-8">
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
                <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-600/5 rounded-full blur-3xl" />
              </div>
              <div className="relative z-10 text-center max-w-lg space-y-6">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-left space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      {cls.courseName && (
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-400/70 mb-1">{cls.courseName}</p>
                      )}
                      <h1 className="text-white font-bold text-[22px] leading-snug">{cls.title}</h1>
                      {cls.description && <p className="text-white/40 text-[13px] mt-1 leading-relaxed">{cls.description}</p>}
                    </div>
                    <StatusBadge status={cls.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { Icon: Calendar, label: formatTime(cls.scheduledAt) },
                      { Icon: Clock, label: cls.duration ? durStr(cls.duration) : "Duration TBD" },
                      { Icon: Users, label: `${cls.registrationCount} registered` },
                      { Icon: BookOpen, label: cls.instructorName ?? "Instructor" },
                    ].map(({ Icon, label }) => (
                      <div key={label} className="flex items-center gap-2 text-[12px] text-white/45">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-white/25" />
                        {label}
                      </div>
                    ))}
                  </div>
                  {cls.agenda && (
                    <div className="pt-2 border-t border-white/10">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-1">Agenda</p>
                      <p className="text-[11.5px] text-white/45 leading-relaxed whitespace-pre-line">{cls.agenda}</p>
                    </div>
                  )}
                </div>

                {isCompleted ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 justify-center text-white/40 text-[14px]">
                      <WifiOff className="h-4 w-4" />This session has ended
                    </div>
                    {cls.replayUrl ? (
                      <a href={cls.replayUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-[14px] transition-colors">
                        <Play className="h-4 w-4" />Watch Replay
                      </a>
                    ) : (
                      <p className="text-white/30 text-[13px]">Replay not available yet</p>
                    )}
                  </div>
                ) : isScheduled && isInstructor ? (
                  <div className="space-y-3">
                    <p className="text-white/50 text-[13px]">You're the instructor. Start when ready.</p>
                    <button onClick={handleStart} disabled={starting}
                      className="inline-flex items-center gap-2.5 px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-[15px] transition-colors disabled:opacity-60 shadow-lg shadow-blue-900/30">
                      {starting ? <><Loader2 className="h-5 w-5 animate-spin" />Starting…</> : <><Video className="h-5 w-5" />Start Session</>}
                    </button>
                  </div>
                ) : isScheduled ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 justify-center">
                      <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                      <p className="text-white/50 text-[14px]">Waiting for the instructor to start…</p>
                    </div>
                    <p className="text-white/25 text-[12px]">The room will open automatically.</p>
                  </div>
                ) : null}
              </div>
            </div>
          )}

        </div>

        {/* ── Sidebar ──────────────────────────────────────────── */}
        {isLive && sidebarOpen && (
          <div className="w-[280px] shrink-0 flex flex-col bg-slate-900 border-l border-slate-700/50">
            {/* Tab bar */}
            <div className="shrink-0 grid grid-cols-4 border-b border-slate-700/50">
              {sidebarTabs.map(({ k, label, icon: Icon }) => (
                <button key={k} onClick={() => setSidebarTab(k)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors",
                    sidebarTab === k
                      ? "text-blue-400 border-b-2 border-blue-400 -mb-px"
                      : "text-white/30 hover:text-white/55",
                  )}>
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
            {/* Tab content */}
            <div className="flex-1 min-h-0">
              {sidebarTab === "chat" && user && (
                <ChatPanel classId={classId} currentUserId={user.id} />
              )}
              {sidebarTab === "qa" && (
                <QAPanel classId={classId} isInstructor={isInstructor} />
              )}
              {sidebarTab === "polls" && (
                <PollsPanel classId={classId} isInstructor={isInstructor} />
              )}
              {sidebarTab === "info" && (
                <InfoPanel cls={cls} participantCount={participantCount} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom status bar ────────────────────────────────────── */}
      {isLive && roomJoined && (
        <div className="shrink-0 bg-slate-900/80 border-t border-slate-700/30 px-6 py-1.5 flex items-center gap-6 text-[11px] text-white/30">
          <span className={cn("flex items-center gap-1.5", audioMuted && "text-red-400/60")}>
            {audioMuted ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
            {audioMuted ? "Muted" : "Mic on"}
          </span>
          <span className={cn("flex items-center gap-1.5", videoMuted && "text-red-400/60")}>
            {videoMuted ? <VideoOff className="h-3 w-3" /> : <Video className="h-3 w-3" />}
            {videoMuted ? "Camera off" : "Camera on"}
          </span>
          <span className="flex items-center gap-1.5 ml-auto">
            <Users className="h-3 w-3" />{participantCount} in room
          </span>
        </div>
      )}
    </div>
  );
}
