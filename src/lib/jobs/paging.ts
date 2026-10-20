import { z } from "zod";

export const BOARD_COMPLETE_PAGE_SIZE = 15;
export const BOARD_OPEN_PAGE_SIZE = 200;
export const LIST_PAGE_SIZE = 25;
export const CALENDAR_LIMIT = 500;
export const AI_SEARCH_LIMIT = 25;

export const jobFiltersSchema = z.object({
  search: z.string().max(200).optional(),
  status: z
    .enum(["not_started", "waiting_for_parts", "in_progress", "complete", "cancelled"])
    .optional(),
  category: z.string().max(100).optional(),
  paymentStatus: z.enum(["unpaid", "invoiced", "paid", "waived"]).optional(),
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
});
export type JobFilters = z.infer<typeof jobFiltersSchema>;

// For URL search params: a value the strict schema would reject is dropped
// rather than failing the page, so the page and the Load more action that
// re-sends its filters always agree on what was applied.
export function normalizeJobFilters(raw: {
  search?: string;
  status?: string;
  category?: string;
  paymentStatus?: string;
  dateFrom?: string;
  dateTo?: string;
}): JobFilters {
  const shape = jobFiltersSchema.shape;
  const search = raw.search?.trim().slice(0, 200);
  return {
    search: search || undefined,
    status: shape.status.safeParse(raw.status).data,
    category: shape.category.safeParse(raw.category).data,
    paymentStatus: shape.paymentStatus.safeParse(raw.paymentStatus).data,
    dateFrom: shape.dateFrom.safeParse(raw.dateFrom).data,
    dateTo: shape.dateTo.safeParse(raw.dateTo).data,
  };
}

export const jobCursorSchema = z.object({
  date_received: z.iso.date(),
  id: z.uuid(),
});
export type JobCursor = z.infer<typeof jobCursorSchema>;

export const loadMoreJobsInputSchema = z.object({
  filters: jobFiltersSchema,
  cursor: jobCursorSchema,
  limit: z.number().int().min(1).max(BOARD_OPEN_PAGE_SIZE),
});

export const calendarRangeSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
});
export type CalendarRange = z.infer<typeof calendarRangeSchema>;

export const calendarLoadInputSchema = z.object({
  filters: jobFiltersSchema,
  range: calendarRangeSchema,
});

// Keyset predicate for the (date_received desc, id desc) sort: everything
// strictly after the cursor row in that order. Both values are validated by
// jobCursorSchema before they reach a PostgREST filter string.
export function jobCursorFilter(cursor: JobCursor): string {
  return `date_received.lt.${cursor.date_received},and(date_received.eq.${cursor.date_received},id.lt.${cursor.id})`;
}

// ISO dates sort lexically, so the later "from" and the earlier "to" win.
export function clampFiltersToRange(filters: JobFilters, range: CalendarRange): JobFilters {
  const froms = [filters.dateFrom, range.from].filter((d): d is string => Boolean(d)).sort();
  const tos = [filters.dateTo, range.to].filter((d): d is string => Boolean(d)).sort();
  return { ...filters, dateFrom: froms[froms.length - 1], dateTo: tos[0] };
}
