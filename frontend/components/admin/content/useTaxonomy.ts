'use client';

import { useQuery } from '@tanstack/react-query';
import { adminContentApi, type AdminContentItem } from '@/lib/api/adminContent';
import type { Course } from '@/lib/api/content';

/**
 * The learning structure as the database has it — classes, subjects, which classes offer which
 * subjects, and courses — for admin forms and filters. Nothing here is hard-coded: a class or
 * subject an administrator adds shows up everywhere it can be chosen.
 */
export function useTaxonomy() {
  const list = (type: 'class' | 'subject' | 'class_subject') => ({
    queryKey: ['admin', 'content', 'taxonomy', type],
    queryFn: async () => (await adminContentApi.list({ type, status: 'live', sort: 'order', limit: 100 })).data,
    staleTime: 30_000,
  });
  const classes = useQuery(list('class'));
  const subjects = useQuery(list('subject'));
  const links = useQuery(list('class_subject'));
  const courses = useQuery({
    queryKey: ['admin', 'content', 'taxonomy', 'courses'],
    queryFn: async () => (await adminContentApi.courses({ status: 'live', sort: 'order', limit: 100 })).data,
    staleTime: 30_000,
  });

  const classList: AdminContentItem[] = classes.data ?? [];
  const subjectList: AdminContentItem[] = subjects.data ?? [];
  const linkList: AdminContentItem[] = links.data ?? [];
  const courseList: Course[] = courses.data ?? [];

  return {
    isLoading: classes.isLoading || subjects.isLoading || links.isLoading,
    classes: classList,
    subjects: subjectList,
    links: linkList,
    courses: courseList,
    classTitle: (level: number | null) => (level == null ? '—' : (classList.find((c) => c.classLevel === level)?.title ?? `Class ${level}`)),
    subjectTitle: (key: string | null) => (key == null ? '—' : (subjectList.find((s) => s.key === key)?.title ?? key)),
    courseTitle: (id: string | null) => (id == null ? null : (courseList.find((c) => c.id === id)?.title ?? 'Unknown course')),
    /** Subjects this class offers (live links), in subject order. */
    subjectsOffered: (level: number | null) =>
      level == null ? [] : subjectList.filter((s) => linkList.some((l) => l.classLevel === level && l.subject === s.key)),
    coursesFor: (level: number | null, subject: string | null) => courseList.filter((c) => c.classLevel === level && c.subject === subject),
  };
}
