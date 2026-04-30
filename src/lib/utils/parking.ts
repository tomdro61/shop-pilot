interface ServiceTrack {
  services_interested: string[] | null;
  services_completed: string[] | null;
}

/**
 * A parking reservation needs attention as a service lead while at least one
 * interested service has not been marked completed. An empty or missing
 * `services_interested` returns `false` — no interest means no lead.
 */
export function hasPendingService(reservation: ServiceTrack): boolean {
  const interested = reservation.services_interested ?? [];
  if (interested.length === 0) return false;
  const completed = new Set(reservation.services_completed ?? []);
  return interested.some((s) => !completed.has(s));
}
