import { useState } from "react";
import { useListCourses, useCreateCourse, useUpdateCourse, useDeleteCourse, useListLiveClasses, useCreateLiveClass, useListAttendance, getListCoursesQueryKey, getListLiveClassesQueryKey } from "@workspace/api-client-react";
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
import { Plus, BookOpen, Video, Users, Trash2, Settings2 } from "lucide-react";
import CourseContentManager from "@/pages/instructor/CourseContentManager";

function CreateCourseDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const form = useForm({
    defaultValues: { title: "", description: "", category: "forex", level: "beginner", price: undefined as number | undefined },
  });
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
      <DialogContent>
        <DialogHeader><DialogTitle>New Course</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => create.mutate({ data: { title: d.title, description: d.description || undefined, category: d.category, level: d.level, price: d.price } }))} className="space-y-4">
            <FormField control={form.control} name="title" rules={{ required: true }} render={({ field }) => (
              <FormItem><FormLabel>Title</FormLabel><FormControl><Input data-testid="input-course-title" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea data-testid="input-course-description" rows={3} {...field} /></FormControl><FormMessage /></FormItem>
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
                  <div className="flex gap-2 shrink-0">
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
