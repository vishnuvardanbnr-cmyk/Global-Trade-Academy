import React, { useState, useEffect, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { useGetAdminStats, useListUsers, getGetAdminStatsQueryKey, useListLiveClasses, useCreateLiveClass, getListLiveClassesQueryKey } from "@workspace/api-client-react";
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
  Video, CalendarPlus,
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
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [userSearch, setUserSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Load courses when dialog opens
  useEffect(() => {
    if (!open) return;
    fetch("/api/admin/courses")
      .then((r) => r.ok ? r.json() : [])
      .then((data: CourseOption[]) => setCourses(data.filter((c) => c.status === "published")))
      .catch(() => {});
  }, [open]);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) { setSelectedUserId(""); setSelectedCourseId(""); setUserSearch(""); }
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

  const selectedCourse = courses.find((c) => String(c.id) === selectedCourseId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId || !selectedCourseId) return;
    setSubmitting(true);
    try {
      const r = await fetch("/api/admin/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: effectiveUserId, courseId: parseInt(selectedCourseId) }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: data.error ?? "Failed to grant access", variant: "destructive" });
        return;
      }
      toast({
        title: "Access granted!",
        description: `${effectiveUserName} can now access "${selectedCourse?.title}".`,
      });
      onSuccess();
      onOpenChange(false);
    } catch {
      toast({ title: "Failed to grant access", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" /> Grant Course Access
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* User selector — hidden when prefilledUser is set */}
          {prefilledUser ? (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-border">
              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                {(prefilledUser.displayName ?? prefilledUser.email ?? "U").charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold">{prefilledUser.displayName ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{prefilledUser.email}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Select Student</label>
              <Input
                placeholder="Search by name or email…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="mb-1"
              />
              <div className="max-h-36 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {filteredUsers.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">No users found</p>
                ) : filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedUserId(u.id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-secondary/50 transition-colors flex items-center gap-2 ${selectedUserId === u.id ? "bg-primary/10 font-semibold" : ""}`}
                  >
                    <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                      {(u.displayName ?? u.email ?? "U").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate">{u.displayName ?? "—"}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                    </div>
                    {selectedUserId === u.id && <CheckCircle className="h-3.5 w-3.5 text-primary ml-auto shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Course selector */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Select Course</label>
            {courses.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Loading courses…</p>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {courses.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCourseId(String(c.id))}
                    className={`w-full text-left px-3 py-2.5 text-sm hover:bg-secondary/50 transition-colors flex items-center gap-2.5 ${selectedCourseId === String(c.id) ? "bg-primary/10 font-semibold" : ""}`}
                  >
                    <BookOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{c.title}</span>
                    {c.price && parseFloat(c.price) > 0 ? (
                      <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 shrink-0 flex items-center gap-0.5">
                        <DollarSign className="h-2.5 w-2.5" />{parseFloat(c.price).toFixed(0)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground shrink-0">Free</span>
                    )}
                    {selectedCourseId === String(c.id) && <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedCourse && parseFloat(selectedCourse.price ?? "0") > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <DollarSign className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>This is a paid course (${parseFloat(selectedCourse.price!).toFixed(2)}). Granting access bypasses payment for this user.</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              type="submit"
              className="flex-1 gap-1.5"
              disabled={submitting || !effectiveUserId || !selectedCourseId}
            >
              <KeyRound className="h-3.5 w-3.5" />
              {submitting ? "Granting…" : "Grant Access"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── types ─── */
type DetailedStats = { totalUsers: number; totalCourses: number; publishedCourses: number; totalEnrollments: number; activeEnrollments: number; completedEnrollments: number; instructors: number; admins: number; newUsersWeek: number; newUsersMonth: number; totalLessons: number; totalQuizAttempts: number; totalCertificates: number; totalXpAwarded: number; };
type AdminCourse = { id: number; title: string; status: string; level: string | null; category: string | null; price: string | null; instructorName: string; enrollments: number; isFeatured: boolean | null; createdAt: string; };
type AdminEnrollment = { id: number; userId: string; courseId: number; status: string; enrolledAt: string; completedAt: string | null; userName: string; userEmail: string; courseTitle: string; };
type AdminActivity = { id: number; type: string; userId: string | null; userName: string | null; description: string | null; metadata: unknown; createdAt: string; };
type AdminUser = { id: string; email: string; displayName: string | null; role: string; xp: number; createdAt: string; };

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
function UsersTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: users, isLoading } = useListUsers({});
  const [search, setSearch] = useState("");
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

  const filtered = (users ?? []).filter((u) =>
    !search || (u.displayName ?? "").toLowerCase().includes(search.toLowerCase()) || (u.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Input placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Badge variant="outline" className="ml-auto">{filtered.length} user{filtered.length !== 1 ? "s" : ""}</Badge>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40">
              <tr className="border-b border-border text-muted-foreground text-xs">
                <th className="text-left px-4 py-3 font-medium">User</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-right px-4 py-3 font-medium">XP</th>
                <th className="text-right px-4 py-3 font-medium">Joined</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
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

/* ─── Enrollments Tab ─── */
function EnrollmentsTab() {
  const { toast } = useToast();
  const [enrollments, setEnrollments] = useState<AdminEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [acting, setActing] = useState<number | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/enrollments");
      if (res.ok) setEnrollments(await res.json());
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

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

  const filtered = enrollments.filter((e) =>
    !search || e.userName.toLowerCase().includes(search.toLowerCase()) || e.courseTitle.toLowerCase().includes(search.toLowerCase()) || e.userEmail.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Input placeholder="Search by student or course…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
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
      )}

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
type CommunityView = "posts" | "comments";

function CommunityTab() {
  const { toast } = useToast();
  const [view, setView] = useState<CommunityView>("posts");
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

  useEffect(() => { fetchPosts(); }, [fetchPosts]);
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
          {(["posts", "comments"] as CommunityView[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${view === v ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {v === "posts" ? `Posts (${posts.length})` : `Comments (${comments.length})`}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${view}…`}
          className="flex-1 min-w-[180px] h-9 px-3 rounded-lg border border-border text-sm bg-background focus:outline-none focus:border-primary"
        />
      </div>

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

      <Tabs value={activeTab}>

        <TabsContent value="overview" className="mt-6"><OverviewTab /></TabsContent>
        <TabsContent value="users" className="mt-6"><UsersTab /></TabsContent>
        <TabsContent value="courses" className="mt-6"><CoursesTab /></TabsContent>
        <TabsContent value="live-classes" className="mt-6"><AdminLiveClassesTab /></TabsContent>
        <TabsContent value="enrollments" className="mt-6"><EnrollmentsTab /></TabsContent>
        <TabsContent value="community" className="mt-6"><CommunityTab /></TabsContent>
        <TabsContent value="activity" className="mt-6"><ActivityTab /></TabsContent>
      </Tabs>
    </div>
  );
}
