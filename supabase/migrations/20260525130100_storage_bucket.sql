-- Storage bucket for recipe hero images.
-- Public bucket so the apps can render image URLs without signed-URL plumbing.
-- The bucket name is referenced by the importer and by future image-upload code.

insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', true)
on conflict (id) do nothing;

-- Authenticated users can upload, replace, and delete; anyone can read.
-- (RLS on storage.objects is enforced; these policies scope to this bucket.)

create policy "recipe-images read"
  on storage.objects for select
  using (bucket_id = 'recipe-images');

create policy "recipe-images write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-images');

create policy "recipe-images update"
  on storage.objects for update to authenticated
  using (bucket_id = 'recipe-images')
  with check (bucket_id = 'recipe-images');

create policy "recipe-images delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-images');
