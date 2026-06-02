import { useListCourses } from "@workspace/api-client-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

export default function Courses() {
  const { data: courses, isLoading } = useListCourses({});

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Academy</h1>
          <p className="text-muted-foreground">Master trading concepts from beginner to advanced.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array(6).fill(0).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="h-48 w-full rounded-none" />
              <CardHeader><Skeleton className="h-6 w-2/3" /></CardHeader>
              <CardContent><Skeleton className="h-4 w-full mb-2" /><Skeleton className="h-4 w-4/5" /></CardContent>
              <CardFooter><Skeleton className="h-10 w-full" /></CardFooter>
            </Card>
          ))
        ) : courses?.map(course => (
          <Card key={course.id} className="overflow-hidden flex flex-col">
            <div className="h-48 bg-muted relative">
              {course.thumbnailUrl ? (
                <img src={course.thumbnailUrl} alt={course.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-secondary text-muted-foreground">
                  No Image
                </div>
              )}
              <div className="absolute top-2 right-2">
                <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm">
                  {course.level}
                </Badge>
              </div>
            </div>
            <CardHeader>
              <div className="flex justify-between items-start mb-2">
                <Badge variant="outline">{course.category}</Badge>
              </div>
              <CardTitle className="line-clamp-2">{course.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-sm text-muted-foreground line-clamp-3">{course.description}</p>
            </CardContent>
            <CardFooter>
              <Link href={`/courses/${course.id}`} className="w-full">
                <Button className="w-full">View Course</Button>
              </Link>
            </CardFooter>
          </Card>
        ))}
        {courses?.length === 0 && !isLoading && (
          <div className="col-span-full py-12 text-center text-muted-foreground">
            No courses found.
          </div>
        )}
      </div>
    </div>
  );
}