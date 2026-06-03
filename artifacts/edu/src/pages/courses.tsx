import { useListCourses, useListEnrollments } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useState } from "react";
import { Search, Star, Clock, Users, BookOpen, Filter, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

const LEVELS = ["All Levels", "Beginner", "Intermediate", "Advanced"];

const levelColors: Record<string, string> = {
  beginner: "bg-emerald-50 text-emerald-700 border-emerald-200",
  intermediate: "bg-amber-50 text-amber-700 border-amber-200",
  advanced: "bg-red-50 text-red-700 border-red-200",
};

export default function Courses() {
  const { data: courses, isLoading } = useListCourses({});
  const { data: enrollments } = useListEnrollments();
  const enrolledIds = new Set((enrollments ?? []).map((e) => e.courseId));
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeLevel, setActiveLevel] = useState("All Levels");

  const categories = [
    "All",
    ...Array.from(new Set((courses ?? []).map((c) => c.category).filter(Boolean)))
      .sort() as string[],
  ];

  const filtered = (courses ?? []).filter((c) => {
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === "All" || c.category?.toLowerCase() === activeCategory.toLowerCase();
    const matchLevel = activeLevel === "All Levels" || c.level?.toLowerCase() === activeLevel.toLowerCase();
    return matchSearch && matchCat && matchLevel;
  });

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="border-b border-border pb-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0 mt-0.5">
            <GraduationCap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Academy</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Master trading from fundamentals to advanced strategies.</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search courses…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white h-10 text-sm"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <select
            className="h-10 text-sm border border-border rounded-md px-3 bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[130px]"
            value={activeLevel}
            onChange={(e) => setActiveLevel(e.target.value)}
          >
            {LEVELS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* Category pills */}
      <div className="flex gap-2 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all capitalize",
              activeCategory.toLowerCase() === cat.toLowerCase()
                ? "bg-primary text-white border-primary shadow-sm"
                : "bg-white text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Stats row */}
      {!isLoading && (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <BookOpen className="h-4 w-4" />
          <span><strong className="text-foreground font-semibold">{filtered.length}</strong> courses available</span>
        </div>
      )}

      {/* Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array(6).fill(0).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-white overflow-hidden shadow-sm">
              <Skeleton className="h-44 w-full rounded-none" />
              <div className="p-4 space-y-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <div className="flex justify-between items-center pt-2">
                  <Skeleton className="h-5 w-12" />
                  <Skeleton className="h-8 w-24" />
                </div>
              </div>
            </div>
          ))
          : filtered.map((course) => (
            <div
              key={course.id}
              className="rounded-xl border border-border bg-white overflow-hidden shadow-sm hover:shadow-md hover:border-primary/25 transition-all duration-200 flex flex-col group"
            >
              {/* Thumbnail */}
              <div className="h-44 bg-gradient-to-br from-slate-100 to-slate-50 relative overflow-hidden shrink-0">
                {course.thumbnailUrl ? (
                  <img
                    src={course.thumbnailUrl}
                    alt={course.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 to-blue-50">
                    <BookOpen className="h-10 w-10 text-slate-300" />
                    <span className="text-xs text-slate-400 font-medium capitalize">{course.category}</span>
                  </div>
                )}
                {course.isFeatured && (
                  <div className="absolute top-3 left-3 bg-amber-400 text-amber-900 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full flex items-center gap-1 shadow-sm">
                    <Star className="h-2.5 w-2.5 fill-amber-900" /> Featured
                  </div>
                )}
                {course.level && (
                  <div className="absolute top-3 right-3">
                    <Badge className={cn("text-[11px] border font-medium shadow-sm", levelColors[course.level?.toLowerCase() ?? ""] ?? "bg-white text-slate-600 border-slate-200")}>
                      {course.level}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Body */}
              <div className="flex flex-col flex-1 p-4 gap-2">
                <div>
                  <Badge variant="outline" className="text-[11px] text-muted-foreground mb-2 capitalize">{course.category}</Badge>
                  <h3 className="font-semibold text-[15px] text-foreground leading-snug line-clamp-2">{course.title}</h3>
                </div>

                <p className="text-sm text-muted-foreground line-clamp-2 flex-1">{course.description}</p>

                {/* Meta */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
                  <div className="flex items-center gap-1">
                    <BookOpen className="h-3.5 w-3.5 shrink-0" />
                    <span>{course.lessonCount ?? 0} lessons</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    <span>{(course.enrollmentCount ?? 0).toLocaleString()} enrolled</span>
                  </div>
                  {course.duration && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span>{course.duration}h</span>
                    </div>
                  )}
                </div>

                {/* Rating */}
                <div className="flex items-center gap-1">
                  {(course.reviewCount ?? 0) > 0 ? (
                    <>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={cn("h-3 w-3", s <= Math.round(course.rating ?? 0) ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200")} />
                      ))}
                      <span className="text-xs text-muted-foreground ml-1">{(course.rating ?? 0).toFixed(1)} ({course.reviewCount})</span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">No reviews yet</span>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 mt-auto border-t border-border">
                  <div>
                    {course.price ? (
                      <span className="text-base font-bold text-foreground">${course.price}</span>
                    ) : (
                      <span className="text-sm font-semibold text-emerald-600">Free</span>
                    )}
                  </div>
                  <Link href={`/courses/${course.id}`}>
                    {enrolledIds.has(course.id) ? (
                      <Button size="sm" variant="outline" className="font-medium text-primary border-primary/30 hover:bg-primary/5 hover:border-primary/50">
                        View Course
                      </Button>
                    ) : (
                      <Button size="sm" className="font-medium">Enroll Now</Button>
                    )}
                  </Link>
                </div>
              </div>
            </div>
          ))}
      </div>

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 rounded-xl border border-dashed border-border bg-white">
          <div className="p-3 rounded-full bg-slate-50 w-fit mx-auto mb-4">
            <BookOpen className="h-8 w-8 text-slate-300" />
          </div>
          <p className="text-sm font-medium text-foreground">No courses match your filters</p>
          <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or filters.</p>
          <button
            className="text-sm text-primary mt-3 hover:underline font-medium"
            onClick={() => { setSearch(""); setActiveCategory("All"); setActiveLevel("All Levels"); }}
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
