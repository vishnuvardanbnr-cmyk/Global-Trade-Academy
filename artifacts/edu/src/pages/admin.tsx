import { useGetAdminStats, useListUsers, useListAttendance, getGetAdminStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Users, BookOpen, TrendingUp, Calendar, UserPlus, Activity } from "lucide-react";

export default function AdminPanel() {
  const { data: stats, isLoading: statsLoading } = useGetAdminStats({ query: { queryKey: getGetAdminStatsQueryKey() } });
  const { data: users, isLoading: usersLoading } = useListUsers({});
  const { data: attendance } = useListAttendance({});

  const statCards = [
    { label: "Total Users", value: stats?.totalUsers, icon: Users, color: "text-blue-400" },
    { label: "Total Courses", value: stats?.totalCourses, icon: BookOpen, color: "text-green-400" },
    { label: "Total Enrollments", value: stats?.totalEnrollments, icon: TrendingUp, color: "text-purple-400" },
    { label: "Upcoming Classes", value: stats?.upcomingClasses, icon: Calendar, color: "text-orange-400" },
    { label: "New Users Today", value: stats?.newUsersToday, icon: UserPlus, color: "text-cyan-400" },
    { label: "Active Users", value: stats?.activeUsers, icon: Activity, color: "text-yellow-400" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">Platform analytics and management overview.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} data-testid={`stat-${label.toLowerCase().replace(/ /g, "-")}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
              {statsLoading
                ? <Skeleton className="h-8 w-20" />
                : <div className="text-3xl font-bold">{value?.toLocaleString() ?? "—"}</div>
              }
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            User Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="space-y-3">
              {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 font-medium text-muted-foreground">User</th>
                    <th className="pb-3 font-medium text-muted-foreground">Email</th>
                    <th className="pb-3 font-medium text-muted-foreground">Role</th>
                    <th className="pb-3 font-medium text-muted-foreground">XP</th>
                    <th className="pb-3 font-medium text-muted-foreground">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users?.slice(0, 20).map((user) => (
                    <tr key={user.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors" data-testid={`row-user-${user.id}`}>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                            {(user.displayName ?? user.email ?? "U").charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium">{user.displayName ?? "—"}</span>
                        </div>
                      </td>
                      <td className="py-3 text-muted-foreground">{user.email}</td>
                      <td className="py-3">
                        <Badge
                          variant="outline"
                          className={
                            user.role === "admin" ? "text-red-400 border-red-400/30" :
                            user.role === "instructor" ? "text-purple-400 border-purple-400/30" :
                            "text-muted-foreground"
                          }
                        >
                          {user.role}
                        </Badge>
                      </td>
                      <td className="py-3 font-mono">{user.xp?.toLocaleString()}</td>
                      <td className="py-3 text-muted-foreground text-xs">
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users?.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No users yet.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attendance Overview */}
      {attendance && attendance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Recent Attendance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 font-medium text-muted-foreground">User</th>
                    <th className="pb-3 font-medium text-muted-foreground">Class</th>
                    <th className="pb-3 font-medium text-muted-foreground">Status</th>
                    <th className="pb-3 font-medium text-muted-foreground">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.slice(0, 10).map((rec) => (
                    <tr key={rec.id} className="border-b border-border/50" data-testid={`row-attendance-${rec.id}`}>
                      <td className="py-3">{rec.userName ?? rec.userId}</td>
                      <td className="py-3 text-muted-foreground">Class #{rec.classId}</td>
                      <td className="py-3">
                        <Badge variant="outline" className={
                          rec.status === "present" ? "text-green-400 border-green-400/30" :
                          rec.status === "late" ? "text-yellow-400 border-yellow-400/30" :
                          "text-red-400 border-red-400/30"
                        }>
                          {rec.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-muted-foreground">{rec.durationMinutes ?? "—"}min</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
