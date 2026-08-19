-- W3.5 slice 3: the composer's read and write paths (docs/spec/17 §2).
--
-- `broadcasts` has zero client policies and no client grants (`02`'s matrix), which settles
-- how a leader WRITES one: through definer functions that read `auth.uid()` themselves. It
-- leaves open how a leader READS one, and this migration answers both.
--
-- WHY NOT A VIEW. Every other read surface in this project is a security-definer view
-- (`moderation_queue`, `testimony_feed`), and a view would work here too. A function is used
-- instead for one reason: a view's WHERE clause cannot say "and admins see everything"
-- without reading `profiles` per row, which is exactly the shape that made
-- `caller_is_admin_live()` necessary in the first place. One function, one role read, one
-- answer.
--
-- THE DASHBOARD ALSO CHECKS, AND THAT IS NOT DUPLICATION. `authorize()` decides what the
-- SCREEN OFFERS, so a leader is never shown an approve button that would fail. These
-- functions decide what is ALLOWED, because `authenticated` can call them directly with a
-- crafted payload and the dashboard is not in the way. Two layers, two questions.
--
-- Rollback (roll forward): a compensating migration drops the three functions. No data.

begin;

set local lock_timeout = '3s';

/**
 * What this caller may see.
 *
 * A leader sees their own work and their branch's history. An admin sees everything,
 * because the approval queue IS everything waiting, and a ministry-wide message written by
 * a leader in another branch still needs releasing.
 *
 * Returns the joined names the screen renders, so the dashboard does not make four more
 * round trips to turn ids into people.
 */
create function public.visible_broadcasts()
returns table (
  id uuid,
  author_id uuid,
  scope public.broadcast_scope,
  branch_id uuid,
  title text,
  body text,
  body_de text,
  body_nl text,
  body_fr text,
  link text,
  status public.broadcast_status,
  review_note text,
  recipient_count integer,
  sent_at timestamptz,
  updated_at timestamptz,
  author jsonb,
  approver jsonb,
  branch jsonb
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    b.id, b.author_id, b.scope, b.branch_id, b.title, b.body,
    b.body_de, b.body_nl, b.body_fr, b.link, b.status, b.review_note,
    b.recipient_count, b.sent_at, b.updated_at,
    jsonb_build_object('display_name', coalesce(a.display_name, '')) as author,
    case when ap.id is null then null
         else jsonb_build_object('display_name', ap.display_name) end as approver,
    case when br.id is null then null
         else jsonb_build_object('name', br.name) end as branch
  from public.broadcasts b
  join public.profiles a on a.id = b.author_id
  left join public.profiles ap on ap.id = b.approved_by
  left join public.branches br on br.id = b.branch_id
  where public.caller_is_admin_live()
     or b.author_id = (select auth.uid())
     or b.branch_id = (
       select p.branch_id from public.profiles p where p.id = (select auth.uid())
     )
  order by b.updated_at desc;
$function$;

revoke all on function public.visible_broadcasts()
  from public, anon, authenticated, service_role;
grant execute on function public.visible_broadcasts() to authenticated, service_role;

comment on function public.visible_broadcasts is
  'What a staff caller may see of the broadcast list (docs/spec/17 §2). A leader: their own work and their branch''s history. An admin: everything, because the approval queue is everything waiting.';

/**
 * Start a draft.
 *
 * MINISTRY SCOPE IS ADMIN-ONLY HERE, not only in the dashboard. `authorize()` refuses the
 * route, and this refuses the call, because `authenticated` can reach this function with a
 * crafted payload and nothing else is in the way (`17` §Platform: client input never
 * supplies authority).
 *
 * A BRANCH-SCOPED DRAFT GOES TO THE AUTHOR'S OWN BRANCH, taken from their profile rather
 * than from the argument, unless they are an admin. A leader who could name the branch
 * could address another branch's members, which is the same class of hole as a request-body
 * branch id in a moderation route.
 */
create function public.create_broadcast_draft(
  scope public.broadcast_scope,
  branch_id uuid default null,
  title text default '',
  body text default '',
  body_de text default null,
  body_nl text default null,
  body_fr text default null,
  link text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
  is_admin boolean := public.caller_is_admin_live();
  actor_branch uuid;
  actor_role public.profile_role;
  target_branch uuid;
  new_id uuid;
begin
  select p.branch_id, p.role into actor_branch, actor_role
  from public.profiles p where p.id = actor and p.deleted_at is null;

  if actor_role not in ('leader', 'admin') then
    raise exception 'only staff may write a broadcast'
      using errcode = 'insufficient_privilege';
  end if;

  if scope = 'ministry' then
    if not is_admin then
      raise exception 'only an admin may write to the whole ministry'
        using errcode = 'insufficient_privilege';
    end if;
    target_branch := null;
  else
    -- An admin may write for any branch; a leader gets their own, whatever they asked for.
    target_branch := case when is_admin then coalesce(branch_id, actor_branch)
                          else actor_branch end;
    if target_branch is null then
      raise exception 'a branch broadcast needs a branch'
        using errcode = 'check_violation';
    end if;
  end if;

  insert into public.broadcasts
    (author_id, scope, branch_id, title, body, body_de, body_nl, body_fr, link)
  values
    (actor, scope, target_branch, title, body, body_de, body_nl, body_fr, link)
  returning id into new_id;

  return new_id;
end;
$function$;

revoke all on function public.create_broadcast_draft(
  public.broadcast_scope, uuid, text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_broadcast_draft(
  public.broadcast_scope, uuid, text, text, text, text, text, text)
  to authenticated, service_role;

/**
 * Edit one.
 *
 * The author only, and only while it is still theirs to change. An edit made while the row
 * is `pending_approval` returns it to `draft` through the table's own trigger, so what an
 * approver reviewed is what sends; that rule is not repeated here, deliberately, because it
 * belongs to the table and every writer should inherit it.
 */
create function public.update_broadcast_draft(
  broadcast uuid,
  scope public.broadcast_scope default 'branch',
  branch_id uuid default null,
  title text default '',
  body text default '',
  body_de text default null,
  body_nl text default null,
  body_fr text default null,
  link text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
  is_admin boolean := public.caller_is_admin_live();
  row_author uuid;
  row_status public.broadcast_status;
  actor_branch uuid;
  target_branch uuid;
begin
  select b.author_id, b.status into row_author, row_status
  from public.broadcasts b where b.id = broadcast;

  if row_author is null then
    raise exception 'no such broadcast' using errcode = 'no_data_found';
  end if;
  if row_author is distinct from actor then
    raise exception 'only the author may edit this broadcast'
      using errcode = 'insufficient_privilege';
  end if;
  if row_status not in ('draft', 'pending_approval', 'rejected') then
    raise exception 'a broadcast that has been released cannot be edited'
      using errcode = 'check_violation';
  end if;
  if scope = 'ministry' and not is_admin then
    raise exception 'only an admin may write to the whole ministry'
      using errcode = 'insufficient_privilege';
  end if;

  select p.branch_id into actor_branch from public.profiles p where p.id = actor;
  target_branch := case
    when scope = 'ministry' then null
    when is_admin then coalesce(branch_id, actor_branch)
    else actor_branch
  end;

  update public.broadcasts b
    set scope = update_broadcast_draft.scope,
        branch_id = target_branch,
        title = update_broadcast_draft.title,
        body = update_broadcast_draft.body,
        body_de = update_broadcast_draft.body_de,
        body_nl = update_broadcast_draft.body_nl,
        body_fr = update_broadcast_draft.body_fr,
        link = update_broadcast_draft.link
    where b.id = broadcast;

  return broadcast;
end;
$function$;

revoke all on function public.update_broadcast_draft(
  uuid, public.broadcast_scope, uuid, text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_broadcast_draft(
  uuid, public.broadcast_scope, uuid, text, text, text, text, text, text)
  to authenticated, service_role;

/**
 * How many of the audience have a phone registered.
 *
 * The confirmation screen shows this beside the total, because "128 people, 32 of whom will
 * not see it until they next open the app" is a materially different decision from "128
 * people" (`17` §2 asks for the exact count; the split is what makes the count mean
 * something). It reads the SAME audience function the fan-out will, so the number a leader
 * approved and the set that receives cannot drift.
 */
create function public.broadcast_reach_with_device(broadcast uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select count(distinct r.profile_id)::integer
  from public.broadcast_recipients(broadcast) r
  join public.devices d on d.profile_id = r.profile_id;
$function$;

revoke all on function public.broadcast_reach_with_device(uuid)
  from public, anon, authenticated, service_role;
-- Granted to `authenticated` for the same narrow reason as the count itself: staff who are
-- about to message exactly these people are being shown how many of them will hear it now.
grant execute on function public.broadcast_reach_with_device(uuid)
  to authenticated, service_role;

commit;
