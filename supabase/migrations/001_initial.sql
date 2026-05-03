-- Enable RLS
alter table if exists sections enable row level security;
alter table if exists groups enable row level security;
alter table if exists items enable row level security;

-- Sections policies
create policy "Users can view own sections"
  on sections for select
  using (auth.uid() = user_id);

create policy "Users can insert own sections"
  on sections for insert
  with check (auth.uid() = user_id);

create policy "Users can update own sections"
  on sections for update
  using (auth.uid() = user_id);

create policy "Users can delete own sections"
  on sections for delete
  using (auth.uid() = user_id);

-- Groups policies
create policy "Users can view groups in own sections"
  on groups for select
  using (
    exists (
      select 1 from sections where sections.id = groups.section_id and sections.user_id = auth.uid()
    )
  );

create policy "Users can insert groups in own sections"
  on groups for insert
  with check (
    exists (
      select 1 from sections where sections.id = groups.section_id and sections.user_id = auth.uid()
    )
  );

create policy "Users can update groups in own sections"
  on groups for update
  using (
    exists (
      select 1 from sections where sections.id = groups.section_id and sections.user_id = auth.uid()
    )
  );

create policy "Users can delete groups in own sections"
  on groups for delete
  using (
    exists (
      select 1 from sections where sections.id = groups.section_id and sections.user_id = auth.uid()
    )
  );

-- Items policies
create policy "Users can view items in own sections"
  on items for select
  using (
    exists (
      select 1 from groups
      join sections on sections.id = groups.section_id
      where groups.id = items.group_id and sections.user_id = auth.uid()
    )
  );

create policy "Users can insert items in own sections"
  on items for insert
  with check (
    exists (
      select 1 from groups
      join sections on sections.id = groups.section_id
      where groups.id = items.group_id and sections.user_id = auth.uid()
    )
  );

create policy "Users can update items in own sections"
  on items for update
  using (
    exists (
      select 1 from groups
      join sections on sections.id = groups.section_id
      where groups.id = items.group_id and sections.user_id = auth.uid()
    )
  );

create policy "Users can delete items in own sections"
  on items for delete
  using (
    exists (
      select 1 from groups
      join sections on sections.id = groups.section_id
      where groups.id = items.group_id and sections.user_id = auth.uid()
    )
  );

-- Storage policies
insert into storage.buckets (id, name, public) values ('pdfs', 'pdfs', false);

create policy "Users can upload own PDFs"
  on storage.objects for insert
  with check (
    bucket_id = 'pdfs' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can view own PDFs"
  on storage.objects for select
  using (
    bucket_id = 'pdfs' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own PDFs"
  on storage.objects for delete
  using (
    bucket_id = 'pdfs' and auth.uid()::text = (storage.foldername(name))[1]
  );
