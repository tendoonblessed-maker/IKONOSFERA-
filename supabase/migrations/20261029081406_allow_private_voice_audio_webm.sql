-- Applied to active Supabase as migration 20261029081406.
-- Chrome/Firefox MediaRecorder outputs audio/webm; Safari uses audio/mp4.
-- Preserve private bucket, existing file limit, all previous allowed MIME,
-- and every existing storage RLS policy. No modifications to stored objects.
update storage.buckets
set allowed_mime_types=array_append(allowed_mime_types,'audio/webm')
where id='ikonosfera-direct-media'
  and public=false
  and allowed_mime_types is not null
  and not ('audio/webm'=any(allowed_mime_types));
