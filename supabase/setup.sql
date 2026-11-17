-- =====================================================================
--  حائط «وطني خط أحمر» — إعداد قاعدة البيانات والتخزين في Supabase
--  الصقي هذا الملف كاملًا في: SQL Editor ← New query ← Run
--  قبل التشغيل: غيّري البريد في السطر الأخير إلى بريدك (بريد المشرفة)
--  يمكن تشغيل الملف أكثر من مرة دون أن يُحذف شيء من المشاركات.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- المشاركات ----------
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  role        text not null check (role in ('child','parent','teacher','principal','visitor')),
  message     text check (char_length(message) <= 500),
  media_path  text check (media_path is null or media_path ~ '^posts/[A-Za-z0-9._-]+$'),
  media_kind  text check (media_kind in ('image','video','drawing')),
  consent     boolean not null default false,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  likes       integer not null default 0 check (likes >= 0),
  reviewed_at timestamptz,
  constraint has_content   check (char_length(coalesce(btrim(message), '')) > 0 or media_path is not null),
  constraint media_pair    check ((media_path is null) = (media_kind is null)),
  constraint media_consent check (media_path is null or consent)
);
create index if not exists posts_status_created on public.posts (status, created_at desc);
create index if not exists posts_status_likes   on public.posts (status, likes desc);

-- ---------- المشرفات (بالبريد الإلكتروني) ----------
create table if not exists public.admins (
  email text primary key
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------- الصلاحيات ----------
alter table public.posts  enable row level security;
alter table public.admins enable row level security;   -- لا أحد يقرأ قائمة المشرفات من الموقع

revoke all on public.posts  from anon, authenticated;
revoke all on public.admins from anon, authenticated;

grant select on public.posts to anon, authenticated;
grant insert (name, role, message, media_path, media_kind, consent) on public.posts to anon, authenticated;
grant update (status, reviewed_at) on public.posts to authenticated;
grant delete on public.posts to authenticated;

drop policy if exists "read approved or admin" on public.posts;
create policy "read approved or admin" on public.posts
  for select to anon, authenticated
  using (status = 'approved' or public.is_admin());

drop policy if exists "anyone can submit pending" on public.posts;
create policy "anyone can submit pending" on public.posts
  for insert to anon, authenticated
  with check (status = 'pending' and likes = 0 and reviewed_at is null);

drop policy if exists "admin can review" on public.posts;
create policy "admin can review" on public.posts
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin can delete" on public.posts;
create policy "admin can delete" on public.posts
  for delete to authenticated
  using (public.is_admin());

-- ---------- الإعجاب (للمشاركات المنشورة فقط) ----------
create or replace function public.like_post(post_id uuid, delta integer default 1) returns integer
language sql security definer set search_path = public as $$
  update public.posts
     set likes = greatest(0, likes + case when delta < 0 then -1 else 1 end)
   where id = post_id and status = 'approved'
  returning likes;
$$;

revoke all on function public.like_post(uuid, integer) from public;
revoke all on function public.is_admin() from public;
grant execute on function public.like_post(uuid, integer) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- تخزين الصور والفيديو والرسومات ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800,
        array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm'])
on conflict (id) do update
   set public = excluded.public,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "watani upload media" on storage.objects;
create policy "watani upload media" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = 'posts');

drop policy if exists "watani admin read media" on storage.objects;
create policy "watani admin read media" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and public.is_admin());

drop policy if exists "watani admin delete media" on storage.objects;
create policy "watani admin delete media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and public.is_admin());

-- ---------- بريد المشرفة: غيّريه إلى بريدك ثم شغّلي الملف ----------
insert into public.admins (email) values ('your-email@example.com')
on conflict do nothing;
