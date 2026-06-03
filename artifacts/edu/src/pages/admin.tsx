import React, { useState, useEffect, useCallback } from "react";
import { useGetAdminStats, useListUsers, getGetAdminStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Users, BookOpen, TrendingUp, Calendar, UserPlus, Activity,
  GraduationCap, Award, Zap, BarChart3, Trash2, ShieldCheck,
  ShieldAlert, RefreshCw, Star, StarOff, CheckCircle, XCircle,
  Clock, ChevronDown, ChevronUp, BookMarked, FileText,
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
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive h-7 px-2" onClick={() => deleteUser(user.id, user.displayName ?? user.email ?? user.id)} disabled={acting === user.id}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
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
        <Badge variant="outline" className="ml-auto">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</Badge>
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
   MAIN ADMIN PANEL
════════════════════════════════════════════ */
export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState("overview");
  const { data: users } = useListUsers({});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">Platform-wide analytics, user management, and content control.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">
            Users
            {users && <span className="ml-1.5 text-[10px] bg-primary/20 text-primary rounded-full px-1.5 py-0.5">{users.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="courses">Courses</TabsTrigger>
          <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6"><OverviewTab /></TabsContent>
        <TabsContent value="users" className="mt-6"><UsersTab /></TabsContent>
        <TabsContent value="courses" className="mt-6"><CoursesTab /></TabsContent>
        <TabsContent value="enrollments" className="mt-6"><EnrollmentsTab /></TabsContent>
        <TabsContent value="activity" className="mt-6"><ActivityTab /></TabsContent>
      </Tabs>
    </div>
  );
}
