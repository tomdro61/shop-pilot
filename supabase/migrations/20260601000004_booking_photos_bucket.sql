-- Booking-photos storage bucket — customer-uploaded photos of their car trouble.
-- Per BOOKING_TECHNICAL_PLAN.md §3.3 / §5.3.
--
-- Folder layout: appointments/{appointment_id}/{n}.{mime_ext}
-- Photos arrive via /api/appointments/submit (multipart). Upload uses admin client,
-- so anon write access is unnecessary. Authenticated staff can read for the
-- /schedule view; service role has full access for cron cleanup of orphans.

insert into storage.buckets (id, name, public)
values ('booking-photos', 'booking-photos', false)
on conflict (id) do nothing;

create policy "booking_photos_authenticated_select"
  on storage.objects for select to authenticated
  using (bucket_id = 'booking-photos');

create policy "booking_photos_service_role_all"
  on storage.objects for all to service_role
  using (bucket_id = 'booking-photos')
  with check (bucket_id = 'booking-photos');
