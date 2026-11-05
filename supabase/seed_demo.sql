-- Run in Supabase SQL Editor AFTER creating these three users in Authentication > Users.
-- Change the email addresses below to match your users. This script is for a fresh demo database.
do $$
declare
  manager_id uuid;
  worker1_id uuid;
  worker2_id uuid;
  p1 uuid;
  p2 uuid;
  p3 uuid;
  t_id uuid;
begin
  select id into manager_id from auth.users where email = 'manager@example.com';
  select id into worker1_id from auth.users where email = 'worker1@example.com';
  select id into worker2_id from auth.users where email = 'worker2@example.com';
  if manager_id is null or worker1_id is null or worker2_id is null then
    raise exception 'Create all three demo users and update email addresses in seed_demo.sql';
  end if;

  update public.profiles set role = 'manager', display_name = 'Руководитель' where id = manager_id;
  update public.profiles set role = 'executor', display_name = 'Алексей' where id = worker1_id;
  update public.profiles set role = 'executor', display_name = 'Мария' where id = worker2_id;
  perform set_config('request.jwt.claim.sub', manager_id::text, true);

  insert into public.projects(name,address) values ('ЖК Северный, корпус 1','Новосибирск, ул. Лесная, 12') returning id into p1;
  insert into public.projects(name,address) values ('Школа на Речной','Новосибирск, ул. Речная, 5') returning id into p2;
  insert into public.projects(name,address) values ('Складской комплекс','Новосибирск, ул. Промышленная, 40') returning id into p3;

  insert into public.tasks(project_id,title,description,assignee_id,author_id)
  values (p1,'Проверить фундамент','Осмотреть опалубку и приложить замечания.',worker1_id,manager_id);

  insert into public.tasks(project_id,title,description,assignee_id,author_id)
  values (p1,'Заказать материалы','Согласовать список материалов для второго этажа.',worker2_id,manager_id)
  returning id into t_id;
  update public.tasks set status = 'in_progress' where id = t_id;
  insert into public.task_history(task_id,actor_id,from_status,to_status)
  values (t_id,worker2_id,'new','in_progress');

  insert into public.tasks(project_id,title,description,assignee_id,author_id)
  values (p2,'Подготовить акт осмотра','Заполнить акт и отправить руководителю.',worker1_id,manager_id)
  returning id into t_id;
  update public.tasks set status = 'in_progress' where id = t_id;
  insert into public.task_history(task_id,actor_id,from_status,to_status) values (t_id,worker1_id,'new','in_progress');
  update public.tasks set status = 'review' where id = t_id;
  insert into public.task_history(task_id,actor_id,from_status,to_status) values (t_id,worker1_id,'in_progress','review');

  insert into public.tasks(project_id,title,description,assignee_id,author_id)
  values (p2,'Исправить схему электрики','Проверить расположение щитов.',worker2_id,manager_id)
  returning id into t_id;
  update public.tasks set status = 'in_progress' where id = t_id;
  insert into public.task_history(task_id,actor_id,from_status,to_status) values (t_id,worker2_id,'new','in_progress');
  update public.tasks set status = 'review' where id = t_id;
  insert into public.task_history(task_id,actor_id,from_status,to_status) values (t_id,worker2_id,'in_progress','review');
  update public.tasks set status = 'rework' where id = t_id;
  insert into public.task_history(task_id,actor_id,from_status,to_status,comment)
  values (t_id,manager_id,'review','rework','Уточнить маркировку кабелей на схеме.');

  insert into public.tasks(project_id,title,description,assignee_id,author_id)
  values (p3,'Принять поставку','Сверить накладную с фактической поставкой.',worker1_id,manager_id)
  returning id into t_id;
  update public.tasks set status = 'in_progress' where id = t_id;
  insert into public.task_history(task_id,actor_id,from_status,to_status) values (t_id,worker1_id,'new','in_progress');
  update public.tasks set status = 'review' where id = t_id;
  insert into public.task_history(task_id,actor_id,from_status,to_status) values (t_id,worker1_id,'in_progress','review');
  update public.tasks set status = 'accepted' where id = t_id;
  insert into public.task_history(task_id,actor_id,from_status,to_status) values (t_id,manager_id,'review','accepted');
end $$;
