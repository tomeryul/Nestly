-- Personal tasks become a shared board: every home member can SEE and ADD to
-- anyone's personal list, but only the list's owner may DELETE their items.
-- (General tasks stay fully shared, deletable by any member.)

drop policy if exists personal_tasks_select on public.personal_tasks;
create policy personal_tasks_select on public.personal_tasks for select
  using (public.is_home_member(home_id));

drop policy if exists personal_tasks_write on public.personal_tasks;
create policy personal_tasks_write on public.personal_tasks for insert
  with check (public.is_home_member(home_id));

drop policy if exists personal_tasks_update on public.personal_tasks;
create policy personal_tasks_update on public.personal_tasks for update
  using (public.is_home_member(home_id))
  with check (public.is_home_member(home_id));

drop policy if exists personal_tasks_delete on public.personal_tasks;
create policy personal_tasks_delete on public.personal_tasks for delete
  using (public.is_home_member(home_id) and (scope = 'general' or owner_id = auth.uid()));
