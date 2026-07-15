import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useGetAdminStats, useListUsers, getGetAdminStatsQueryKey, useListLiveClasses, useCreateLiveClass, getListLiveClassesQueryKey, useListChannels, useCreateChannel, useUpdateChannel, useDeleteChannel, getListChannelsQueryKey, useListCourses, type CommunityChannel } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { cn } from "@/lib/utils";
import {
  Users, BookOpen, TrendingUp, Calendar, UserPlus, Activity,
  GraduationCap, Award, Zap, BarChart3, Trash2, ShieldCheck,
  ShieldAlert, RefreshCw, Star, StarOff, CheckCircle, XCircle,
  Clock, ChevronDown, ChevronUp, BookMarked, FileText,
  MessageSquare, Pin, PinOff, MessageCircle, KeyRound, DollarSign,
  Video, CalendarPlus, Megaphone, MapPin, Send, ImageIcon, Trash2 as Trash2Icon, Mail,
  Hash, Pencil, Plus, Search, AlertTriangle, Loader2, Check, X,
  Layout, ExternalLink, Save, Server, Eye, EyeOff, Wifi, WifiOff,
  ChevronLeft, ChevronRight, Upload, Lock, Unlock,
} from "lucide-react";

/* ─── helpers ─── */
function RoleBadge({ role }: { role: string }) {
  const cls =
    role === "admin" ? "text-red-400 border-red-400/30" :
    role === "instructor" ? "text-purple-400 border-purple-400/30" :
    "text-muted-foreground";
  return <Badge variant="outline" className={cls}>{role}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "published" ? "text-green-400 border-green-400/30" :
    status === "archived" ? "text-muted-foreground" :
    "text-amber-400 border-amber-400/30";
  return <Badge variant="outline" className={cls}>{status}</Badge>;
}

function EnrollBadge({ status }: { status: string }) {
  const cls =
    status === "completed" ? "text-green-400 border-green-400/30" :
    status === "active" ? "text-blue-400 border-blue-400/30" :
    "text-muted-foreground";
  return <Badge variant="outline" className={cls}>{status}</Badge>;
}

/* ─── Grant Access Dialog ─── */
type CourseOption = { id: number; title: string; price: string | null; status: string };
type UserOption  = { id: string; displayName: string | null; email: string | null };

