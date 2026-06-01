-- Customer-uploaded photos on estimate (quote) requests, mirroring
-- appointments.photo_paths. Photos live in the existing 'booking-photos' bucket
-- under a quotes/{client_id}/ prefix (see processPhotoUpload in
-- src/lib/appointments/photos.ts). The bucket's authenticated-select +
-- service-role-all policies already cover this prefix, so no new bucket/policy.
--
-- Additive + backward-compatible: the legacy JSON quote endpoint never sets this
-- column, so existing inserts default to {}.

alter table quote_requests
  add column if not exists photo_paths text[] not null default '{}'
    check (array_length(photo_paths, 1) is null or array_length(photo_paths, 1) <= 3);
