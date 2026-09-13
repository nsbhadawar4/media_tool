import { clsx, type ClassValue } from 'clsx';

/** Thin wrapper around clsx so class-merging call sites read consistently across the app. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