function GrantAccessDialog({
  open, onOpenChange, prefilledUser, onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefilledUser?: UserOption | null;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const { data: allUsers } = useListUsers({});
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<number>>(new Set());
  const [courseSearch, setCourseSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/admin/courses")
      .then((r) => r.ok ? r.json() : [])
      .then((data: CourseOption[]) => setCourses(data.filter((c) => c.status === "published")))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSelectedUserId(""); setSelectedCourseIds(new Set());
      setUserSearch(""); setCourseSearch(""); setProgress(null);
    }
  }, [open]);

  const effectiveUserId = prefilledUser ? prefilledUser.id : selectedUserId;
  const effectiveUserName = prefilledUser
    ? (prefilledUser.displayName ?? prefilledUser.email ?? prefilledUser.id)
    : (allUsers?.find((u) => u.id === selectedUserId)?.displayName ?? allUsers?.find((u) => u.id === selectedUserId)?.email ?? "");

  const filteredUsers = (allUsers ?? []).filter((u) =>
    !userSearch ||
    (u.displayName ?? "").toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.email ?? "").toLowerCase().includes(userSearch.toLowerCase())
  ).slice(0, 50);

  const filteredCourses = courses.filter((c) =>
    !courseSearch || c.title.toLowerCase().includes(courseSearch.toLowerCase())
  );

  const toggleCourse = (id: number) => {
    setSelectedCourseIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedCourseIds.size === filteredCourses.length) {
      setSelectedCourseIds(new Set());
    } else {
      setSelectedCourseIds(new Set(filteredCourses.map((c) => c.id)));
    }
  };

  const hasPaidSelected = courses.some(
    (c) => selectedCourseIds.has(c.id) && parseFloat(c.price ?? "0") > 0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId || selectedCourseIds.size === 0) return;
    setSubmitting(true);
    const ids = Array.from(selectedCourseIds);
    setProgress({ done: 0, total: ids.length });
    let succeeded = 0;
    let firstError: string | null = null;
    for (let i = 0; i < ids.length; i++) {
      try {
        const r = await fetch("/api/admin/enroll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: effectiveUserId, courseId: ids[i] }),
        });
        const data = await r.json();
        if (r.ok) { succeeded++; }
        else if (!firstError) { firstError = data.error ?? "Failed"; }
      } catch {
        if (!firstError) firstError = "Network error";
      }
      setProgress({ done: i + 1, total: ids.length });
    }
    setSubmitting(false);
    setProgress(null);
    if (succeeded > 0) {
      toast({
        title: succeeded === ids.length ? "Access granted!" : `Granted ${succeeded} of ${ids.length}`,
        description: `${effectiveUserName} now has access to ${succeeded} course${succeeded !== 1 ? "s" : ""}.`,
      });
      onSuccess();
      onOpenChange(false);
    } else {
      toast({ title: "Failed to grant access", description: firstError ?? "Unknown error", variant: "destructive" });
    }
  };

  const allFilteredSelected = filteredCourses.length > 0 && filteredCourses.every((c) => selectedCourseIds.has(c.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <KeyRound className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold leading-tight">Grant Course Access</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Enroll a user in one or more courses, bypassing payment.</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* User card */}
          {prefilledUser ? (
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-muted/60 border border-border overflow-hidden">
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                {(prefilledUser.displayName ?? prefilledUser.email ?? "U").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{prefilledUser.displayName ?? "—"}</p>
                <p className="text-xs text-muted-foreground truncate">{prefilledUser.email}</p>
              </div>
              <span className="ml-auto text-[10px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full shrink-0">Student</span>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Select Student</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search by name or email…"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
              <div className="max-h-36 overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-background">
                {filteredUsers.length === 0 ? (
                  <p className="py-5 text-center text-xs text-muted-foreground">No users found</p>
                ) : filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedUserId(u.id)}
                    className={`w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center gap-2.5 first:rounded-t-xl last:rounded-b-xl border-b border-border last:border-0 ${
                      selectedUserId === u.id
                        ? "bg-primary/8 text-foreground"
                        : "hover:bg-muted/60 text-foreground"
                    }`}
                  >
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                      {(u.displayName ?? u.email ?? "U").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-xs">{u.displayName ?? "—"}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                    </div>
                    {selectedUserId === u.id && (
                      <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <CheckCircle className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Course multi-select */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">
                Select Courses
                {selectedCourseIds.size > 0 && (
                  <span className="ml-2 text-[11px] font-semibold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                    {selectedCourseIds.size} selected
                  </span>
                )}
              </label>
              {filteredCourses.length > 1 && (
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-[11px] text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  {allFilteredSelected ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>

            {courses.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading courses…
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Filter courses…"
                    value={courseSearch}
                    onChange={(e) => setCourseSearch(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                </div>
                <div className="max-h-52 overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-background">
                  {filteredCourses.length === 0 ? (
                    <p className="py-5 text-center text-xs text-muted-foreground">No courses match</p>
                  ) : filteredCourses.map((c) => {
                    const checked = selectedCourseIds.has(c.id);
                    const paid = parseFloat(c.price ?? "0") > 0;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCourse(c.id)}
                        className={`w-full text-left px-3.5 py-3 transition-colors flex items-center gap-3 first:rounded-t-xl last:rounded-b-xl border-b border-border last:border-0 ${
                          checked ? "bg-primary/8" : "hover:bg-muted/60"
                        }`}
                      >
                        {/* Checkbox */}
                        <div className={`w-4.5 h-4.5 rounded flex items-center justify-center border-2 shrink-0 transition-all ${
                          checked ? "bg-primary border-primary" : "border-border bg-background"
                        }`}>
                          {checked && <CheckCircle className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        <BookOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="flex-1 text-sm truncate font-medium">{c.title}</span>
                        {paid ? (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 shrink-0">
                            ${parseFloat(c.price!).toFixed(0)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground shrink-0">Free</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Paid course warning */}
          {hasPaidSelected && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
              <span>One or more selected courses are paid. Granting access will bypass payment for this user.</span>
            </div>
          )}

          {/* Progress bar while submitting multiple */}
          {progress && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Granting access…</span>
                <span>{progress.done} / {progress.total}</span>
              </div>
              <div className="h-1.5 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2.5 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 gap-1.5"
              disabled={submitting || !effectiveUserId || selectedCourseIds.size === 0}
            >
              <KeyRound className="h-3.5 w-3.5" />
              {submitting
                ? "Granting…"
                : selectedCourseIds.size > 1
                  ? `Grant Access to ${selectedCourseIds.size} Courses`
                  : "Grant Access"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Paginator ─── */
const PAGE_SIZE = 25;
function Paginator({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);
  return (
    <div className="flex items-center justify-between px-1 pt-3">
      <span className="text-xs text-muted-foreground">
        {total === 0 ? "No records" : `${start}–${end} of ${total}`}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button onClick={() => onChange(page - 1)} disabled={page === 1}
            className="h-7 w-7 rounded-md border border-border flex items-center justify-center hover:bg-secondary disabled:opacity-40 transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          {(() => {
            const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1);
            const items: (number | string)[] = [];
            pages.forEach((p, i) => {
              if (i > 0 && pages[i - 1] < p - 1) items.push("…");
              items.push(p);
            });
            return items.map((p, i) => p === "…" ? (
              <span key={`e${i}`} className="text-xs text-muted-foreground px-1">…</span>
            ) : (
              <button key={p} onClick={() => onChange(p as number)}
                className={cn("h-7 w-7 rounded-md text-xs font-medium border transition-colors",
                  p === page ? "bg-primary text-white border-primary" : "border-border hover:bg-secondary")}>
                {p}
              </button>
            ));
          })()}
          <button onClick={() => onChange(page + 1)} disabled={page === totalPages}
            className="h-7 w-7 rounded-md border border-border flex items-center justify-center hover:bg-secondary disabled:opacity-40 transition-colors">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── types ─── */
type DetailedStats = { totalUsers: number; totalCourses: number; publishedCourses: number; totalEnrollments: number; activeEnrollments: number; completedEnrollments: number; instructors: number; admins: number; newUsersWeek: number; newUsersMonth: number; totalLessons: number; totalQuizAttempts: number; totalCertificates: number; totalXpAwarded: number; };
type AdminCourse = { id: number; title: string; status: string; level: string | null; category: string | null; subCategory: string | null; price: string | null; instructorName: string; enrollments: number; isFeatured: boolean | null; createdAt: string; };
type AdminEnrollment = { id: number; userId: string; courseId: number; status: string; enrolledAt: string; completedAt: string | null; userName: string; userEmail: string; courseTitle: string; groupName: string | null; };
type AdminActivity = { id: number; type: string; userId: string | null; userName: string | null; description: string | null; metadata: unknown; createdAt: string; };
type AdminUser = { id: string; email: string; displayName: string | null; role: string; plan: string; xp: number; createdAt: string; };

/* ─── Overview Tab ─── */
function OverviewTab() {
  const { data: basicStats, isLoading: basicLoading } = useGetAdminStats({ query: { queryKey: getGetAdminStatsQueryKey() } });
  const [stats, setStats] = useState<DetailedStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/stats/detailed").then((r) => r.json()).then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const allLoading = basicLoading || loading;

  const cards = [
    { label: "Total Users", value: stats?.totalUsers, icon: Users, color: "text-blue-400" },
    { label: "Instructors", value: stats?.instructors, icon: ShieldCheck, color: "text-purple-400" },
    { label: "New This Week", value: stats?.newUsersWeek, icon: UserPlus, color: "text-cyan-400" },
    { label: "New This Month", value: stats?.newUsersMonth, icon: TrendingUp, color: "text-indigo-400" },
    { label: "Total Courses", value: stats?.totalCourses, icon: BookOpen, color: "text-green-400" },
    { label: "Published Courses", value: stats?.publishedCourses, icon: CheckCircle, color: "text-emerald-400" },
    { label: "Total Lessons", value: stats?.totalLessons, icon: FileText, color: "text-teal-400" },
    { label: "Enrollments", value: stats?.totalEnrollments, icon: GraduationCap, color: "text-orange-400" },
    { label: "Active Enrollments", value: stats?.activeEnrollments, icon: Activity, color: "text-amber-400" },
    { label: "Completions", value: stats?.completedEnrollments, icon: Award, color: "text-yellow-400" },
    { label: "Certificates Issued", value: stats?.totalCertificates, icon: BookMarked, color: "text-rose-400" },
    { label: "Total XP Awarded", value: stats?.totalXpAwarded, icon: Zap, color: "text-violet-400" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground leading-tight">{label}</CardTitle>
              <Icon className={`h-4 w-4 shrink-0 ${color}`} />
            </CardHeader>
            <CardContent>
              {allLoading ? <Skeleton className="h-7 w-20" /> : <div className="text-2xl font-bold">{(value ?? 0).toLocaleString()}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {!loading && stats && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-sm">Enrollment Breakdown</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "Active", value: stats.activeEnrollments, total: stats.totalEnrollments, color: "bg-blue-500" },
                { label: "Completed", value: stats.completedEnrollments, total: stats.totalEnrollments, color: "bg-green-500" },
              ].map(({ label, value, total, color }) => (
                <div key={label} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{value} <span className="text-muted-foreground text-xs">/ {total}</span></span>
                  </div>
                  <Progress value={total > 0 ? Math.round((value / total) * 100) : 0} className="h-1.5" />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Course Status</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "Published", value: stats.publishedCourses, total: stats.totalCourses, color: "bg-green-500" },
                { label: "Draft / Archived", value: stats.totalCourses - stats.publishedCourses, total: stats.totalCourses, color: "bg-amber-500" },
              ].map(({ label, value, total, color }) => (
                <div key={label} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{value} <span className="text-muted-foreground text-xs">/ {total}</span></span>
                  </div>
                  <Progress value={total > 0 ? Math.round((value / total) * 100) : 0} className="h-1.5" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ─── Users Tab ─── */
function RegistrationToggleCard() {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/site-settings/registration_open")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || data.value === undefined || data.value === null) {
          setIsOpen(true); // default open
        } else {
          // GET endpoint returns JSON.parse(row.value): boolean false or string "false" both mean closed
          setIsOpen(data.value !== false && data.value !== "false");
        }
      })
      .catch(() => setIsOpen(true));
  }, []);

  const toggle = async (open: boolean) => {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/site-settings/registration_open", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: open }),
      });
      if (!r.ok) throw new Error("Failed");
      setIsOpen(open);
      toast({ title: open ? "Registration opened" : "Registration locked", description: open ? "New users can now register." : "New user registration is now disabled." });
    } catch {
      toast({ title: "Failed to update registration setting", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {isOpen ? <Unlock className="h-4 w-4 text-green-500" /> : <Lock className="h-4 w-4 text-red-500" />}
          Registration
        </CardTitle>
        <p className="text-sm text-muted-foreground">Control whether new users can create accounts on the platform.</p>
      </CardHeader>
      <CardContent>
        {isOpen === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${isOpen ? "bg-green-500" : "bg-red-500"}`} />
              <span className="text-sm font-medium">{isOpen ? "Open — new users can register" : "Locked — registration disabled"}</span>
            </div>
            <div className="flex gap-2">
              {isOpen ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => toggle(false)}
                  className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Lock className="h-3.5 w-3.5 mr-1.5" />}
                  Lock Registration
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() => toggle(true)}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Unlock className="h-3.5 w-3.5 mr-1.5" />}
                  Open Registration
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UsersTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: users, isLoading } = useListUsers({});
  const [search, setSearch] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [editXpUser, setEditXpUser] = useState<AdminUser | null>(null);
  const [xpValue, setXpValue] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [grantUser, setGrantUser] = useState<UserOption | null>(null);

  const changeRole = async (userId: string, role: string) => {
    setActing(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
      if (!res.ok) throw new Error();
      toast({ title: `Role changed to ${role}` });
      qc.invalidateQueries({ queryKey: ["listUsers"] });
    } catch { toast({ title: "Failed to change role", variant: "destructive" }); }
    finally { setActing(null); }
  };

  const changePlan = async (userId: string, plan: string) => {
    setActing(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/plan`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
      if (!res.ok) throw new Error();
      toast({ title: `Plan changed to ${plan}` });
      qc.invalidateQueries({ queryKey: ["listUsers"] });
    } catch { toast({ title: "Failed to change plan", variant: "destructive" }); }
    finally { setActing(null); }
  };

  const saveXp = async () => {
    if (!editXpUser) return;
    const xp = parseInt(xpValue);
    if (isNaN(xp) || xp < 0) { toast({ title: "Enter a valid XP value", variant: "destructive" }); return; }
    setActing(editXpUser.id);
    try {
      const res = await fetch(`/api/admin/users/${editXpUser.id}/xp`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ xp }) });
      if (!res.ok) throw new Error();
      toast({ title: `XP updated to ${xp.toLocaleString()}` });
      setEditXpUser(null);
      qc.invalidateQueries({ queryKey: ["listUsers"] });
    } catch { toast({ title: "Failed to update XP", variant: "destructive" }); }
    finally { setActing(null); }
  };

  const deleteUser = async (userId: string, name: string) => {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    setActing(userId);
    try {
      await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      toast({ title: "User deleted" });
      qc.invalidateQueries({ queryKey: ["listUsers"] });
    } catch { toast({ title: "Failed to delete user", variant: "destructive" }); }
    finally { setActing(null); }
  };

  const makeTrader = async (userId: string, displayName: string) => {
    setActing(userId);
    try {
      const res = await fetch("/api/admin/trading/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, displayName: displayName || "Trader" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast({ title: data.alreadyExists ? "Already a trader" : `${displayName} promoted to trader` });
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Failed to promote", variant: "destructive" });
    } finally { setActing(null); }
  };

  const filtered = (users ?? []).filter((u) =>
    !search || (u.displayName ?? "").toLowerCase().includes(search.toLowerCase()) || (u.email ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const pagedUsers = filtered.slice((userPage - 1) * PAGE_SIZE, userPage * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <RegistrationToggleCard />

      <div className="flex items-center gap-3">
        <Input placeholder="Search users…" value={search} onChange={(e) => { setSearch(e.target.value); setUserPage(1); }} className="max-w-xs" />
        <Badge variant="outline" className="ml-auto">{filtered.length} user{filtered.length !== 1 ? "s" : ""}</Badge>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : (
        <>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40">
              <tr className="border-b border-border text-muted-foreground text-xs">
                <th className="text-left px-4 py-3 font-medium">User</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Plan</th>
                <th className="text-right px-4 py-3 font-medium">XP</th>
                <th className="text-right px-4 py-3 font-medium">Joined</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedUsers.map((user) => (
                <tr key={user.id} className="border-b border-border/40 hover:bg-secondary/20 transition-colors" data-testid={`row-user-${user.id}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {((user.displayName ?? user.email ?? "U").charAt(0)).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate max-w-[160px]">{user.displayName ?? "—"}</p>
                        <p className="text-[11px] text-muted-foreground truncate max-w-[160px]">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Select value={user.role} onValueChange={(v) => changeRole(user.id, v)} disabled={acting === user.id}>
                      <SelectTrigger className="h-7 w-32 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student">Student</SelectItem>
                        <SelectItem value="instructor">Instructor</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <Select value={(user as AdminUser).plan ?? "free"} onValueChange={(v) => changePlan(user.id, v)} disabled={acting === user.id}>
                      <SelectTrigger className="h-7 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">Free</SelectItem>
                        <SelectItem value="pro">Pro</SelectItem>
                        <SelectItem value="premium">Premium ⭐</SelectItem>
                        <SelectItem value="elite">Elite 💎</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="font-mono font-semibold text-primary hover:underline text-sm"
                      onClick={() => { setEditXpUser(user as AdminUser); setXpValue(String(user.xp ?? 0)); }}
                    >
                      {(user.xp ?? 0).toLocaleString()}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right text-[11px] text-muted-foreground">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm" variant="outline"
                        className="h-7 px-2 gap-1 text-xs text-primary border-primary/30 hover:bg-primary/5"
                        title="Grant course access"
                        onClick={() => setGrantUser({ id: user.id, displayName: user.displayName ?? null, email: user.email ?? null })}
                        disabled={acting === user.id}
                      >
                        <KeyRound className="h-3 w-3" /> Access
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        className="h-7 px-2 gap-1 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                        title="Promote to trader"
                        onClick={() => makeTrader(user.id, user.displayName ?? user.email ?? "Trader")}
                        disabled={acting === user.id}
                      >
                        <TrendingUp className="h-3 w-3" /> Trader
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive h-7 px-2" onClick={() => deleteUser(user.id, user.displayName ?? user.email ?? user.id)} disabled={acting === user.id}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginator page={userPage} total={filtered.length} onChange={setUserPage} />
        </>
      )}

      {/* Edit XP Dialog */}
      <Dialog open={!!editXpUser} onOpenChange={(v) => !v && setEditXpUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Adjust XP — {editXpUser?.displayName ?? editXpUser?.email}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <label className="text-sm font-medium block mb-1.5">New XP Value</label>
              <Input type="number" min="0" value={xpValue} onChange={(e) => setXpValue(e.target.value)} placeholder="Enter XP amount" />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={saveXp} disabled={acting === editXpUser?.id}>{acting === editXpUser?.id ? "Saving…" : "Save XP"}</Button>
              <Button variant="outline" onClick={() => setEditXpUser(null)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Grant Access Dialog */}
      <GrantAccessDialog
        open={!!grantUser}
        onOpenChange={(v) => !v && setGrantUser(null)}
        prefilledUser={grantUser}
        onSuccess={() => qc.invalidateQueries({ queryKey: ["listUsers"] })}
      />
    </div>
  );
}

/* ─── Courses Tab ─── */
function CoursesTab() {
  const { toast } = useToast();
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [acting, setActing] = useState<number | null>(null);
  const [editingSubCat, setEditingSubCat] = useState<number | null>(null);
  const [subCatInput, setSubCatInput] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/courses");
      if (res.ok) setCourses(await res.json());
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (id: number, status: string) => {
    setActing(id);
    try {
      await fetch(`/api/admin/courses/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      toast({ title: `Course ${status}` });
      load();
    } catch { toast({ title: "Failed", variant: "destructive" }); }
    finally { setActing(null); }
  };

  const toggleFeatured = async (id: number, cur: boolean) => {
    setActing(id);
    try {
      await fetch(`/api/admin/courses/${id}/featured`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isFeatured: !cur }) });
      toast({ title: !cur ? "Marked as featured" : "Removed from featured" });
      load();
    } catch { toast({ title: "Failed", variant: "destructive" }); }
    finally { setActing(null); }
  };

  const deleteCourse = async (id: number, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setActing(id);
    try {
      await fetch(`/api/admin/courses/${id}`, { method: "DELETE" });
      toast({ title: "Course deleted" });
      load();
    } catch { toast({ title: "Failed to delete", variant: "destructive" }); }
    finally { setActing(null); }
  };

  const openSubCatEdit = (c: AdminCourse) => {
    setEditingSubCat(c.id);
    setSubCatInput(c.subCategory ?? "");
  };

  const saveSubCat = async (id: number) => {
    try {
      await fetch(`/api/courses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subCategory: subCatInput.trim() || null }),
      });
      toast({ title: "Sub-category saved" });
      setEditingSubCat(null);
      load();
    } catch { toast({ title: "Failed to save", variant: "destructive" }); }
  };

  const filtered = courses.filter((c) => !search || c.title.toLowerCase().includes(search.toLowerCase()) || c.instructorName.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Input placeholder="Search courses or instructor…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh</Button>
        <Badge variant="outline" className="ml-auto">{filtered.length} course{filtered.length !== 1 ? "s" : ""}</Badge>
      </div>

      {loading ? (
        <div className="space-y-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground"><BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" /><p>No courses found.</p></div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40">
              <tr className="border-b border-border text-muted-foreground text-xs">
                <th className="text-left px-4 py-3 font-medium">Course</th>
                <th className="text-left px-4 py-3 font-medium">Sub-category</th>
                <th className="text-left px-4 py-3 font-medium">Instructor</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Students</th>
                <th className="text-center px-4 py-3 font-medium">Featured</th>
                <th className="text-right px-4 py-3 font-medium">Change Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-border/40 hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium truncate max-w-[200px]">{c.title}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Badge variant="outline" className="text-[10px] capitalize px-1 py-0">{c.category}</Badge>
                      <Badge variant="outline" className="text-[10px] capitalize px-1 py-0">{c.level}</Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {editingSubCat === c.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          className="h-7 text-xs w-32"
                          value={subCatInput}
                          autoFocus
                          onChange={e => setSubCatInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveSubCat(c.id); if (e.key === "Escape") setEditingSubCat(null); }}
                          placeholder="e.g. Scalping"
                        />
                        <Button size="sm" className="h-7 px-2 text-xs" onClick={() => saveSubCat(c.id)}><Check className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingSubCat(null)}><X className="h-3 w-3" /></Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => openSubCatEdit(c)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground group"
                        title="Click to edit sub-category"
                      >
                        <span className={c.subCategory ? "capitalize" : "italic opacity-50"}>{c.subCategory ?? "None"}</span>
                        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{c.instructorName}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-right font-medium">{c.enrollments}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleFeatured(c.id, !!c.isFeatured)} disabled={acting === c.id} title={c.isFeatured ? "Remove from featured" : "Mark as featured"}>
                      {c.isFeatured
                        ? <Star className="h-4 w-4 text-amber-400 fill-amber-400 mx-auto" />
                        : <StarOff className="h-4 w-4 text-muted-foreground mx-auto hover:text-amber-400 transition-colors" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Select value={c.status} onValueChange={(v) => setStatus(c.id, v)} disabled={acting === c.id}>
                      <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive h-7 px-2" onClick={() => deleteCourse(c.id, c.title)} disabled={acting === c.id}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type AdminEnrollmentRequest = { id: number; userId: string; courseId: number; status: string; enrolledAt: string | null; userName: string; userEmail: string; courseTitle: string; groupName: string | null; };

/* ─── Enrollments Tab ─── */
function EnrollmentsTab() {
  const { toast } = useToast();
  const [enrollments, setEnrollments] = useState<AdminEnrollment[]>([]);
  const [requests, setRequests] = useState<AdminEnrollmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingReqs, setLoadingReqs] = useState(true);
  const [search, setSearch] = useState("");
  const [enrollPage, setEnrollPage] = useState(1);
  const [acting, setActing] = useState<number | null>(null);
  const [actingReq, setActingReq] = useState<number | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/enrollments");
      if (res.ok) setEnrollments(await res.json());
    } finally { setLoading(false); }
  }, []);

  const loadRequests = useCallback(async () => {
    setLoadingReqs(true);
    try {
      const res = await fetch("/api/admin/enrollment-requests");
      if (res.ok) setRequests(await res.json());
    } finally { setLoadingReqs(false); }
  }, []);

  useEffect(() => { load(); loadRequests(); }, [load, loadRequests]);

  const remove = async (id: number) => {
    if (!confirm("Remove this enrollment?")) return;
    setActing(id);
    try {
      await fetch(`/api/admin/enrollments/${id}`, { method: "DELETE" });
      toast({ title: "Enrollment removed" });
      load();
    } catch { toast({ title: "Failed", variant: "destructive" }); }
    finally { setActing(null); }
  };

  const approveRequest = async (id: number) => {
    setActingReq(id);
    try {
      const res = await fetch(`/api/admin/enrollment-requests/${id}/approve`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast({ title: "Enrollment approved" });
      await Promise.all([load(), loadRequests()]);
    } catch { toast({ title: "Failed to approve", variant: "destructive" }); }
    finally { setActingReq(null); }
  };

  const rejectRequest = async (id: number) => {
    if (!confirm("Reject and remove this request?")) return;
    setActingReq(id);
    try {
      const res = await fetch(`/api/admin/enrollment-requests/${id}/reject`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast({ title: "Request rejected" });
      loadRequests();
    } catch { toast({ title: "Failed to reject", variant: "destructive" }); }
    finally { setActingReq(null); }
  };

  const filtered = enrollments.filter((e) =>
    !search || e.userName.toLowerCase().includes(search.toLowerCase()) || e.courseTitle.toLowerCase().includes(search.toLowerCase()) || e.userEmail.toLowerCase().includes(search.toLowerCase())
  );
  const pagedEnrollments = filtered.slice((enrollPage - 1) * PAGE_SIZE, enrollPage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* ── Pending Requests ── */}
      {(loadingReqs || requests.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Enrollment Requests</h3>
            {requests.length > 0 && <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[11px]">{requests.length} pending</Badge>}
          </div>
          {loadingReqs ? (
            <div className="space-y-2">{Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : (
            <div className="rounded-xl border border-amber-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-amber-50">
                  <tr className="border-b border-amber-100 text-amber-700 text-xs">
                    <th className="text-left px-4 py-2.5 font-medium">Student</th>
                    <th className="text-left px-4 py-2.5 font-medium">Course</th>
                    <th className="text-right px-4 py-2.5 font-medium">Requested</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id} className="border-b border-amber-100/60 last:border-0 hover:bg-amber-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium truncate max-w-[160px]">{r.userName}</p>
                        <p className="text-[11px] text-muted-foreground truncate max-w-[160px]">{r.userEmail}</p>
                        {r.groupName && (
                          <span className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-50 text-violet-700 border border-violet-200">
                            <Users className="h-2.5 w-2.5" />{r.groupName}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px]">{r.courseTitle}</td>
                      <td className="px-4 py-3 text-right text-[11px] text-muted-foreground">{r.enrolledAt ? new Date(r.enrolledAt).toLocaleDateString() : "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] text-green-600 border-green-200 hover:bg-green-50" onClick={() => approveRequest(r.id)} disabled={actingReq === r.id}>
                            <Check className="h-3 w-3 mr-1" />Approve
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => rejectRequest(r.id)} disabled={actingReq === r.id}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── All Enrollments ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Input placeholder="Search by student or course…" value={search} onChange={(e) => { setSearch(e.target.value); setEnrollPage(1); }} className="max-w-xs" />
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh</Button>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => setGrantOpen(true)}>
              <KeyRound className="h-3.5 w-3.5" /> Grant Access
            </Button>
            <Badge variant="outline">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</Badge>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground"><GraduationCap className="h-10 w-10 mx-auto mb-3 opacity-30" /><p>No enrollments found.</p></div>
        ) : (
          <>
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
                {pagedEnrollments.map((e) => (
                  <tr key={e.id} className="border-b border-border/40 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium truncate max-w-[160px]">{e.userName}</p>
                      <p className="text-[11px] text-muted-foreground truncate max-w-[160px]">{e.userEmail}</p>
                      {e.groupName && (
                        <span className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-50 text-violet-700 border border-violet-200">
                          <Users className="h-2.5 w-2.5" />{e.groupName}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px]">{e.courseTitle}</td>
                    <td className="px-4 py-3 text-center"><EnrollBadge status={e.status} /></td>
                    <td className="px-4 py-3 text-right text-[11px] text-muted-foreground">{e.enrolledAt ? new Date(e.enrolledAt).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3 text-right text-[11px] text-muted-foreground">{e.completedAt ? new Date(e.completedAt).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive h-7 px-2" onClick={() => remove(e.id)} disabled={acting === e.id}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginator page={enrollPage} total={filtered.length} onChange={setEnrollPage} />
          </>
        )}
      </div>

      <GrantAccessDialog
        open={grantOpen}
        onOpenChange={setGrantOpen}
        onSuccess={load}
      />
    </div>
  );
}

/* ─── Activity Tab ─── */
const ACTIVITY_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  lesson_complete: { icon: CheckCircle, color: "text-green-500" },
  quiz_pass: { icon: Award, color: "text-purple-500" },
  task_complete: { icon: FileText, color: "text-blue-500" },
  course_complete: { icon: GraduationCap, color: "text-amber-500" },
  enrollment: { icon: Users, color: "text-cyan-500" },
  live_class: { icon: Calendar, color: "text-rose-500" },
  copy_trade: { icon: TrendingUp, color: "text-emerald-500" },
};

function ActivityTab() {
  const [activities, setActivities] = useState<AdminActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/activity");
      if (res.ok) setActivities(await res.json());
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const types = [...new Set(activities.map((a) => a.type))];
  const filtered = activities.filter((a) => filter === "all" || a.type === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Filter by type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Activity</SelectItem>
            {types.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh</Button>
        <Badge variant="outline" className="ml-auto">{filtered.length} events</Badge>
      </div>

      {loading ? (
        <div className="space-y-2">{Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground"><Activity className="h-10 w-10 mx-auto mb-3 opacity-30" /><p>No activity yet.</p></div>
      ) : (
        <div className="space-y-1">
          {filtered.map((a) => {
            const { icon: Icon, color } = ACTIVITY_ICONS[a.type] ?? { icon: Activity, color: "text-muted-foreground" };
            return (
              <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/30 transition-colors border border-transparent hover:border-border">
                <div className={`w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0 ${color}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{a.description ?? a.type.replace(/_/g, " ")}</p>
                  {a.userName && <p className="text-[11px] text-muted-foreground">{a.userName}</p>}
                </div>
                <div className="text-[11px] text-muted-foreground shrink-0 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(a.createdAt).toLocaleString()}
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0 capitalize">{a.type.replace(/_/g, " ")}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   COMMUNITY MODERATION TAB
════════════════════════════════════════════ */
type CommunityView = "posts" | "comments" | "channels";

/* ── Channel Form Dialog ── */
function ChannelFormDialog({
  open, onOpenChange, existing, onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: CommunityChannel;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(existing?.name ?? "");
  const [emoji, setEmoji] = useState(existing?.emoji ?? "💬");
  const [slug, setSlug] = useState(existing?.slug ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [accessType, setAccessType] = useState<string>(existing?.accessType ?? "common");
  const [courseId, setCourseId] = useState<string>(existing?.courseId ? String(existing.courseId) : "");
  const [batchId, setBatchId] = useState<string>(existing?.batchId ? String(existing.batchId) : "");
  const [batches, setBatches] = useState<{ id: number; name: string }[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [position, setPosition] = useState<string>(existing?.position ? String(existing.position) : "0");
  const { data: courses } = useListCourses();

  useEffect(() => {
    if (open && existing) {
      setName(existing.name ?? ""); setEmoji(existing.emoji ?? "💬");
      setSlug(existing.slug ?? ""); setDescription(existing.description ?? "");
      setAccessType(existing.accessType ?? "common");
      setCourseId(existing.courseId ? String(existing.courseId) : "");
      setBatchId(existing.batchId ? String(existing.batchId) : "");
      setPosition(existing.position ? String(existing.position) : "0");
    } else if (open && !existing) {
      setName(""); setEmoji("💬"); setSlug(""); setDescription("");
      setAccessType("common"); setCourseId(""); setBatchId(""); setPosition("0");
    }
    setBatches([]);
  }, [open, existing]);

  useEffect(() => {
    if (accessType === "batch" && courseId) {
      setLoadingBatches(true);
      setBatchId("");
      fetch(`/api/instructor/courses/${courseId}/batches`)
        .then((r) => r.json())
        .then((d) => setBatches(Array.isArray(d) ? d.map((b: { id: number; name: string }) => ({ id: b.id, name: b.name })) : []))
        .catch(() => setBatches([]))
        .finally(() => setLoadingBatches(false));
    } else {
      setBatches([]);
    }
  }, [accessType, courseId]);

  const createChannel = useCreateChannel({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListChannelsQueryKey() });
        toast({ title: "Channel created" });
        onOpenChange(false); onSuccess();
      },
      onError: () => toast({ title: "Failed to create channel", variant: "destructive" }),
    },
  });
  const updateChannel = useUpdateChannel({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListChannelsQueryKey() });
        toast({ title: "Channel updated" });
        onOpenChange(false); onSuccess();
      },
      onError: () => toast({ title: "Failed to update channel", variant: "destructive" }),
    },
  });

  const handleSubmit = () => {
    if (!name.trim() || !slug.trim()) {
      toast({ title: "Name and slug are required", variant: "destructive" }); return;
    }
    const data = {
      name: name.trim(), emoji: emoji.trim() || "💬",
      slug: slug.trim().toLowerCase().replace(/\s+/g, "-"),
      description: description.trim() || undefined,
      accessType: accessType as "common" | "course" | "batch",
      courseId: (accessType === "course" || accessType === "batch") && courseId ? Number(courseId) : undefined,
      batchId: accessType === "batch" && batchId ? Number(batchId) : undefined,
      position: Number(position) || 0,
    };
    if (existing) {
      updateChannel.mutate({ channelId: existing.id, data });
    } else {
      createChannel.mutate({ data });
    }
  };

  const isPending = createChannel.isPending || updateChannel.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Channel" : "New Channel"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="flex gap-2">
            <Input placeholder="Emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} className="w-20 text-center text-lg" />
            <Input placeholder="Channel name *" value={name} onChange={(e) => { setName(e.target.value); if (!existing) setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")); }} className="flex-1" />
          </div>
          <Input placeholder="slug (url-safe, e.g. forex-analysis) *" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""))} />
          <Textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Access type</label>
              <Select value={accessType} onValueChange={setAccessType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="common">Common (all members)</SelectItem>
                  <SelectItem value="course">Course-only</SelectItem>
                  <SelectItem value="batch">Batch-only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Position</label>
              <Input type="number" value={position} onChange={(e) => setPosition(e.target.value)} className="h-9" />
            </div>
          </div>
          {(accessType === "course" || accessType === "batch") && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Course</label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select course…" />
                </SelectTrigger>
                <SelectContent>
                  {(courses ?? []).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {accessType === "batch" && courseId && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Batch</label>
              {loadingBatches ? (
                <div className="h-9 rounded-md border animate-pulse bg-secondary/30" />
              ) : batches.length === 0 ? (
                <p className="text-sm text-muted-foreground bg-secondary/30 rounded-md px-3 py-2">No batches for this course.</p>
              ) : (
                <Select value={batchId} onValueChange={setBatchId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select batch…" />
                  </SelectTrigger>
                  <SelectContent>
                    {batches.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Saving…" : existing ? "Save changes" : "Create channel"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Channels Sub-Tab ── */
function ChannelsSubTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: channels, isLoading } = useListChannels();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CommunityChannel | undefined>(undefined);

  const deleteChannel = useDeleteChannel({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListChannelsQueryKey() });
        toast({ title: "Channel deleted" });
      },
      onError: () => toast({ title: "Failed to delete channel", variant: "destructive" }),
    },
  });

  const handleDelete = (ch: CommunityChannel) => {
    if (!confirm(`Delete #${ch.name}? All posts in this channel will remain but become unattached.`)) return;
    deleteChannel.mutate({ channelId: ch.id });
  };

  const accessBadge = (ch: CommunityChannel) => {
    if (ch.accessType === "course") return <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Course</span>;
    if (ch.accessType === "batch") return <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Batch</span>;
    return <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Common</span>;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{(channels ?? []).length} channel{(channels ?? []).length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Channel
        </Button>
      </div>
      {isLoading ? (
        Array(4).fill(0).map((_, i) => <div key={i} className="h-14 rounded-xl bg-secondary animate-pulse" />)
      ) : (channels ?? []).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Hash className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No channels yet. Create the first one.</p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
          {(channels ?? []).map((ch) => (
            <div key={ch.id} className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-secondary/20 transition-colors">
              <span className="text-xl">{ch.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">#{ch.name}</span>
                  {accessBadge(ch)}
                  <span className="text-[10px] text-muted-foreground">pos {ch.position}</span>
                </div>
                {ch.description && <p className="text-xs text-muted-foreground truncate">{ch.description}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => { setEditing(ch); setFormOpen(true); }}
                  className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(ch)}
                  className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ChannelFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        existing={editing}
        onSuccess={() => setEditing(undefined)}
      />
    </div>
  );
}

function CommunityTab() {
  const { toast } = useToast();
  const [view, setView] = useState<CommunityView>("channels");
  const [posts, setPosts] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [search, setSearch] = useState("");

  const fetchPosts = useCallback(async () => {
    setLoadingPosts(true);
    try {
      const r = await fetch("/api/admin/posts");
      if (r.ok) setPosts(await r.json());
    } finally { setLoadingPosts(false); }
  }, []);

  const fetchComments = useCallback(async () => {
    setLoadingComments(true);
    try {
      const r = await fetch("/api/admin/comments");
      if (r.ok) setComments(await r.json());
    } finally { setLoadingComments(false); }
  }, []);

  useEffect(() => { if (view === "posts") fetchPosts(); }, [view, fetchPosts]);
  useEffect(() => { if (view === "comments") fetchComments(); }, [view, fetchComments]);

  const deletePost = async (id: number) => {
    if (!confirm("Delete this post and all its comments?")) return;
    await fetch(`/api/admin/posts/${id}`, { method: "DELETE" });
    setPosts((p) => p.filter((x) => x.id !== id));
    toast({ title: "Post deleted" });
  };

  const pinPost = async (id: number, pinned: boolean) => {
    await fetch(`/api/admin/posts/${id}/pin`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pinned }) });
    setPosts((p) => p.map((x) => x.id === id ? { ...x, isPinned: pinned } : x));
    toast({ title: pinned ? "Post pinned" : "Post unpinned" });
  };

  const deleteComment = async (id: number) => {
    if (!confirm("Delete this comment?")) return;
    await fetch(`/api/admin/comments/${id}`, { method: "DELETE" });
    setComments((c) => c.filter((x) => x.id !== id));
    toast({ title: "Comment deleted" });
  };

  const filteredPosts = posts.filter((p) =>
    !search || p.title?.toLowerCase().includes(search.toLowerCase()) || p.content?.toLowerCase().includes(search.toLowerCase()) || p.authorName?.toLowerCase().includes(search.toLowerCase())
  );
  const filteredComments = comments.filter((c) =>
    !search || c.content?.toLowerCase().includes(search.toLowerCase()) || c.authorName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-secondary rounded-xl p-1">
          {(["channels", "posts", "comments"] as CommunityView[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${view === v ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {v === "posts" ? `Posts (${posts.length})` : v === "comments" ? `Comments (${comments.length})` : "Channels"}
            </button>
          ))}
        </div>
        {view !== "channels" && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${view}…`}
            className="flex-1 min-w-[180px] h-9 px-3 rounded-lg border border-border text-sm bg-background focus:outline-none focus:border-primary"
          />
        )}
      </div>

      {view === "channels" && <ChannelsSubTab />}

      {view === "posts" && (
        <div className="space-y-2">
          {loadingPosts ? (
            Array(4).fill(0).map((_, i) => <div key={i} className="h-20 rounded-xl bg-secondary animate-pulse" />)
          ) : filteredPosts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No posts found.</p>
            </div>
          ) : filteredPosts.map((post) => (
            <div key={post.id} className="flex items-start gap-3 p-4 rounded-xl border border-border bg-white hover:bg-secondary/30 transition-colors">
              {post.isPinned && <Pin className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="text-sm font-semibold text-foreground truncate">{post.title || "(no title)"}</span>
                  {post.category && <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded-full capitalize text-muted-foreground">{post.category}</span>}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{post.content}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">by {post.authorName ?? "—"} · {new Date(post.createdAt).toLocaleDateString()} · {post.likes ?? 0} likes · {post.commentCount ?? 0} comments</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => pinPost(post.id, !post.isPinned)}
                  title={post.isPinned ? "Unpin" : "Pin"}
                  className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-amber-600"
                >
                  {post.isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => deletePost(post.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "comments" && (
        <div className="space-y-2">
          {loadingComments ? (
            Array(4).fill(0).map((_, i) => <div key={i} className="h-16 rounded-xl bg-secondary animate-pulse" />)
          ) : filteredComments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No comments found.</p>
            </div>
          ) : filteredComments.map((comment) => (
            <div key={comment.id} className="flex items-start gap-3 p-4 rounded-xl border border-border bg-white hover:bg-secondary/30 transition-colors">
              <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground line-clamp-2">{comment.content}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">by {comment.authorName ?? "—"} · {new Date(comment.createdAt).toLocaleDateString()} · {comment.likes ?? 0} likes</p>
              </div>
              <button
                onClick={() => deleteComment(comment.id)}
                className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-600 shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   ADMIN LIVE CLASSES TAB
════════════════════════════════════════════ */
function AdminScheduleDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [courses, setCourses] = useState<{ id: number; title: string }[]>([]);
  const [batches, setBatches] = useState<{ id: number; name: string }[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [audienceType, setAudienceType] = useState<"all" | "batch">("all");
  const { toast } = useToast();
  const form = useForm({ defaultValues: { title: "", description: "", scheduledAt: "", duration: 60 as number | undefined, courseId: "" as string, batchId: "" as string, maxAttendees: "" as string } });
  const selectedCourseId = form.watch("courseId");
  const create = useCreateLiveClass({
    mutation: {
      onSuccess: () => { setOpen(false); form.reset(); setAudienceType("all"); setBatches([]); onSuccess(); toast({ title: "Live class scheduled" }); },
      onError: () => toast({ title: "Failed to schedule", variant: "destructive" }),
    },
  });

  useEffect(() => {
    fetch("/api/courses").then((r) => r.ok ? r.json() : []).then((d) => setCourses(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  useEffect(() => {
    setBatches([]); form.setValue("batchId", ""); setAudienceType("all");
    if (!selectedCourseId || selectedCourseId === "none") return;
    setLoadingBatches(true);
    fetch(`/api/instructor/courses/${selectedCourseId}/batches`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setBatches(Array.isArray(d) ? d.map((b: { id: number; name: string }) => ({ id: b.id, name: b.name })) : []))
      .catch(() => {})
      .finally(() => setLoadingBatches(false));
  }, [selectedCourseId]);

  const handleSubmit = form.handleSubmit((d) => {
    create.mutate({ data: {
      title: d.title, description: d.description || undefined,
      scheduledAt: new Date(d.scheduledAt).toISOString(),
      duration: d.duration || undefined,
      courseId: d.courseId && d.courseId !== "none" ? parseInt(d.courseId) : undefined,
      batchId: audienceType === "batch" && d.batchId ? parseInt(d.batchId) : undefined,
      maxAttendees: d.maxAttendees ? parseInt(d.maxAttendees) : undefined,
    }});
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><CalendarPlus className="h-4 w-4 mr-2" />Schedule Live Class</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Schedule a Live Class</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField control={form.control} name="title" rules={{ required: "Title required" }} render={({ field }) => (
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
            <FormField control={form.control} name="courseId" render={({ field }) => (
              <FormItem><FormLabel>Course</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="None (open session)" /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="none">None (open to all)</SelectItem>
                    {courses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
            {selectedCourseId && selectedCourseId !== "none" && (
              <FormItem>
                <FormLabel>Who can join?</FormLabel>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setAudienceType("all"); form.setValue("batchId", ""); }}
                    className={cn("rounded-lg border px-3 py-2.5 text-sm text-left transition-colors", audienceType === "all" ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:bg-secondary/50")}>
                    <Users className="h-4 w-4 mb-1" />
                    All enrolled students
                    <p className="text-[11px] text-muted-foreground font-normal mt-0.5">Everyone enrolled in the course</p>
                  </button>
                  <button type="button" onClick={() => setAudienceType("batch")}
                    className={cn("rounded-lg border px-3 py-2.5 text-sm text-left transition-colors", audienceType === "batch" ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:bg-secondary/50")}>
                    <GraduationCap className="h-4 w-4 mb-1" />
                    Specific batch
                    <p className="text-[11px] text-muted-foreground font-normal mt-0.5">Only students in one batch</p>
                  </button>
                </div>
              </FormItem>
            )}
            {audienceType === "batch" && selectedCourseId && selectedCourseId !== "none" && (
              <FormField control={form.control} name="batchId" rules={{ required: "Select a batch" }} render={({ field }) => (
                <FormItem><FormLabel>Select Batch</FormLabel>
                  {loadingBatches ? <div className="h-9 rounded-md border animate-pulse bg-secondary/30" /> :
                    batches.length === 0 ? <p className="text-sm text-muted-foreground bg-secondary/30 rounded-md px-3 py-2">No batches for this course.</p> : (
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

function AdminLiveClassesTab() {
  const qc = useQueryClient();
  const { data: classes, isLoading } = useListLiveClasses({});
  const refresh = () => qc.invalidateQueries({ queryKey: getListLiveClassesQueryKey() });

  const statusColor = (s: string) => s === "live" ? "destructive" : s === "completed" ? "secondary" : "outline";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Live Classes</h2>
          <p className="text-sm text-muted-foreground">Schedule and manage all live sessions across the platform.</p>
        </div>
        <AdminScheduleDialog onSuccess={refresh} />
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !classes?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Video className="h-10 w-10 mx-auto mb-3 opacity-25" />
            <p className="text-muted-foreground mb-4">No live sessions scheduled yet.</p>
            <AdminScheduleDialog onSuccess={refresh} />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {classes.map((cls) => (
            <Card key={cls.id} className="hover:bg-secondary/20 transition-colors">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
                    <Video className="h-4 w-4 text-purple-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{cls.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span>{new Date(cls.scheduledAt).toLocaleString()}</span>
                      {cls.courseName && <><span>·</span><span className="truncate max-w-[160px]">{cls.courseName}</span></>}
                      {(cls as { batchName?: string | null }).batchName && <><span>·</span><Badge variant="outline" className="text-[10px] py-0 h-4">{(cls as { batchName?: string | null }).batchName}</Badge></>}
                      {!cls.courseName && !(cls as { batchName?: string | null }).batchName && <span>· Open session</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">{cls.registrationCount} joined</span>
                    <Badge variant={statusColor(cls.status)}>{cls.status}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Events Tab ─── */
type AdminEvent = {
  id: number; title: string; description: string | null; thumbnailUrl: string | null;
  eventDate: string | null; location: string | null; type: string; createdAt: string;
};

const EVENT_TYPES = ["general", "webinar", "workshop", "trading", "masterclass", "ama"];

function EventsTab() {
  const { toast } = useToast();
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [form, setForm] = useState({ title: "", description: "", thumbnailUrl: "", eventDate: "", location: "", type: "general" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/events");
      if (r.ok) setEvents(await r.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (r.ok) {
        toast({ title: "Event created" });
        setForm({ title: "", description: "", thumbnailUrl: "", eventDate: "", location: "", type: "general" });
        load();
      } else {
        const d = await r.json();
        toast({ title: "Error", description: d.error, variant: "destructive" });
      }
    } finally { setCreating(false); }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await fetch(`/api/admin/events/${id}`, { method: "DELETE" });
      setEvents((prev) => prev.filter((e) => e.id !== id));
      toast({ title: "Event deleted" });
    } finally { setDeleting(null); }
  };

  return (
    <div className="space-y-6">
      {/* Create form */}
      <Card>
        <CardHeader><CardTitle className="text-base">Create Event</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Title *</label>
                <Input placeholder="Event title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Type</label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea placeholder="What is this event about?" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" />Thumbnail URL</label>
                <Input placeholder="https://..." value={form.thumbnailUrl} onChange={(e) => setForm((f) => ({ ...f, thumbnailUrl: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />Location / Link</label>
                <Input placeholder="Zoom link or venue" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />Date & Time</label>
                <Input type="datetime-local" value={form.eventDate} onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))} />
              </div>
            </div>
            {form.thumbnailUrl && (
              <div className="rounded-xl overflow-hidden border border-border w-full max-w-xs">
                <img src={form.thumbnailUrl} alt="Thumbnail preview" className="w-full h-32 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </div>
            )}
            <Button type="submit" disabled={creating || !form.title.trim()} className="w-full sm:w-auto">
              <CalendarPlus className="h-4 w-4 mr-2" />{creating ? "Creating…" : "Create Event"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Event list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-muted-foreground">{events.length} event{events.length !== 1 ? "s" : ""}</p>
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</Button>
        </div>
        {loading ? (
          <div className="space-y-3">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
        ) : events.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No events yet. Create your first event above.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((ev) => (
              <Card key={ev.id} className="overflow-hidden">
                {ev.thumbnailUrl && (
                  <div className="h-32 w-full overflow-hidden bg-secondary">
                    <img src={ev.thumbnailUrl} alt={ev.title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }} />
                  </div>
                )}
                <CardContent className="pt-3 pb-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm leading-tight">{ev.title}</p>
                    <Badge variant="outline" className="text-[10px] shrink-0 capitalize">{ev.type}</Badge>
                  </div>
                  {ev.description && <p className="text-xs text-muted-foreground line-clamp-2">{ev.description}</p>}
                  {ev.eventDate && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(ev.eventDate).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                  {ev.location && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{ev.location}</p>}
                  <Button variant="destructive" size="sm" className="w-full mt-2" onClick={() => handleDelete(ev.id)} disabled={deleting === ev.id}>
                    <Trash2Icon className="h-3.5 w-3.5 mr-1.5" />{deleting === ev.id ? "Deleting…" : "Delete"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Broadcast Tab ─── */
function BroadcastTab() {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<"all" | "students" | "instructors">("all");
  const [sendEmail, setSendEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ notified: number; emailResult: { sent: number; failed: number; configured: boolean } } | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;
    setSending(true);
    setLastResult(null);
    try {
      const r = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, message, audience, sendEmail }),
      });
      const data = await r.json();
      if (r.ok) {
        setLastResult(data);
        toast({ title: `Broadcast sent to ${data.notified} user${data.notified !== 1 ? "s" : ""}` });
        setTitle(""); setMessage("");
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } finally { setSending(false); }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Megaphone className="h-4 w-4" />Send Broadcast</CardTitle>
          <p className="text-sm text-muted-foreground">Sends an in-app announcement to all matching users. Optionally emails them too.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSend} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Subject / Title *</label>
              <Input placeholder="e.g. New course available!" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Message *</label>
              <Textarea placeholder="Write your announcement here…" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Audience</label>
              <Select value={audience} onValueChange={(v) => setAudience(v as typeof audience)}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  <SelectItem value="students">Students only</SelectItem>
                  <SelectItem value="instructors">Instructors only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-secondary/30">
              <input
                type="checkbox"
                id="send-email"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="h-4 w-4 accent-primary cursor-pointer"
              />
              <label htmlFor="send-email" className="text-sm cursor-pointer flex-1">
                <span className="font-medium flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />Also send via email</span>
                <span className="text-muted-foreground text-xs block mt-0.5">Requires SMTP_HOST, SMTP_USER, SMTP_PASS env vars to be configured.</span>
              </label>
            </div>
            <Button type="submit" disabled={sending || !title.trim() || !message.trim()} className="w-full">
              <Send className="h-4 w-4 mr-2" />{sending ? "Sending…" : "Send Broadcast"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {lastResult && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="pt-4 pb-4 space-y-1">
            <p className="text-sm font-semibold text-green-800 flex items-center gap-1.5"><CheckCircle className="h-4 w-4" />Broadcast sent</p>
            <p className="text-xs text-green-700">In-app notifications: {lastResult.notified} users notified</p>
            {sendEmail && (
              lastResult.emailResult.configured
                ? <p className="text-xs text-green-700 flex items-center gap-1"><Mail className="h-3 w-3" />Emails: {lastResult.emailResult.sent} sent, {lastResult.emailResult.failed} failed</p>
                : <p className="text-xs text-amber-600 flex items-center gap-1"><XCircle className="h-3 w-3" />Email not configured — set SMTP env vars to enable.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   LANDING PAGE TAB
════════════════════════════════════════════ */

interface StatItem { value: string; label: string; }
interface FeatureItem { title: string; desc: string; }
interface TestimonialItem { name: string; role: string; text: string; }
interface MarketTab { id: string; label: string; content: string; imageUrl: string; }
type SocialPlatform = "facebook" | "instagram" | "youtube" | "twitter" | "linkedin" | "tiktok" | "whatsapp";
interface SocialLink { platform: SocialPlatform; enabled: boolean; url: string; }
interface LandingContent {
  hero: { badge: string; headline1: string; headline2: string; subheadline: string; cta1: string; cta2: string; trustBadges: string[]; demoVideoUrl?: string; };
  markets: { tabs: MarketTab[] };
  stats: StatItem[];
  features: { badge: string; title: string; subtitle: string; items: FeatureItem[]; };
  testimonials: { title: string; subtitle: string; items: TestimonialItem[]; };
  cta: { headline: string; subtitle: string; buttonText: string; };
  social: { links: SocialLink[] };
  legal: {
    privacy: { title: string; content: string };
    terms:   { title: string; content: string };
    support: { title: string; content: string };
  };
}

const DEFAULT_SOCIAL_LINKS: SocialLink[] = [
  { platform: "facebook",  enabled: false, url: "" },
  { platform: "instagram", enabled: false, url: "" },
  { platform: "youtube",   enabled: false, url: "" },
  { platform: "twitter",   enabled: false, url: "" },
  { platform: "linkedin",  enabled: false, url: "" },
  { platform: "tiktok",   enabled: false, url: "" },
  { platform: "whatsapp", enabled: false, url: "" },
];

const SOCIAL_PLATFORM_LABEL: Record<SocialPlatform, string> = {
  facebook: "Facebook", instagram: "Instagram", youtube: "YouTube",
  twitter: "Twitter / X", linkedin: "LinkedIn", tiktok: "TikTok", whatsapp: "WhatsApp",
};

const LANDING_DEFAULT: LandingContent = {
  hero: {
    badge: "Join 50,000+ ambitious traders worldwide",
    headline1: "Master the markets",
    headline2: "with precision.",
    subheadline: "The professional education platform for serious traders. Structured courses, live market analysis, and real-time tools — all in one premium environment.",
    cta1: "Start Learning Free",
    cta2: "Watch Demo",
    trustBadges: ["No credit card required", "Free 14-day trial", "Cancel anytime"],
  },
  stats: [
    { value: "50,000+", label: "Active Students" },
    { value: "200+", label: "Expert Courses" },
    { value: "98%", label: "Satisfaction Rate" },
    { value: "$2.4B+", label: "Student Portfolio" },
  ],
  features: {
    badge: "Everything you need",
    title: "Built for serious traders",
    subtitle: "A complete ecosystem covering education, real-time trading tools, and community support.",
    items: [
      { title: "Structured Academy", desc: "Step-by-step curriculum from market fundamentals to advanced algorithmic trading, designed by verified professionals." },
      { title: "Live Market Sessions", desc: "Watch experts analyze live charts, execute trades, and manage risk in real-time across global sessions." },
      { title: "Verified Copy Trading", desc: "Learn by following. Analyze portfolios, risk metrics, and strategies of top-performing verified traders." },
      { title: "Real-Time Markets", desc: "Professional-grade charting tools, watchlists, and market data used by institutional traders worldwide." },
      { title: "Active Community", desc: "Collaborate, share trade ideas, and get feedback from a global community of serious traders." },
      { title: "XP & Certification", desc: "Earn XP, climb leaderboards, and collect verified certificates to showcase your trading expertise." },
    ],
  },
  testimonials: {
    title: "Trusted by traders globally",
    subtitle: "Real results from real students",
    items: [
      { name: "Sarah Chen", role: "Forex Trader", text: "The structured curriculum took me from zero to consistently profitable in 6 months. The live sessions are invaluable." },
      { name: "Marcus Adeyemi", role: "Crypto Analyst", text: "Copy trading helped me understand risk management hands-on. The transparency of trader metrics is unmatched." },
      { name: "Elena Petrova", role: "Options Trader", text: "Best investment education platform I've used. The community is incredibly supportive and knowledge-rich." },
    ],
  },
  markets: {
    tabs: [
      { id: "forex", label: "Forex", content: "The world's largest financial market with over $6.6 trillion traded daily. Learn currency pairs, chart reading, risk management, and how to profit in both rising and falling markets with guidance from professional traders.", imageUrl: "" },
      { id: "stocks", label: "Stocks", content: "Master equity markets with institutional-grade strategies. Understand fundamental analysis, technical setups, sector rotation, and how to build a diversified portfolio that consistently outperforms the market.", imageUrl: "" },
      { id: "crypto", label: "Crypto", content: "Navigate the 24/7 digital asset market with confidence. From blockchain fundamentals to DeFi protocols, futures trading, and on-chain analysis — stay ahead of every market cycle with expert education.", imageUrl: "" },
    ],
  },
  cta: {
    headline: "Ready to trade smarter?",
    subtitle: "Join thousands of traders already using Bright Insight to sharpen their edge. Start free today.",
    buttonText: "Start Learning Free",
  },
  social: { links: DEFAULT_SOCIAL_LINKS },
  legal: {
    privacy: { title: "Privacy Policy",   content: "" },
    terms:   { title: "Terms of Service", content: "" },
    support: { title: "Support",          content: "" },
  },
};

function deepMergeLanding(defaults: LandingContent, overrides: Partial<LandingContent>): LandingContent {
  if (!overrides || typeof overrides !== "object") return defaults;
  const result = { ...defaults } as unknown as Record<string, unknown>;
  for (const key of Object.keys(overrides)) {
    const dv = (defaults as unknown as Record<string, unknown>)[key];
    const ov = (overrides as unknown as Record<string, unknown>)[key];
    if (Array.isArray(dv) && Array.isArray(ov)) { result[key] = ov; }
    else if (dv && typeof dv === "object" && ov && typeof ov === "object") { result[key] = { ...(dv as object), ...(ov as object) }; }
    else if (ov !== undefined) { result[key] = ov; }
  }
  return result as unknown as LandingContent;
}

function MarketTabImageUpload({
  imageUrl, label, onUploaded, onRemove,
}: { imageUrl: string; label: string; onUploaded: (url: string) => void; onRemove: () => void }) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const MAX_MB = 5;
    if (file.size > MAX_MB * 1024 * 1024) {
      toast({ title: `Image must be under ${MAX_MB} MB`, variant: "destructive" });
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast({ title: "Only image files are allowed", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/upload/image", { method: "POST", body: form });
      if (!res.ok) { const e = await res.json() as { error: string }; throw new Error(e.error); }
      const { url } = await res.json() as { url: string };
      onUploaded(url);
      toast({ title: "Image uploaded!" });
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      {imageUrl ? (
        <div className="relative rounded-xl overflow-hidden border border-border">
          <img src={imageUrl} alt={label} className="w-full h-44 object-cover" />
          <div className="absolute top-2 right-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="bg-black/60 hover:bg-black/80 text-white text-xs font-medium px-2.5 py-1 rounded-lg transition-colors"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="bg-red-600/80 hover:bg-red-700 text-white text-xs font-medium px-2.5 py-1 rounded-lg transition-colors"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-secondary/30 hover:bg-secondary/50 transition-colors h-36 text-muted-foreground hover:text-foreground"
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Upload className="h-5 w-5" />
              <span className="text-sm font-medium">Click to upload image</span>
              <span className="text-xs">JPG, PNG, WebP — max 5 MB</span>
            </>
          )}
        </button>
      )}
      {uploading && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />Uploading…
        </p>
      )}
    </div>
  );
}

function LandingPageTab() {
  const { toast } = useToast();
  const [content, setContent] = useState<LandingContent>(LANDING_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState("hero");

  useEffect(() => {
    fetch("/api/site-settings/landing_page")
      .then((r) => r.json())
      .then((data) => { if (data.value) setContent(deepMergeLanding(LANDING_DEFAULT, data.value)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/site-settings/landing_page", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: content }),
      });
      if (r.ok) {
        toast({ title: "Landing page saved", description: "Changes are now live on the homepage." });
      } else {
        const d = await r.json();
        toast({ title: "Error", description: d.error, variant: "destructive" });
      }
    } finally { setSaving(false); }
  };

  const setHero = (patch: Partial<LandingContent["hero"]>) =>
    setContent((c) => ({ ...c, hero: { ...c.hero, ...patch } }));
  const setFeatures = (patch: Partial<LandingContent["features"]>) =>
    setContent((c) => ({ ...c, features: { ...c.features, ...patch } }));
  const setTestimonials = (patch: Partial<LandingContent["testimonials"]>) =>
    setContent((c) => ({ ...c, testimonials: { ...c.testimonials, ...patch } }));
  const setCta = (patch: Partial<LandingContent["cta"]>) =>
    setContent((c) => ({ ...c, cta: { ...c.cta, ...patch } }));
  const updateMarketTab = (idx: number, patch: Partial<MarketTab>) =>
    setContent((c) => {
      const tabs = [...(c.markets?.tabs ?? LANDING_DEFAULT.markets.tabs)];
      tabs[idx] = { ...tabs[idx], ...patch };
      return { ...c, markets: { tabs } };
    });

  const sections = ["hero", "markets", "stats", "features", "testimonials", "cta", "social", "legal"];
  const sectionLabel: Record<string, string> = { hero: "Hero", markets: "Market Tabs", stats: "Stats Bar", features: "Features", testimonials: "Testimonials", cta: "CTA Section", social: "Social Media", legal: "Legal" };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground py-10"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Layout className="h-4 w-4" />Landing Page Editor</h2>
          <p className="text-sm text-muted-foreground">Edit the content shown on your public homepage.</p>
        </div>
        <div className="flex gap-2">
          <a href="/" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm"><ExternalLink className="h-3.5 w-3.5 mr-1.5" />Preview</Button>
          </a>
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />{saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 flex-wrap border-b border-border pb-0">
        {sections.map((s) => (
          <button
            key={s}
            onClick={() => setActiveSection(s)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeSection === s
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {sectionLabel[s]}
          </button>
        ))}
      </div>

      {/* ── Hero ── */}
      {activeSection === "hero" && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Badge & Headline</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Badge text</label>
                <Input value={content.hero.badge} onChange={(e) => setHero({ badge: e.target.value })} placeholder="Join 50,000+ ambitious traders worldwide" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Headline line 1</label>
                  <Input value={content.hero.headline1} onChange={(e) => setHero({ headline1: e.target.value })} placeholder="Master the markets" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Headline line 2 (accent colour)</label>
                  <Input value={content.hero.headline2} onChange={(e) => setHero({ headline2: e.target.value })} placeholder="with precision." />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Subheadline</label>
                <Textarea rows={2} value={content.hero.subheadline} onChange={(e) => setHero({ subheadline: e.target.value })} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Buttons</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Primary CTA label</label>
                <Input value={content.hero.cta1} onChange={(e) => setHero({ cta1: e.target.value })} placeholder="Start Learning Free" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Secondary CTA label</label>
                <Input value={content.hero.cta2} onChange={(e) => setHero({ cta2: e.target.value })} placeholder="Watch Demo" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Trust Badges (3 items)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {content.hero.trustBadges.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}.</span>
                  <Input value={b} onChange={(e) => {
                    const arr = [...content.hero.trustBadges];
                    arr[i] = e.target.value;
                    setHero({ trustBadges: arr });
                  }} />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Demo Video</CardTitle>
              <p className="text-xs text-muted-foreground">Paste a YouTube, Vimeo, or direct MP4 URL. The video will appear above the heading on the landing page. Leave blank to hide it.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Video URL</label>
                <Input
                  value={content.hero.demoVideoUrl ?? ""}
                  onChange={(e) => setHero({ demoVideoUrl: e.target.value || undefined })}
                  placeholder="https://www.youtube.com/watch?v=... or https://vimeo.com/..."
                />
              </div>
              {content.hero.demoVideoUrl && (
                <p className="text-xs text-emerald-600 flex items-center gap-1">
                  ✓ Video set — will appear above the heading on the live page
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Market Tabs ── */}
      {activeSection === "markets" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">These three tabs appear below the hero section on the landing page. Each tab shows content text and an image side by side.</p>
          {(content.markets?.tabs ?? LANDING_DEFAULT.markets.tabs).map((tab, i) => (
            <Card key={tab.id}>
              <CardHeader><CardTitle className="text-sm">{tab.label} Tab</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Tab Label</label>
                  <Input value={tab.label} onChange={(e) => updateMarketTab(i, { label: e.target.value })} placeholder="Forex" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Content</label>
                  <Textarea rows={4} value={tab.content} onChange={(e) => updateMarketTab(i, { content: e.target.value })} placeholder="Describe this market…" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Tab Image</label>
                  <MarketTabImageUpload
                    imageUrl={tab.imageUrl}
                    label={tab.label}
                    onUploaded={(url) => updateMarketTab(i, { imageUrl: url })}
                    onRemove={() => updateMarketTab(i, { imageUrl: "" })}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Stats ── */}
      {activeSection === "stats" && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Stats Bar (4 items)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {content.stats.map((s, i) => (
              <div key={i} className="grid grid-cols-2 gap-3 items-end">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Value {i + 1}</label>
                  <Input value={s.value} onChange={(e) => {
                    const arr = [...content.stats];
                    arr[i] = { ...arr[i], value: e.target.value };
                    setContent((c) => ({ ...c, stats: arr }));
                  }} placeholder="50,000+" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Label {i + 1}</label>
                  <Input value={s.label} onChange={(e) => {
                    const arr = [...content.stats];
                    arr[i] = { ...arr[i], label: e.target.value };
                    setContent((c) => ({ ...c, stats: arr }));
                  }} placeholder="Active Students" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Features ── */}
      {activeSection === "features" && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Section Header</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Badge text</label>
                <Input value={content.features.badge} onChange={(e) => setFeatures({ badge: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Title</label>
                <Input value={content.features.title} onChange={(e) => setFeatures({ title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Subtitle</label>
                <Textarea rows={2} value={content.features.subtitle} onChange={(e) => setFeatures({ subtitle: e.target.value })} />
              </div>
            </CardContent>
          </Card>
          {content.features.items.map((item, i) => (
            <Card key={i}>
              <CardHeader><CardTitle className="text-sm">Feature {i + 1}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Title</label>
                  <Input value={item.title} onChange={(e) => {
                    const arr = [...content.features.items];
                    arr[i] = { ...arr[i], title: e.target.value };
                    setFeatures({ items: arr });
                  }} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Description</label>
                  <Textarea rows={2} value={item.desc} onChange={(e) => {
                    const arr = [...content.features.items];
                    arr[i] = { ...arr[i], desc: e.target.value };
                    setFeatures({ items: arr });
                  }} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Testimonials ── */}
      {activeSection === "testimonials" && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Section Header</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Title</label>
                <Input value={content.testimonials.title} onChange={(e) => setTestimonials({ title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Subtitle</label>
                <Input value={content.testimonials.subtitle} onChange={(e) => setTestimonials({ subtitle: e.target.value })} />
              </div>
            </CardContent>
          </Card>
          {content.testimonials.items.map((item, i) => (
            <Card key={i}>
              <CardHeader><CardTitle className="text-sm">Testimonial {i + 1}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Name</label>
                    <Input value={item.name} onChange={(e) => {
                      const arr = [...content.testimonials.items];
                      arr[i] = { ...arr[i], name: e.target.value };
                      setTestimonials({ items: arr });
                    }} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Role / Title</label>
                    <Input value={item.role} onChange={(e) => {
                      const arr = [...content.testimonials.items];
                      arr[i] = { ...arr[i], role: e.target.value };
                      setTestimonials({ items: arr });
                    }} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Quote</label>
                  <Textarea rows={3} value={item.text} onChange={(e) => {
                    const arr = [...content.testimonials.items];
                    arr[i] = { ...arr[i], text: e.target.value };
                    setTestimonials({ items: arr });
                  }} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── CTA ── */}
      {activeSection === "cta" && (
        <Card>
          <CardHeader><CardTitle className="text-sm">CTA Section (bottom banner)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Headline</label>
              <Input value={content.cta.headline} onChange={(e) => setCta({ headline: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Subtitle</label>
              <Textarea rows={2} value={content.cta.subtitle} onChange={(e) => setCta({ subtitle: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Button label</label>
              <Input value={content.cta.buttonText} onChange={(e) => setCta({ buttonText: e.target.value })} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Social Media ── */}
      {activeSection === "social" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Toggle each platform on to show its icon in the footer. Add the full URL for that platform first.</p>
          {(content.social?.links ?? DEFAULT_SOCIAL_LINKS).map((link, i) => (
            <Card key={link.platform}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-4">
                  {/* Enable toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      const links = [...(content.social?.links ?? DEFAULT_SOCIAL_LINKS)];
                      links[i] = { ...links[i], enabled: !links[i].enabled };
                      setContent((c) => ({ ...c, social: { links } }));
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      link.enabled ? "bg-primary" : "bg-muted"
                    }`}
                    aria-label={`Toggle ${SOCIAL_PLATFORM_LABEL[link.platform]}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${link.enabled ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                  <span className="text-sm font-medium w-28 shrink-0">{SOCIAL_PLATFORM_LABEL[link.platform]}</span>
                  <Input
                    className="flex-1"
                    placeholder={`https://${link.platform}.com/yourpage`}
                    value={link.url}
                    disabled={!link.enabled}
                    onChange={(e) => {
                      const links = [...(content.social?.links ?? DEFAULT_SOCIAL_LINKS)];
                      links[i] = { ...links[i], url: e.target.value };
                      setContent((c) => ({ ...c, social: { links } }));
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Legal ── */}
      {activeSection === "legal" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Content shown in the popup when users click Privacy, Terms, or Support in the footer. Supports plain text and line breaks.</p>
          {(["privacy", "terms", "support"] as const).map((key) => {
            const item = content.legal?.[key] ?? { title: "", content: "" };
            const defaultTitle = key === "privacy" ? "Privacy Policy" : key === "terms" ? "Terms of Service" : "Support";
            return (
              <Card key={key}>
                <CardHeader><CardTitle className="text-sm capitalize">{defaultTitle}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Popup Title</label>
                    <Input
                      value={item.title}
                      onChange={(e) => setContent((c) => ({ ...c, legal: { ...c.legal, [key]: { ...item, title: e.target.value } } }))}
                      placeholder={defaultTitle}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Content</label>
                    <Textarea
                      rows={10}
                      value={item.content}
                      onChange={(e) => setContent((c) => ({ ...c, legal: { ...c.legal, [key]: { ...item, content: e.target.value } } }))}
                      placeholder={`Write your ${defaultTitle} here…`}
                      className="font-mono text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">Plain text — line breaks are preserved in the popup.</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Bottom save */}
      <div className="flex justify-end pt-2 pb-8">
        <Button onClick={save} disabled={saving} className="min-w-32">
          <Save className="h-4 w-4 mr-2" />{saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

/* ─── Pending Approvals Tab ─── */
function PendingTab() {
  const { toast } = useToast();
  const [users, setUsers] = useState<{ id: string; email: string; displayName: string | null; role: string; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pending-users");
      if (res.ok) setUsers(await res.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const approve = async (id: string, email: string) => {
    setActing(id);
    try {
      const res = await fetch(`/api/admin/users/${id}/approve`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast({ title: `Approved ${email}` });
      setUsers(u => u.filter(x => x.id !== id));
    } catch { toast({ title: "Failed to approve", variant: "destructive" }); }
    finally { setActing(null); }
  };

  const reject = async (id: string, email: string) => {
    setActing(id);
    try {
      const res = await fetch(`/api/admin/users/${id}/reject`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast({ title: `Rejected ${email}` });
      setUsers(u => u.filter(x => x.id !== id));
    } catch { toast({ title: "Failed to reject", variant: "destructive" }); }
    finally { setActing(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Pending Approvals</h2>
          <p className="text-sm text-muted-foreground">Review and approve new user registrations.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-2">
            <CheckCircle className="h-10 w-10 text-green-500 mb-2" />
            <p className="font-medium">No pending approvals</p>
            <p className="text-sm text-muted-foreground">All registrations have been reviewed.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {users.map(u => (
            <Card key={u.id}>
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="font-medium truncate">{u.displayName ?? u.email}</p>
                  <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Registered {new Date(u.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-200 text-red-600 hover:bg-red-50"
                    disabled={acting === u.id}
                    onClick={() => reject(u.id, u.email)}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    disabled={acting === u.id}
                    onClick={() => approve(u.id, u.email)}
                  >
                    {acting === u.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                    Approve
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── LiveKit Accounts Tab ─── */
type LkAccount = {
  id: number; name: string; apiKey: string; serverUrl: string;
  isActive: boolean; priority: number; notes: string | null; createdAt: string;
};

function LiveKitAccountsTab() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<LkAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, { success: boolean; message: string }>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<LkAccount | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  const emptyForm = { name: "", apiKey: "", apiSecret: "", serverUrl: "wss://livekit.cloud", isActive: true, priority: 0, notes: "" };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/livekit-accounts");
      if (res.ok) setAccounts(await res.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setForm(emptyForm); setShowSecret(false); setAddOpen(true); };
  const openEdit = (a: LkAccount) => { setForm({ name: a.name, apiKey: a.apiKey, apiSecret: "", serverUrl: a.serverUrl, isActive: a.isActive, priority: a.priority, notes: a.notes ?? "" }); setShowSecret(false); setEditAccount(a); };

  const saveAdd = async () => {
    if (!form.name || !form.apiKey || !form.apiSecret || !form.serverUrl) {
      toast({ title: "All fields except notes are required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/livekit-accounts", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Account added" });
      setAddOpen(false);
      load();
    } catch { toast({ title: "Failed to add account", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const saveEdit = async () => {
    if (!editAccount) return;
    setSaving(true);
    try {
      const patch: Record<string, unknown> = { name: form.name, apiKey: form.apiKey, serverUrl: form.serverUrl, isActive: form.isActive, priority: form.priority, notes: form.notes };
      if (form.apiSecret) patch.apiSecret = form.apiSecret;
      const res = await fetch(`/api/admin/livekit-accounts/${editAccount.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Account updated" });
      setEditAccount(null);
      load();
    } catch { toast({ title: "Failed to update account", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleDelete = async (a: LkAccount) => {
    if (!confirm(`Delete account "${a.name}"? This cannot be undone.`)) return;
    try {
      await fetch(`/api/admin/livekit-accounts/${a.id}`, { method: "DELETE" });
      toast({ title: "Account deleted" });
      load();
    } catch { toast({ title: "Failed to delete", variant: "destructive" }); }
  };

  const handleTest = async (a: LkAccount) => {
    setTesting(a.id);
    try {
      const res = await fetch(`/api/admin/livekit-accounts/${a.id}/test`, { method: "POST" });
      const data = await res.json();
      setTestResults(r => ({ ...r, [a.id]: data }));
      toast({ title: data.success ? `✓ ${a.name}: Connected` : `✗ ${a.name}: ${data.message}`, variant: data.success ? "default" : "destructive" });
    } catch { toast({ title: "Test failed", variant: "destructive" }); }
    finally { setTesting(null); }
  };

  const handlePriority = async (a: LkAccount, dir: "up" | "down") => {
    const sorted = [...accounts].sort((x, y) => x.priority - y.priority);
    const idx = sorted.findIndex(x => x.id === a.id);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    await Promise.all([
      fetch(`/api/admin/livekit-accounts/${a.id}/set-priority`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ priority: other.priority }) }),
      fetch(`/api/admin/livekit-accounts/${other.id}/set-priority`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ priority: a.priority }) }),
    ]);
    load();
  };

  const handleToggleActive = async (a: LkAccount) => {
    await fetch(`/api/admin/livekit-accounts/${a.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !a.isActive }),
    });
    load();
  };

  const AccountFormFields = ({ form, setForm, showSecret, setShowSecret, isEdit }: {
    form: typeof emptyForm; setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
    showSecret: boolean; setShowSecret: (v: boolean) => void; isEdit?: boolean;
  }) => (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium">Account name</label>
        <Input className="mt-1" placeholder="e.g. LiveKit Cloud Primary" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      </div>
      <div>
        <label className="text-sm font-medium">API Key</label>
        <Input className="mt-1 font-mono text-xs" placeholder="APIxxxxxx" value={form.apiKey} onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))} />
      </div>
      <div>
        <label className="text-sm font-medium">API Secret {isEdit && <span className="text-xs text-muted-foreground ml-1">(leave blank to keep unchanged)</span>}</label>
        <div className="relative mt-1">
          <Input className="font-mono text-xs pr-9" type={showSecret ? "text" : "password"} placeholder={isEdit ? "••••••••" : "Enter API secret"} value={form.apiSecret} onChange={e => setForm(f => ({ ...f, apiSecret: e.target.value }))} />
          <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowSecret(!showSecret)}>
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div>
        <label className="text-sm font-medium">Server URL (WSS)</label>
        <Input className="mt-1 font-mono text-xs" placeholder="wss://your-project.livekit.cloud" value={form.serverUrl} onChange={e => setForm(f => ({ ...f, serverUrl: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">Priority (lower = first)</label>
          <Input className="mt-1" type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))} />
        </div>
        <div className="flex items-end pb-0.5 gap-2">
          <label className="text-sm font-medium">Active</label>
          <button type="button" onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
            className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${form.isActive ? "bg-green-500/15 border-green-500/30 text-green-400" : "bg-muted border-border text-muted-foreground"}`}>
            {form.isActive ? "Enabled" : "Disabled"}
          </button>
        </div>
      </div>
      <div>
        <label className="text-sm font-medium">Notes <span className="text-xs text-muted-foreground">(optional)</span></label>
        <Textarea className="mt-1 resize-none text-xs" rows={2} placeholder="e.g. Free tier, max 10 participants" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </div>
    </div>
  );

  const sorted = [...accounts].sort((a, b) => a.priority - b.priority);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Server className="h-5 w-5 text-blue-400" /> LiveKit Accounts</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage multiple LiveKit accounts. When a session drops (free-tier limit hit), the room automatically switches to the next active account by priority.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
          <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Account</Button>
        </div>
      </div>

      {/* info banner */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="py-3 px-4">
          <p className="text-sm text-blue-300/90 leading-relaxed">
            <strong>How it works:</strong> Accounts are tried in priority order (lowest number first). During a live session, if the room disconnects, participants see a "Connecting to backup server…" overlay and the system automatically generates a token for the next active account. The first account handles new sessions; backups only activate on failover.
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <Server className="h-10 w-10 text-muted-foreground mb-1" />
            <p className="font-medium">No LiveKit accounts configured</p>
            <p className="text-sm text-muted-foreground max-w-sm">Add your first account. If no accounts are added, sessions fall back to the <code className="text-xs bg-muted px-1 rounded">LIVEKIT_*</code> environment variables.</p>
            <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Account</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((a, idx) => {
            const testResult = testResults[a.id];
            return (
              <Card key={a.id} className={!a.isActive ? "opacity-60" : ""}>
                <CardContent className="py-4 px-4">
                  <div className="flex items-start gap-4">
                    {/* Priority arrows */}
                    <div className="flex flex-col gap-0.5 shrink-0 mt-0.5">
                      <button disabled={idx === 0} onClick={() => handlePriority(a, "up")} className="p-0.5 hover:text-foreground text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronUp className="h-4 w-4" /></button>
                      <span className="text-xs text-center text-muted-foreground font-mono">{a.priority}</span>
                      <button disabled={idx === sorted.length - 1} onClick={() => handlePriority(a, "down")} className="p-0.5 hover:text-foreground text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronDown className="h-4 w-4" /></button>
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{a.name}</span>
                        {idx === 0 && a.isActive && <Badge variant="outline" className="text-xs text-blue-400 border-blue-400/30">Primary</Badge>}
                        <Badge variant="outline" className={`text-xs ${a.isActive ? "text-green-400 border-green-400/30" : "text-muted-foreground"}`}>
                          {a.isActive ? "Active" : "Disabled"}
                        </Badge>
                        {testResult && (
                          <Badge variant="outline" className={`text-xs ${testResult.success ? "text-green-400 border-green-400/30" : "text-red-400 border-red-400/30"}`}>
                            {testResult.success ? <><Wifi className="h-3 w-3 mr-1" />Connected</> : <><WifiOff className="h-3 w-3 mr-1" />Failed</>}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 font-mono truncate">{a.serverUrl}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Key: <span className="font-mono">{a.apiKey.slice(0, 8)}…</span></p>
                      {a.notes && <p className="text-xs text-muted-foreground mt-1 italic">{a.notes}</p>}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      <Button size="sm" variant="outline" onClick={() => handleTest(a)} disabled={testing === a.id}>
                        {testing === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
                        <span className="ml-1 text-xs">Test</span>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleToggleActive(a)}>
                        {a.isActive ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
                        <span className="ml-1 text-xs">{a.isActive ? "Disable" : "Enable"}</span>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" /><span className="ml-1 text-xs">Edit</span></Button>
                      <Button size="sm" variant="outline" className="text-red-400 hover:text-red-300 border-red-400/20" onClick={() => handleDelete(a)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add LiveKit Account</DialogTitle></DialogHeader>
          <AccountFormFields form={form} setForm={setForm} showSecret={showSecret} setShowSecret={setShowSecret} />
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={saveAdd} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}Add</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editAccount} onOpenChange={open => { if (!open) setEditAccount(null); }}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Account: {editAccount?.name}</DialogTitle></DialogHeader>
          <AccountFormFields form={form} setForm={setForm} showSecret={showSecret} setShowSecret={setShowSecret} isEdit />
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setEditAccount(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ════════════════════════════════════════════
   GROUPS TAB
════════════════════════════════════════════ */
type Group = { id: number; name: string; description: string | null; createdBy: string; createdAt: string; memberCount: number };
type GroupMemberRow = { id: number; groupId: number; userId: string; displayName: string | null; email: string | null; role: string | null; addedAt: string };
type AvailableUser = { id: string; displayName: string | null; email: string | null; role: string | null };

function GroupDetail({ group, onBack, onDelete }: { group: Group; onBack: () => void; onDelete: () => void }) {
  const { toast } = useToast();
  const [members, setMembers] = useState<GroupMemberRow[]>([]);
  const [available, setAvailable] = useState<AvailableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addSearch, setAddSearch] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [editName, setEditName] = useState(group.name);
  const [editDesc, setEditDesc] = useState(group.description ?? "");
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [m, a] = await Promise.all([
      fetch(`/api/admin/groups/${group.id}/members`).then((r) => r.ok ? r.json() : []),
      fetch(`/api/admin/groups/${group.id}/available-users`).then((r) => r.ok ? r.json() : []),
    ]);
    setMembers(m); setAvailable(a); setLoading(false);
  }, [group.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const removeMember = async (userId: string) => {
    setRemovingId(userId);
    try {
      const r = await fetch(`/api/admin/groups/${group.id}/members/${userId}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      toast({ title: "Member removed" });
      loadAll();
    } catch { toast({ title: "Failed to remove", variant: "destructive" }); }
    finally { setRemovingId(null); }
  };

  const addMember = async (userId: string) => {
    setAddingId(userId);
    try {
      const r = await fetch(`/api/admin/groups/${group.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!r.ok) throw new Error();
      toast({ title: "Member added" });
      loadAll();
    } catch { toast({ title: "Failed to add", variant: "destructive" }); }
    finally { setAddingId(null); }
  };

  const saveGroup = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || null }),
      });
      if (!r.ok) throw new Error();
      toast({ title: "Group updated" });
    } catch { toast({ title: "Failed to update", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const filteredMembers = members.filter((m) =>
    !search || (m.displayName ?? m.email ?? "").toLowerCase().includes(search.toLowerCase()) || (m.email ?? "").toLowerCase().includes(search.toLowerCase()),
  );
  const filteredAvailable = available.filter((u) =>
    !addSearch || (u.displayName ?? u.email ?? "").toLowerCase().includes(addSearch.toLowerCase()) || (u.email ?? "").toLowerCase().includes(addSearch.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-1">
          <X className="h-4 w-4" /> Back to Groups
        </Button>
        <div className="flex-1" />
        <Button variant="destructive" size="sm" onClick={onDelete} className="gap-1.5">
          <Trash2 className="h-3.5 w-3.5" /> Delete Group
        </Button>
      </div>

      {/* Edit group name / description */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">Group Details</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Group Name *</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Group name" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
            <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} placeholder="Optional description…" />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={saveGroup} disabled={saving || !editName.trim()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Current members */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Members ({members.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members…" className="pl-8 h-8 text-xs" />
            </div>
            {loading ? (
              <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : filteredMembers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">{search ? "No matching members" : "No members yet"}</p>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {filteredMembers.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 rounded-lg p-2 hover:bg-secondary/40 group">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-semibold text-primary">{(m.displayName ?? m.email ?? "?")[0].toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{m.displayName ?? "—"}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{m.email}</p>
                    </div>
                    {m.role && <span className="text-[10px] text-muted-foreground capitalize shrink-0">{m.role}</span>}
                    <Button
                      size="sm" variant="ghost"
                      className="h-6 w-6 p-0 text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      disabled={removingId === m.userId}
                      onClick={() => removeMember(m.userId)}
                    >
                      {removingId === m.userId ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Available users to add */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-emerald-500" />
              Add Members ({available.length} available)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={addSearch} onChange={(e) => setAddSearch(e.target.value)} placeholder="Search users…" className="pl-8 h-8 text-xs" />
            </div>
            {loading ? (
              <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : filteredAvailable.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">{addSearch ? "No matching users" : "All users are already in this group"}</p>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {filteredAvailable.slice(0, 50).map((u) => (
                  <div key={u.id} className="flex items-center gap-2 rounded-lg p-2 hover:bg-secondary/40">
                    <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-semibold text-muted-foreground">{(u.displayName ?? u.email ?? "?")[0].toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{u.displayName ?? "—"}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                    </div>
                    {u.role && <span className="text-[10px] text-muted-foreground capitalize shrink-0">{u.role}</span>}
                    <Button
                      size="sm" variant="outline"
                      className="h-6 px-2 text-[10px] shrink-0"
                      disabled={addingId === u.id}
                      onClick={() => addMember(u.id)}
                    >
                      {addingId === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    </Button>
                  </div>
                ))}
                {filteredAvailable.length > 50 && <p className="text-[10px] text-muted-foreground text-center py-1">Showing 50 of {filteredAvailable.length} — use search to narrow down</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function GroupsTab() {
  const { toast } = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [openGroup, setOpenGroup] = useState<Group | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/groups");
      if (r.ok) setGroups(await r.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/admin/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName.trim(), description: createDesc.trim() || undefined }),
      });
      if (!r.ok) throw new Error();
      toast({ title: "Group created!" });
      setShowCreate(false); setCreateName(""); setCreateDesc("");
      loadGroups();
    } catch { toast({ title: "Failed to create group", variant: "destructive" }); }
    finally { setCreating(false); }
  };

  const deleteGroup = async (id: number) => {
    if (!confirm("Delete this group? All members will be removed.")) return;
    try {
      await fetch(`/api/admin/groups/${id}`, { method: "DELETE" });
      toast({ title: "Group deleted" });
      if (openGroup?.id === id) setOpenGroup(null);
      loadGroups();
    } catch { toast({ title: "Failed to delete", variant: "destructive" }); }
  };

  if (openGroup) {
    return (
      <GroupDetail
        group={openGroup}
        onBack={() => { setOpenGroup(null); loadGroups(); }}
        onDelete={() => { deleteGroup(openGroup.id); setOpenGroup(null); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="text-base font-semibold">Groups</h2>
          <p className="text-xs text-muted-foreground">Platform-wide groups — add any user to a group to label them on their dashboard.</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)} className="gap-1.5 ml-auto">
          <Plus className="h-3.5 w-3.5" /> New Group
        </Button>
      </div>

      {showCreate && (
        <Card className="border-primary/30 bg-primary/3">
          <CardContent className="pt-4">
            <form onSubmit={createGroup} className="space-y-3">
              <p className="text-sm font-semibold mb-2">Create New Group</p>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Group Name *</label>
                <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="e.g. VIP Students, Mentorship Cohort A" required />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
                <Textarea value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} rows={2} placeholder="Optional description…" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={creating || !createName.trim()}>{creating ? "Creating…" : "Create Group"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1,2,3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : groups.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-25" />
            <p className="font-medium text-foreground">No groups yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Create groups to organise and label platform users.</p>
            <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> New Group</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <Card key={g.id} className="cursor-pointer hover:border-primary/40 transition-colors group" onClick={() => setOpenGroup(g)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm font-semibold truncate">{g.name}</CardTitle>
                    {g.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{g.description}</p>}
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={(e) => { e.stopPropagation(); deleteGroup(g.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  <span>{g.memberCount} member{g.memberCount !== 1 ? "s" : ""}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>Created {new Date(g.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   SUBSCRIPTIONS TAB
════════════════════════════════════════════ */
type PlanRow = { plan: string; label: string; durationMonths: number; priceUsdt: number; priceFiat: number; enabled: boolean };
type PlatformSub = {
  id: number; userId: string; userEmail: string; userName: string;
  plan: string; status: string; txHash: string | null;
  adminNote: string | null; priceUsdt: number | null;
  startDate: string | null; endDate: string | null; createdAt: string;
};

function SubscriptionsTab() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [planEdits, setPlanEdits] = useState<Record<string, { priceUsdt: string; priceFiat: string; enabled: boolean }>>({});
  const [submissions, setSubmissions] = useState<PlatformSub[]>([]);
  const [statusFilter, setStatusFilter] = useState("pending_payment");
  const [loading, setLoading] = useState(true);
  const [savingPlan, setSavingPlan] = useState<string | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<string | null>(null);
  const [showNewPlanDialog, setShowNewPlanDialog] = useState(false);
  const [newPlanKey, setNewPlanKey] = useState("");
  const [newPlanLabel, setNewPlanLabel] = useState("");
  const [newPlanMonths, setNewPlanMonths] = useState("1");
  const [newPlanUsdt, setNewPlanUsdt] = useState("");
  const [newPlanFiat, setNewPlanFiat] = useState("");
  const [savingNewPlan, setSavingNewPlan] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const [paySettings, setPaySettings] = useState({ usdtAddress: "", bscscanApiKey: "" });
  const [paySettingsEdits, setPaySettingsEdits] = useState({ usdtAddress: "", bscscanApiKey: "" });
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingPaySettings, setSavingPaySettings] = useState(false);

  const loadPaySettings = async () => {
    try {
      const r = await fetch("/api/admin/payment-settings");
      if (!r.ok) return;
      const data = await r.json() as { usdtAddress: string; bscscanApiKey: string };
      if (data && typeof data === "object" && !Array.isArray(data) && !("error" in data)) {
        setPaySettings(data);
        setPaySettingsEdits(data);
      }
    } catch { /* ignore */ }
  };

  const loadPlans = async () => {
    try {
      const r = await fetch("/api/admin/subscription-plans");
      if (!r.ok) return;
      const data = await r.json();
      if (Array.isArray(data)) {
        setPlans(data as PlanRow[]);
        const edits: typeof planEdits = {};
        (data as PlanRow[]).forEach((p) => { edits[p.plan] = { priceUsdt: String(p.priceUsdt), priceFiat: String(p.priceFiat), enabled: p.enabled }; });
        setPlanEdits(edits);
      }
    } catch { /* ignore */ }
  };

  const loadSubs = async () => {
    try {
      const r = await fetch(`/api/admin/platform-subscriptions${statusFilter ? `?status=${statusFilter}` : ""}`);
      if (!r.ok) return;
      const data = await r.json();
      if (Array.isArray(data)) setSubmissions(data as PlatformSub[]);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    Promise.all([loadPaySettings(), loadPlans(), loadSubs()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => { setLoading(true); loadSubs().finally(() => setLoading(false)); }, [statusFilter]);

  const savePaySettings = async () => {
    setSavingPaySettings(true);
    try {
      const r = await fetch("/api/admin/payment-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paySettingsEdits),
      });
      if (!r.ok) throw new Error("Failed");
      toast({ title: "Payment settings saved" });
      await loadPaySettings();
    } catch { toast({ title: "Failed to save", variant: "destructive" }); }
    finally { setSavingPaySettings(false); }
  };

  const savePlan = async (plan: string) => {
    setSavingPlan(plan);
    try {
      const edit = planEdits[plan];
      const r = await fetch(`/api/admin/subscription-plans/${plan}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceUsdt: parseFloat(edit.priceUsdt), priceFiat: parseFloat(edit.priceFiat), enabled: edit.enabled }),
      });
      if (!r.ok) throw new Error("Failed");
      toast({ title: `${plan} plan saved` });
      await loadPlans();
    } catch { toast({ title: "Failed to save plan", variant: "destructive" }); }
    finally { setSavingPlan(null); }
  };

  const createNewPlan = async () => {
    if (!newPlanKey.trim() || !newPlanLabel.trim() || !newPlanUsdt.trim()) {
      toast({ title: "Plan ID, label, and USDT price are required", variant: "destructive" }); return;
    }
    setSavingNewPlan(true);
    try {
      const r = await fetch("/api/admin/subscription-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: newPlanKey.trim(),
          label: newPlanLabel.trim(),
          durationMonths: parseInt(newPlanMonths) || 1,
          priceUsdt: parseFloat(newPlanUsdt),
          priceFiat: parseFloat(newPlanFiat) || 0,
          enabled: true,
        }),
      });
      const d = await r.json() as { error?: string };
      if (!r.ok) throw new Error(d.error ?? "Failed");
      toast({ title: "Plan created!" });
      setShowNewPlanDialog(false);
      setNewPlanKey(""); setNewPlanLabel(""); setNewPlanMonths("1"); setNewPlanUsdt(""); setNewPlanFiat("");
      await loadPlans();
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Failed to create plan", variant: "destructive" });
    } finally { setSavingNewPlan(false); }
  };

  const deletePlan = async (plan: string) => {
    if (!confirm(`Delete plan "${plan}"? This cannot be undone.`)) return;
    setDeletingPlan(plan);
    try {
      await fetch(`/api/admin/subscription-plans/${plan}`, { method: "DELETE" });
      toast({ title: "Plan deleted" });
      await loadPlans();
    } catch { toast({ title: "Failed to delete plan", variant: "destructive" }); }
    finally { setDeletingPlan(null); }
  };

  const actOnSub = async (id: number, action: "approve" | "reject", note?: string) => {
    setActingId(id);
    try {
      const r = await fetch(`/api/admin/platform-subscriptions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, adminNote: note ?? "" }),
      });
      if (!r.ok) throw new Error("Failed");
      toast({ title: action === "approve" ? "Subscription approved" : "Submission rejected" });
      await loadSubs();
    } catch { toast({ title: "Failed", variant: "destructive" }); }
    finally { setActingId(null); setRejectId(null); setRejectNote(""); }
  };

  const STATUS_COLORS: Record<string, string> = {
    pending_payment: "text-amber-400 border-amber-400/30",
    active:          "text-green-400 border-green-400/30",
    expired:         "text-muted-foreground",
    rejected:        "text-red-400 border-red-400/30",
  };

  const PLAN_LABELS: Record<string, string> = { "1m": "1 Month", "3m": "3 Months", "6m": "6 Months", "1y": "1 Year" };

  if (loading) return (
    <div className="flex items-center gap-2 text-muted-foreground py-10"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
  );

  return (
    <div className="space-y-6">
      {/* Payment Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" />USDT Payment Settings
          </CardTitle>
          <p className="text-sm text-muted-foreground">Configure the BEP-20 deposit address and BscScan API key for automated payment detection.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">USDT Deposit Address (BEP-20)</label>
            <Input
              placeholder="0x..."
              value={paySettingsEdits.usdtAddress}
              onChange={(e) => setPaySettingsEdits((p) => ({ ...p, usdtAddress: e.target.value }))}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">All user payments will be sent to this address. Keep it secure.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">BscScan API Key</label>
            <div className="relative">
              <Input
                type={showApiKey ? "text" : "password"}
                placeholder="Get a free key at bscscan.com/apis"
                value={paySettingsEdits.bscscanApiKey}
                onChange={(e) => setPaySettingsEdits((p) => ({ ...p, bscscanApiKey: e.target.value }))}
                className="pr-10 font-mono text-sm"
              />
              <button type="button" onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Used to verify incoming USDT transactions on BSC. Without this, the poller uses a shared rate-limited key.</p>
          </div>
          {paySettings.usdtAddress && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-500">
              <CheckCircle className="h-3.5 w-3.5 shrink-0" />
              <span>Active deposit address: <code className="font-mono">{paySettings.usdtAddress.slice(0, 10)}…{paySettings.usdtAddress.slice(-6)}</code></span>
            </div>
          )}
          <Button onClick={savePaySettings} disabled={savingPaySettings} className="w-full sm:w-auto">
            {savingPaySettings ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Payment Settings
          </Button>
        </CardContent>
      </Card>

      {/* Plan pricing */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4" />Copy Trading Plans
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">Set USDT and fiat prices for each plan. Plans appear on the paywall page.</p>
            </div>
            <Button size="sm" onClick={() => setShowNewPlanDialog(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />New Plan
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {plans.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No plans yet. Click "New Plan" to create your first subscription plan.</p>
            )}
            {plans.map((p) => {
              const edit = planEdits[p.plan] ?? { priceUsdt: String(p.priceUsdt), priceFiat: String(p.priceFiat), enabled: p.enabled };
              return (
                <div key={p.plan} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/20">
                  <div className="w-24 shrink-0">
                    <p className="font-semibold text-sm">{p.label}</p>
                    <p className="text-xs text-muted-foreground font-mono">{p.plan} · {p.durationMonths}mo</p>
                  </div>
                  <div className="flex items-center gap-2 flex-1">
                    <div className="relative flex-1 max-w-[120px]">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-bold">$</span>
                      <Input
                        type="number" min="0" step="1"
                        className="pl-6 h-8 text-sm"
                        value={edit.priceUsdt}
                        onChange={(e) => setPlanEdits((prev) => ({ ...prev, [p.plan]: { ...edit, priceUsdt: e.target.value } }))}
                        placeholder="USDT"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">USDT</span>
                    </div>
                    <div className="relative flex-1 max-w-[120px]">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-bold">$</span>
                      <Input
                        type="number" min="0" step="1"
                        className="pl-6 h-8 text-sm"
                        value={edit.priceFiat}
                        onChange={(e) => setPlanEdits((prev) => ({ ...prev, [p.plan]: { ...edit, priceFiat: e.target.value } }))}
                        placeholder="Fiat"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">USD</span>
                    </div>
                    <label className="flex items-center gap-1.5 text-sm shrink-0 cursor-pointer">
                      <input type="checkbox" checked={edit.enabled}
                        onChange={(e) => setPlanEdits((prev) => ({ ...prev, [p.plan]: { ...edit, enabled: e.target.checked } }))}
                        className="rounded border-border" />
                      Enabled
                    </label>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="outline" className="h-8"
                      onClick={() => savePlan(p.plan)} disabled={savingPlan === p.plan}>
                      {savingPlan === p.plan ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => deletePlan(p.plan)} disabled={deletingPlan === p.plan}>
                      {deletingPlan === p.plan ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* New Plan Dialog */}
      <Dialog open={showNewPlanDialog} onOpenChange={setShowNewPlanDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Subscription Plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Plan ID <span className="text-muted-foreground text-xs">(unique key)</span></label>
                <Input placeholder="e.g. 2m, weekly, vip" value={newPlanKey}
                  onChange={(e) => setNewPlanKey(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} />
                <p className="text-[11px] text-muted-foreground">Lowercase letters, numbers, hyphens only</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Display Label</label>
                <Input placeholder="e.g. 2 Months, Weekly, VIP" value={newPlanLabel}
                  onChange={(e) => setNewPlanLabel(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Duration (months)</label>
              <Input type="number" min="1" step="1" placeholder="1" value={newPlanMonths}
                onChange={(e) => setNewPlanMonths(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">USDT Price</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                  <Input type="number" min="0" step="1" className="pl-5" placeholder="49"
                    value={newPlanUsdt} onChange={(e) => setNewPlanUsdt(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Fiat Price <span className="text-muted-foreground text-xs">(optional)</span></label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                  <Input type="number" min="0" step="1" className="pl-5" placeholder="49"
                    value={newPlanFiat} onChange={(e) => setNewPlanFiat(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setShowNewPlanDialog(false)}>Cancel</Button>
              <Button onClick={createNewPlan} disabled={savingNewPlan}>
                {savingNewPlan ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Create Plan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment submissions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <CheckCircle className="h-4 w-4" />Payment Submissions
            <div className="ml-auto flex gap-1.5">
              {(["pending_payment","active","rejected",""] as const).map((s) => (
                <button key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all",
                    statusFilter === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}>
                  {s === "" ? "All" : s === "pending_payment" ? "Pending" : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />Loading…
            </div>
          ) : submissions.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">No submissions found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                    <th className="text-left px-4 py-3">User</th>
                    <th className="text-left px-4 py-3">Plan</th>
                    <th className="text-left px-4 py-3">Amount</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">TX Hash (auto-detected)</th>
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((sub) => (
                    <tr key={sub.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium">{sub.userName}</p>
                        <p className="text-xs text-muted-foreground">{sub.userEmail}</p>
                      </td>
                      <td className="px-4 py-3 font-medium">{PLAN_LABELS[sub.plan] ?? sub.plan}</td>
                      <td className="px-4 py-3 font-mono text-sm">
                        {sub.priceUsdt != null ? `$${Number(sub.priceUsdt).toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={STATUS_COLORS[sub.status] ?? ""}>
                          {sub.status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {sub.txHash ? (
                            <>
                              <code className="text-xs bg-secondary rounded px-1.5 py-0.5 max-w-[140px] truncate block">{sub.txHash}</code>
                              <a href={`https://bscscan.com/tx/${sub.txHash}`} target="_blank" rel="noopener noreferrer"
                                className="text-primary hover:underline text-xs shrink-0">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">awaiting detection…</span>
                          )}
                        </div>
                        {sub.adminNote && <p className="text-xs text-muted-foreground mt-0.5 italic">{sub.adminNote}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(sub.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        {sub.status === "pending_payment" && (
                          <div className="flex items-center gap-1.5 justify-end">
                            <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => actOnSub(sub.id, "approve")} disabled={actingId === sub.id}>
                              <CheckCircle className="h-3 w-3 mr-1" />Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                              onClick={() => { setRejectId(sub.id); setRejectNote(""); }} disabled={actingId === sub.id}>
                              <XCircle className="h-3 w-3 mr-1" />Reject
                            </Button>
                          </div>
                        )}
                        {sub.status === "active" && sub.endDate && (
                          <p className="text-xs text-green-500 text-right">Expires {new Date(sub.endDate).toLocaleDateString()}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reject note dialog */}
      <Dialog open={rejectId !== null} onOpenChange={(v) => { if (!v) { setRejectId(null); setRejectNote(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reject Submission</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">Optionally add a note explaining the rejection.</p>
            <Textarea placeholder="Reason (optional)…" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={3} />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setRejectId(null); setRejectNote(""); }}>Cancel</Button>
              <Button variant="destructive" onClick={() => rejectId && actOnSub(rejectId, "reject", rejectNote)}
                disabled={actingId !== null}>
                {actingId !== null ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


/* ════════════════════════════════════════════
   MAIN ADMIN PANEL
════════════════════════════════════════════ */
export default function AdminPanel() {
  const [, navigate] = useLocation();
  useSearch(); // subscribe to search changes for reactivity
  const activeTab = new URLSearchParams(window.location.search).get("tab") ?? "overview";
  const { data: users } = useListUsers({});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">Platform-wide analytics, user management, and content control.</p>
      </div>

      <Tabs value={activeTab} onValueChange={tab => navigate(`/admin?tab=${tab}`)}>
        <TabsList className="flex flex-wrap h-auto gap-0.5 bg-muted/50 p-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="courses">Courses</TabsTrigger>
          <TabsTrigger value="live-classes">Live Classes</TabsTrigger>
          <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
          <TabsTrigger value="community">Community</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="broadcast">Broadcast</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="landing">Landing</TabsTrigger>
          <TabsTrigger value="groups" className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />Groups
          </TabsTrigger>
          <TabsTrigger value="livekit" className="flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5" />LiveKit
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5" />Subscriptions
          </TabsTrigger>
          <TabsTrigger value="trading" className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />Trading
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6"><OverviewTab /></TabsContent>
        <TabsContent value="pending" className="mt-6"><PendingTab /></TabsContent>
        <TabsContent value="users" className="mt-6"><UsersTab /></TabsContent>
        <TabsContent value="courses" className="mt-6"><CoursesTab /></TabsContent>
        <TabsContent value="live-classes" className="mt-6"><AdminLiveClassesTab /></TabsContent>
        <TabsContent value="enrollments" className="mt-6"><EnrollmentsTab /></TabsContent>
        <TabsContent value="community" className="mt-6"><CommunityTab /></TabsContent>
        <TabsContent value="events" className="mt-6"><EventsTab /></TabsContent>
        <TabsContent value="broadcast" className="mt-6"><BroadcastTab /></TabsContent>
        <TabsContent value="activity" className="mt-6"><ActivityTab /></TabsContent>
        <TabsContent value="landing" className="mt-6"><LandingPageTab /></TabsContent>
        <TabsContent value="groups" className="mt-6"><GroupsTab /></TabsContent>
        <TabsContent value="livekit" className="mt-6"><LiveKitAccountsTab /></TabsContent>
        <TabsContent value="subscriptions" className="mt-6"><SubscriptionsTab /></TabsContent>
        <TabsContent value="trading" className="mt-6"><TradingTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ════════════════════════════════════════════
   TRADING TAB
════════════════════════════════════════════ */
type AdminTrader = {
  id: number; userId: string; displayName: string; email: string; avatarUrl: string | null;
  status: string; verified: boolean; roi: number | null; winRate: number | null;
  maxDrawdown: number | null; totalTrades: number | null; followers: number | null;
  monthlyReturn: number | null; riskScore: number | null;
  markets: string[] | null; strategy: string | null;
  masterAccount: { status: string; type: string } | null;
  activeCopiers: number; createdAt: string;
};
type AdminSignal = {
  id: number; traderId: number | null; traderName: string; symbol: string; market: string;
  action: string; orderType: string; price: number | null; quantity: number | null;
  stopLoss: number | null; takeProfit: number | null; leverage: number | null;
  notes: string | null; status: string; executedAt: string | null;
  totalCopies: number; executedCopies: number; createdAt: string;
};
type AdminCopySub = {
  id: number; userId: string; traderId: number; status: string;
  userName: string; userEmail: string; traderName: string;
  allocatedAmount: number | null; maxAmount: number | null;
  lotMultiplier: number | null; currentPnl: number | null; createdAt: string;
};
type AdminPosition = {
  id: number; traderId: number; traderName: string; symbol: string; side: string;
  size: number | null; entryPrice: number | null; stopLoss: number | null;
  takeProfit: number | null; leverage: number | null; market: string | null;
  brokerPositionId: string | null; updatedAt: string;
};

function TradingTab() {
  const { toast } = useToast();
  const [section, setSection] = useState<"traders" | "signals" | "copiers" | "positions">("traders");
  const [traders, setTraders] = useState<AdminTrader[]>([]);
  const [signals, setSignals] = useState<AdminSignal[]>([]);
  const [copiers, setCopiers] = useState<AdminCopySub[]>([]);
  const [positions, setPositions] = useState<AdminPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | null>(null);

  /* Integration config */
  type IntegrationStatus = {
    metaapiTokenSet: boolean; metaapiStrategySet: boolean;
    metaapiToken: string; metaapiStrategy: string;
    vultrApiKeySet: boolean; vultrApiKeyHint: string;
  };
  const [metaapiToken, setMetaapiToken] = useState("");
  const [metaapiStrategy, setMetaapiStrategy] = useState("");
  const [showMetaapiToken, setShowMetaapiToken] = useState(false);
  const [metaapiStatus, setMetaapiStatus] = useState<IntegrationStatus | null>(null);
  const [metaapiSaving, setMetaapiSaving] = useState(false);
  const [vultrKey, setVultrKey] = useState("");
  const [showVultrKey, setShowVultrKey] = useState(false);
  const [vultrSaving, setVultrSaving] = useState(false);

  /* Copy-trading disclaimer */
  const [disclaimer, setDisclaimer] = useState("");
  const [disclaimerSaving, setDisclaimerSaving] = useState(false);

  const loadDisclaimer = async () => {
    try {
      const r = await fetch("/api/admin/copy-trading-disclaimer");
      if (r.ok) { const d = await r.json() as { text: string }; setDisclaimer(d.text); }
    } catch { /* ignore */ }
  };

  const saveDisclaimer = async () => {
    setDisclaimerSaving(true);
    try {
      const r = await fetch("/api/admin/copy-trading-disclaimer", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: disclaimer }),
      });
      if (!r.ok) throw new Error("Failed");
      toast({ title: "Disclaimer saved" });
    } catch { toast({ title: "Failed to save", variant: "destructive" }); }
    finally { setDisclaimerSaving(false); }
  };

  /* Trading pairs */
  type TradingPair = { symbol: string; market: string };
  const [pairs, setPairs] = useState<TradingPair[]>([]);
  const [pairsSaving, setPairsSaving] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [newMarket, setNewMarket] = useState("forex");

  const loadPairs = async () => {
    try {
      const r = await fetch("/api/admin/trading-pairs");
      if (r.ok) setPairs(await r.json() as TradingPair[]);
    } catch { /* ignore */ }
  };

  const savePairs = async (updated: TradingPair[]) => {
    setPairsSaving(true);
    try {
      const r = await fetch("/api/admin/trading-pairs", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated),
      });
      if (!r.ok) throw new Error("Failed");
      setPairs(updated);
      toast({ title: "Trading pairs saved" });
    } catch { toast({ title: "Failed to save", variant: "destructive" }); }
    finally { setPairsSaving(false); }
  };

  const addPair = () => {
    const sym = newSymbol.trim().toUpperCase();
    if (!sym) return;
    if (pairs.some((p) => p.symbol === sym && p.market === newMarket)) {
      toast({ title: "Pair already exists", variant: "destructive" }); return;
    }
    const updated = [...pairs, { symbol: sym, market: newMarket }];
    setNewSymbol("");
    void savePairs(updated);
  };

  const removePair = (symbol: string, market: string) => {
    void savePairs(pairs.filter((p) => !(p.symbol === symbol && p.market === market)));
  };

  /* VPS management */
  type ManagedVps = {
    id: number; copyAccountId: number; userId: string;
    instanceId: string | null; ipAddress: string | null; status: string;
    region: string; plan: string; monthlyCost: string | null;
    errorMessage: string | null; createdAt: string;
    accountLabel: string | null; accountType: string | null;
  };
  const [vpsList, setVpsList] = useState<ManagedVps[]>([]);
  const [vpsLoading, setVpsLoading] = useState(false);

  const loadVps = async () => {
    setVpsLoading(true);
    try {
      const r = await fetch("/api/admin/vps");
      if (r.ok) setVpsList(await r.json() as ManagedVps[]);
    } catch { /* ignore */ } finally { setVpsLoading(false); }
  };

  useEffect(() => {
    fetch("/api/admin/integration-settings")
      .then((r) => r.json())
      .then((d: IntegrationStatus) => { setMetaapiStatus(d); if (d.metaapiStrategy) setMetaapiStrategy(d.metaapiStrategy); })
      .catch(() => {});
    void loadVps();
    void loadPairs();
    void loadDisclaimer();
  }, []);

  const saveMetaapiConfig = async () => {
    setMetaapiSaving(true);
    try {
      const body: Record<string, string> = {};
      if (metaapiToken.trim())    body.metaapiToken    = metaapiToken.trim();
      if (metaapiStrategy.trim()) body.metaapiStrategy = metaapiStrategy.trim();
      const r = await fetch("/api/admin/integration-settings", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) { const d = await r.json() as { error: string }; throw new Error(d.error); }
      const updated = await fetch("/api/admin/integration-settings").then((x) => x.json()) as IntegrationStatus;
      setMetaapiStatus(updated);
      if (updated?.metaapiStrategy) setMetaapiStrategy(updated.metaapiStrategy);
      setMetaapiToken("");
      toast({ title: "MetaAPI settings saved" });
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Failed to save", variant: "destructive" });
    } finally { setMetaapiSaving(false); }
  };

  const saveVultrKey = async () => {
    if (!vultrKey.trim()) return;
    setVultrSaving(true);
    try {
      const r = await fetch("/api/admin/integration-settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vultrApiKey: vultrKey.trim() }),
      });
      if (!r.ok) { const d = await r.json() as { error: string }; throw new Error(d.error); }
      const updated = await fetch("/api/admin/integration-settings").then((x) => x.json()) as IntegrationStatus;
      setMetaapiStatus(updated);
      setVultrKey("");
      toast({ title: "Vultr API key saved" });
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Failed to save", variant: "destructive" });
    } finally { setVultrSaving(false); }
  };

  const rebootVps = async (id: number) => {
    try {
      await fetch(`/api/admin/vps/${id}/reboot`, { method: "POST" });
      toast({ title: "Reboot sent" });
    } catch { toast({ title: "Reboot failed", variant: "destructive" }); }
  };

  const destroyVps = async (id: number) => {
    if (!confirm("Destroy this VPS? The copier's trades will stop executing.")) return;
    try {
      await fetch(`/api/admin/vps/${id}`, { method: "DELETE" });
      toast({ title: "VPS destroyed" });
      await loadVps();
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  };

  const loadSection = useCallback(async (s: typeof section) => {
    setLoading(true);
    try {
      const endpoints: Record<typeof section, string> = {
        traders: "/api/admin/trading/traders",
        signals: "/api/admin/trading/signals",
        copiers: "/api/admin/trading/copy-subscriptions",
        positions: "/api/admin/trading/positions",
      };
      const r = await fetch(endpoints[s]);
      if (!r.ok) return;
      const data = await r.json();
      if (!Array.isArray(data)) return;
      if (s === "traders") setTraders(data as AdminTrader[]);
      else if (s === "signals") setSignals(data as AdminSignal[]);
      else if (s === "copiers") setCopiers(data as AdminCopySub[]);
      else if (s === "positions") setPositions(data as AdminPosition[]);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadSection(section); }, [section, loadSection]);

  const patchTrader = async (id: number, patch: { verified?: boolean; status?: string }) => {
    setActingId(id);
    try {
      const r = await fetch(`/api/admin/trading/traders/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error("Failed");
      toast({ title: "Trader updated" });
      await loadSection("traders");
    } catch { toast({ title: "Failed to update", variant: "destructive" }); }
    finally { setActingId(null); }
  };

  const removeTrader = async (id: number, name: string) => {
    if (!confirm(`Remove trader profile for "${name}"? They will lose access to the Trader Panel.`)) return;
    setActingId(id);
    try {
      const r = await fetch(`/api/admin/trading/traders/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed");
      toast({ title: `${name} removed as trader` });
      await loadSection("traders");
    } catch { toast({ title: "Failed to remove trader", variant: "destructive" }); }
    finally { setActingId(null); }
  };

  const SECTIONS = [
    { key: "traders" as const, label: "Traders" },
    { key: "signals" as const, label: "Signals" },
    { key: "copiers" as const, label: "Copiers" },
    { key: "positions" as const, label: "Live Positions" },
  ];

  const ACTION_COLORS: Record<string, string> = {
    buy: "text-green-400 border-green-400/30",
    sell: "text-red-400 border-red-400/30",
    close: "text-muted-foreground",
  };
  const STATUS_COLORS: Record<string, string> = {
    active: "text-green-400 border-green-400/30",
    inactive: "text-muted-foreground",
    suspended: "text-red-400 border-red-400/30",
    paused: "text-amber-400 border-amber-400/30",
    stopped: "text-muted-foreground",
    executed: "text-green-400 border-green-400/30",
    pending: "text-amber-400 border-amber-400/30",
    failed: "text-red-400 border-red-400/30",
    skipped: "text-muted-foreground",
  };

  return (
    <div className="space-y-4">
      {/* Section switcher */}
      <div className="flex gap-1.5 flex-wrap">
        {SECTIONS.map((s) => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={cn("px-4 py-1.5 rounded-full text-sm font-medium border transition-all",
              section === s.key
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}>
            {s.label}
          </button>
        ))}
        <button onClick={() => loadSection(section)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="h-3.5 w-3.5" />Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />Loading…
        </div>
      ) : (
        <>
          {/* ── TRADERS ── */}
          {section === "traders" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />Trader Profiles
                  <Badge variant="outline" className="ml-auto text-xs">{traders.length} total</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {traders.length === 0 ? (
                  <p className="text-center py-10 text-sm text-muted-foreground">No traders registered yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                          <th className="text-left px-4 py-3">Trader</th>
                          <th className="text-left px-4 py-3">Status</th>
                          <th className="text-left px-4 py-3">Account</th>
                          <th className="text-right px-4 py-3">ROI</th>
                          <th className="text-right px-4 py-3">Win%</th>
                          <th className="text-right px-4 py-3">Copiers</th>
                          <th className="text-right px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {traders.map((t) => (
                          <tr key={t.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                {t.avatarUrl ? (
                                  <img src={t.avatarUrl} className="h-8 w-8 rounded-full object-cover" alt="" />
                                ) : (
                                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                                    {t.displayName?.[0]?.toUpperCase() ?? "?"}
                                  </div>
                                )}
                                <div>
                                  <div className="flex items-center gap-1.5 font-medium">
                                    {t.displayName}
                                    {t.verified && <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
                                  </div>
                                  <p className="text-xs text-muted-foreground">{t.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={STATUS_COLORS[t.status] ?? ""}>
                                {t.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {t.masterAccount ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-medium capitalize">{t.masterAccount.type}</span>
                                  <Badge variant="outline" className={cn("text-[10px] w-fit", STATUS_COLORS[t.masterAccount.status] ?? "")}>
                                    {t.masterAccount.status}
                                  </Badge>
                                </div>
                              ) : <span className="italic">No account</span>}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-sm">
                              {t.roi != null ? <span className={t.roi >= 0 ? "text-green-400" : "text-red-400"}>{t.roi >= 0 ? "+" : ""}{Number(t.roi).toFixed(1)}%</span> : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-sm">
                              {t.winRate != null ? `${Number(t.winRate).toFixed(0)}%` : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold">{t.activeCopiers}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5 justify-end flex-wrap">
                                <Button size="sm" variant="outline"
                                  className={cn("h-7 text-xs", t.verified ? "border-primary/50 text-primary" : "")}
                                  onClick={() => patchTrader(t.id, { verified: !t.verified })}
                                  disabled={actingId === t.id}>
                                  {actingId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : t.verified ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                                  {t.verified ? "Verified" : "Verify"}
                                </Button>
                                <select
                                  value={t.status}
                                  onChange={(e) => patchTrader(t.id, { status: e.target.value })}
                                  disabled={actingId === t.id}
                                  className="h-7 px-2 rounded-md border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary">
                                  <option value="active">Active</option>
                                  <option value="inactive">Inactive</option>
                                  <option value="suspended">Suspended</option>
                                </select>
                                <Button size="sm" variant="ghost"
                                  className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  title="Remove trader profile"
                                  disabled={actingId === t.id}
                                  onClick={() => removeTrader(t.id, t.displayName ?? "Trader")}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── SIGNALS ── */}
          {section === "signals" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />Trade Signals
                  <Badge variant="outline" className="ml-auto text-xs">{signals.length} recent</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {signals.length === 0 ? (
                  <p className="text-center py-10 text-sm text-muted-foreground">No signals yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                          <th className="text-left px-4 py-3">Symbol</th>
                          <th className="text-left px-4 py-3">Trader</th>
                          <th className="text-left px-4 py-3">Action</th>
                          <th className="text-right px-4 py-3">Price</th>
                          <th className="text-right px-4 py-3">Qty</th>
                          <th className="text-left px-4 py-3">Status</th>
                          <th className="text-right px-4 py-3">Copies</th>
                          <th className="text-left px-4 py-3">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {signals.map((s) => (
                          <tr key={s.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                            <td className="px-4 py-3 font-mono font-semibold">{s.symbol}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{s.traderName}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={ACTION_COLORS[s.action] ?? ""}>
                                {s.action.toUpperCase()}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs">
                              {s.price != null ? Number(s.price).toFixed(4) : "market"}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs">
                              {s.quantity != null ? Number(s.quantity).toFixed(4) : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={STATUS_COLORS[s.status] ?? ""}>{s.status}</Badge>
                            </td>
                            <td className="px-4 py-3 text-right text-xs">
                              <span className="text-green-400">{s.executedCopies}</span>
                              <span className="text-muted-foreground">/{s.totalCopies}</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {new Date(s.createdAt).toLocaleDateString()} {new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── COPIERS ── */}
          {section === "copiers" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />Copy Subscriptions
                  <Badge variant="outline" className="ml-auto text-xs">{copiers.length} total</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {copiers.length === 0 ? (
                  <p className="text-center py-10 text-sm text-muted-foreground">No copy subscriptions yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                          <th className="text-left px-4 py-3">User</th>
                          <th className="text-left px-4 py-3">Copying</th>
                          <th className="text-left px-4 py-3">Status</th>
                          <th className="text-right px-4 py-3">Allocated</th>
                          <th className="text-right px-4 py-3">PnL</th>
                          <th className="text-left px-4 py-3">Since</th>
                        </tr>
                      </thead>
                      <tbody>
                        {copiers.map((c) => (
                          <tr key={c.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-medium">{c.userName}</p>
                              <p className="text-xs text-muted-foreground">{c.userEmail}</p>
                            </td>
                            <td className="px-4 py-3 font-medium">{c.traderName}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={STATUS_COLORS[c.status] ?? ""}>{c.status}</Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-sm">
                              {c.allocatedAmount != null ? `$${Number(c.allocatedAmount).toFixed(2)}` : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-sm">
                              {c.currentPnl != null ? (
                                <span className={Number(c.currentPnl) >= 0 ? "text-green-400" : "text-red-400"}>
                                  {Number(c.currentPnl) >= 0 ? "+" : ""}${Number(c.currentPnl).toFixed(2)}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {new Date(c.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── LIVE POSITIONS ── */}
          {section === "positions" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />Live Master Positions
                  <Badge variant="outline" className={cn("ml-auto text-xs", positions.length > 0 ? "text-green-400 border-green-400/30" : "")}>{positions.length} open</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {positions.length === 0 ? (
                  <p className="text-center py-10 text-sm text-muted-foreground">No open positions at the moment.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                          <th className="text-left px-4 py-3">Symbol</th>
                          <th className="text-left px-4 py-3">Trader</th>
                          <th className="text-left px-4 py-3">Side</th>
                          <th className="text-right px-4 py-3">Size</th>
                          <th className="text-right px-4 py-3">Entry</th>
                          <th className="text-right px-4 py-3">SL</th>
                          <th className="text-right px-4 py-3">TP</th>
                          <th className="text-right px-4 py-3">Lev</th>
                          <th className="text-left px-4 py-3">Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {positions.map((p) => (
                          <tr key={p.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                            <td className="px-4 py-3 font-mono font-semibold">{p.symbol}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{p.traderName}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={p.side === "buy" || p.side === "long" ? "text-green-400 border-green-400/30" : "text-red-400 border-red-400/30"}>
                                {p.side?.toUpperCase()}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs">{p.size != null ? Number(p.size).toFixed(4) : "—"}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs">{p.entryPrice != null ? Number(p.entryPrice).toFixed(4) : "—"}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs text-red-400">{p.stopLoss != null ? Number(p.stopLoss).toFixed(4) : "—"}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs text-green-400">{p.takeProfit != null ? Number(p.takeProfit).toFixed(4) : "—"}</td>
                            <td className="px-4 py-3 text-right text-xs">{p.leverage != null ? `${p.leverage}x` : "—"}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {new Date(p.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* MetaAPI Config */}
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="text-purple-400 font-semibold">MetaAPI</span>
            <span className="text-muted-foreground font-normal">— CopyFactory credentials</span>
            <div className="ml-auto flex gap-2">
              <Badge variant={metaapiStatus?.metaapiTokenSet ? "default" : "secondary"} className="text-xs">
                {metaapiStatus?.metaapiTokenSet ? "Token set ✓" : "Token not set"}
              </Badge>
              <Badge variant={metaapiStatus?.metaapiStrategySet ? "default" : "secondary"} className="text-xs">
                {metaapiStatus?.metaapiStrategySet ? "Strategy set ✓" : "Strategy not set"}
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Each trader gets their own CopyFactory strategy (auto-created on promotion). Only one platform-level token is needed.
          </p>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">API Token</label>
            <div className="flex gap-1.5">
              <Input
                type={showMetaapiToken ? "text" : "password"}
                placeholder={metaapiStatus?.metaapiTokenSet ? "Paste to replace current token…" : "app.metaapi.cloud → Account Settings → API Token"}
                value={metaapiToken}
                onChange={(e) => setMetaapiToken(e.target.value)}
                className="text-sm h-8"
              />
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setShowMetaapiToken((v) => !v)}>
                {showMetaapiToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={saveMetaapiConfig} disabled={metaapiSaving || !metaapiToken.trim()}>
              <Save className="h-3.5 w-3.5 mr-1.5" />{metaapiSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Vultr Config */}
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="text-blue-400 font-semibold">Vultr</span>
            <span className="text-muted-foreground font-normal">— Managed VPS (Malaysia, Kuala Lumpur)</span>
            <div className="ml-auto">
              <Badge variant={metaapiStatus?.vultrApiKeySet ? "default" : "secondary"} className="text-xs">
                {metaapiStatus?.vultrApiKeySet
                  ? `Key set ✓ (…${metaapiStatus.vultrApiKeyHint.slice(-6)})`
                  : "API key not set"}
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            When a copier connects an account in <strong>Agent mode</strong>, a $6/month Vultr VPS is auto-provisioned in Kuala Lumpur.
            Trades execute from that copier's dedicated IP — no setup needed from them.
          </p>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">API Key</label>
            <div className="flex gap-1.5">
              <Input
                type={showVultrKey ? "text" : "password"}
                placeholder={metaapiStatus?.vultrApiKeySet ? "Paste to replace…" : "my.vultr.com → Account → API → Personal Access Token"}
                value={vultrKey}
                onChange={(e) => setVultrKey(e.target.value)}
                className="text-sm h-8"
              />
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setShowVultrKey((v) => !v)}>
                {showVultrKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={saveVultrKey} disabled={vultrSaving || !vultrKey.trim()}>
              <Save className="h-3.5 w-3.5 mr-1.5" />{vultrSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Copy Trading Disclaimer */}
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            ⚠️ Copy Trading Risk Disclaimer
            <span className="text-xs text-muted-foreground font-normal">Shown as a popup every time a user opens the Copy Trading page</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            rows={8}
            placeholder="Enter the risk disclaimer text shown to users before they access copy trading…"
            value={disclaimer}
            onChange={(e) => setDisclaimer(e.target.value)}
            className="text-sm resize-y font-[system-ui] leading-relaxed"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {disclaimer.trim() ? `${disclaimer.length} characters` : "No disclaimer set — users won't see a popup."}
            </p>
            <Button size="sm" onClick={saveDisclaimer} disabled={disclaimerSaving}>
              <Save className="h-3.5 w-3.5 mr-1.5" />{disclaimerSaving ? "Saving…" : "Save Disclaimer"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Trading Pairs */}
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            📊 Trading Pairs
            <span className="text-xs text-muted-foreground font-normal">Shown in the symbol dropdown when executing trades</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Add new pair */}
          <div className="flex gap-2 items-end">
            <div className="space-y-1 flex-1">
              <label className="text-xs text-muted-foreground">Symbol</label>
              <Input
                placeholder="e.g. EURUSD"
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && addPair()}
                className="h-8 text-sm font-mono"
              />
            </div>
            <div className="space-y-1 w-36">
              <label className="text-xs text-muted-foreground">Market</label>
              <Select value={newMarket} onValueChange={setNewMarket}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="forex">Forex</SelectItem>
                  <SelectItem value="crypto">Crypto</SelectItem>
                  <SelectItem value="commodities">Commodities</SelectItem>
                  <SelectItem value="stocks">Stocks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" className="h-8 shrink-0" onClick={addPair} disabled={pairsSaving || !newSymbol.trim()}>
              <Plus className="h-3.5 w-3.5 mr-1" />Add
            </Button>
          </div>

          {/* Pair list grouped by market */}
          {pairs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">No pairs yet. Add some above.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pairs.map((p) => (
                <div key={`${p.market}-${p.symbol}`}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-xs font-mono">
                  <span className="text-[10px] text-muted-foreground capitalize">{p.market.slice(0, 2).toUpperCase()}</span>
                  <span className="font-semibold">{p.symbol}</span>
                  <button onClick={() => removePair(p.symbol, p.market)}
                    className="text-muted-foreground hover:text-destructive transition-colors ml-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Managed VPS Instances */}
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            🖥️ Managed VPS Instances
            <Badge variant="secondary" className="text-xs ml-1">{vpsList.filter((v) => v.status !== "destroyed").length} active</Badge>
            <span className="text-xs text-muted-foreground font-normal ml-1">
              ~${(vpsList.filter((v) => v.status !== "destroyed").length * 6).toFixed(0)}/month
            </span>
            <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={loadVps} disabled={vpsLoading}>
              {vpsLoading ? "Loading…" : "Refresh"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {vpsList.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No managed VPS instances yet. Copiers will auto-provision when they connect in Agent mode.
            </p>
          ) : (
            <div className="space-y-2">
              {vpsList.filter((v) => v.status !== "destroyed").map((vps) => (
                <div key={vps.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{vps.accountLabel ?? `Account #${vps.copyAccountId}`}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        vps.status === "running"      ? "bg-green-100 text-green-700" :
                        vps.status === "provisioning" ? "bg-yellow-100 text-yellow-700 animate-pulse" :
                        vps.status === "error"        ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {vps.status === "provisioning" ? "⏳ Provisioning…" : vps.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-2">
                      {vps.ipAddress && <span className="font-mono">{vps.ipAddress}</span>}
                      <span>🇲🇾 {vps.region.toUpperCase()} · {vps.plan} · ${vps.monthlyCost ?? "6.00"}/mo</span>
                      {vps.errorMessage && <span className="text-red-500">{vps.errorMessage}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {vps.instanceId && (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => rebootVps(vps.id)}>
                        Reboot
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => destroyVps(vps.id)}>
                      Destroy
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
