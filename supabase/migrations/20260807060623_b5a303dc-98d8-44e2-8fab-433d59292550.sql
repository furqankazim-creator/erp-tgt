
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name text,
  avatar_url text,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by team" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own profile write" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, email text, role text, department text, location text,
  avatar_url text, status text NOT NULL DEFAULT 'Active',
  workload int NOT NULL DEFAULT 50, leave_balance int NOT NULL DEFAULT 20,
  onboarding_progress int NOT NULL DEFAULT 100, hired_at date,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, industry text, website text, owner text, country text,
  status text NOT NULL DEFAULT 'Active', contract_status text NOT NULL DEFAULT 'Draft',
  annual_value numeric NOT NULL DEFAULT 0, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  name text NOT NULL, email text, phone text, title text, company text,
  stage text NOT NULL DEFAULT 'Lead', tags text[] NOT NULL DEFAULT '{}',
  source text, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  title text NOT NULL, value numeric NOT NULL DEFAULT 0,
  stage text NOT NULL DEFAULT 'Lead', owner text, probability int NOT NULL DEFAULT 20,
  close_date date, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, client text, status text NOT NULL DEFAULT 'In Progress',
  progress int NOT NULL DEFAULT 0, lead text, deadline date, budget numeric NOT NULL DEFAULT 0,
  description text, image_url text, tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL, assignee text, priority text NOT NULL DEFAULT 'Medium',
  status text NOT NULL DEFAULT 'To Do', due_date date,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, attendees text, starts_at timestamptz NOT NULL DEFAULT now(),
  duration_minutes int NOT NULL DEFAULT 30, link text, notes text,
  status text NOT NULL DEFAULT 'Scheduled', kind text NOT NULL DEFAULT 'Meeting',
  client text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, client text, status text NOT NULL DEFAULT 'Draft',
  value numeric NOT NULL DEFAULT 0, signed_at date, expires_at date, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL, client text, priority text NOT NULL DEFAULT 'Medium',
  status text NOT NULL DEFAULT 'Open', satisfaction int, assignee text,
  sla_due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, folder text NOT NULL DEFAULT 'General', file_type text,
  size_kb int NOT NULL DEFAULT 0, owner text, url text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, channel text, status text NOT NULL DEFAULT 'Active',
  budget numeric NOT NULL DEFAULT 0, spent numeric NOT NULL DEFAULT 0,
  reach int NOT NULL DEFAULT 0, conversions int NOT NULL DEFAULT 0,
  starts_on date, ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['employees','accounts','contacts','deals','projects','tasks','meetings','agreements','tickets','documents','campaigns']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "team can read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "team can write %1$s" ON public.%1$I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE TRIGGER touch_%1$s BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t);
  END LOOP;
END $$;

INSERT INTO public.employees (name,email,role,department,location,status,workload,leave_balance,onboarding_progress,hired_at) VALUES
('Ahmed Masror','ahmed.masror@globaltech.io','VP of Sales','Sales','Dubai','Active',82,12,100,'2021-03-14'),
('Sofia Almeida','sofia.almeida@globaltech.io','Head of Marketing','Marketing','Lisbon','Active',67,18,100,'2020-11-02'),
('Daniel Kim','daniel.kim@globaltech.io','Engineering Manager','Engineering','Seoul','Active',91,7,100,'2019-06-24'),
('Priya Nair','priya.nair@globaltech.io','Senior Product Designer','Design','Bangalore','Active',54,21,100,'2022-01-10'),
('Marcus Bell','marcus.bell@globaltech.io','Account Executive','Sales','London','Active',73,15,100,'2023-04-03'),
('Lena Hoffmann','lena.hoffmann@globaltech.io','HR Business Partner','People','Berlin','Active',48,24,100,'2021-09-16'),
('Owen Carter','owen.carter@globaltech.io','Support Lead','After Sales','Austin','Active',77,9,100,'2022-07-11'),
('Yuki Tanaka','yuki.tanaka@globaltech.io','Data Analyst','Operations','Tokyo','Onboarding',30,25,45,'2026-07-20'),
('Amara Okafor','amara.okafor@globaltech.io','Project Manager','Delivery','Lagos','Active',86,11,100,'2020-02-18'),
('Tomas Rivera','tomas.rivera@globaltech.io','DevOps Engineer','Engineering','Madrid','On Leave',20,4,100,'2021-12-01');

INSERT INTO public.accounts (name,industry,website,owner,country,status,contract_status,annual_value,notes) VALUES
('Nimbus Logistics','Logistics','nimbuslogistics.com','Ahmed Masror','UAE','Active','Signed',480000,'Expanding to 3 new regions in Q4.'),
('Vertex Health','Healthcare','vertexhealth.com','Marcus Bell','UK','Active','Signed',310000,'Compliance review scheduled.'),
('Solaris Energy','Energy','solarisenergy.com','Ahmed Masror','Spain','Active','Sent',225000,'Awaiting legal sign-off.'),
('Kite Financial','Fintech','kitefinancial.com','Marcus Bell','Singapore','Prospect','Draft',150000,'Pilot proposal in progress.'),
('Orbit Retail','Retail','orbitretail.com','Sofia Almeida','Germany','Active','Signed',96000,'Upsell opportunity: analytics add-on.'),
('Harbor Media','Media','harbormedia.com','Marcus Bell','USA','Churn Risk','Expired',72000,'Renewal at risk — low usage.');

INSERT INTO public.contacts (account_id,name,email,phone,title,company,stage,tags,source,notes)
SELECT a.id, v.name, v.email, v.phone, v.title, a.name, v.stage, v.tags, v.source, v.notes
FROM (VALUES
 ('Nimbus Logistics','Ahmed Masror','ahmed@nimbuslogistics.com','+971 50 118 2200','COO','Qualified',ARRAY['decision-maker','enterprise'],'Referral','Prefers WhatsApp updates.'),
 ('Nimbus Logistics','Rania Sabbagh','rania@nimbuslogistics.com','+971 50 771 9080','Head of IT','Proposal',ARRAY['technical'],'Webinar','Needs SSO documentation.'),
 ('Vertex Health','Eleanor Shaw','eleanor@vertexhealth.com','+44 20 7946 0102','CTO','Won',ARRAY['champion'],'Outbound','Signed 3-year deal.'),
 ('Solaris Energy','Pablo Ortega','pablo@solarisenergy.com','+34 611 220 331','VP Operations','Contacted',ARRAY['warm'],'Conference','Follow up after budget cycle.'),
 ('Kite Financial','Wei Lin','wei.lin@kitefinancial.com','+65 8123 4455','Head of Growth','Lead',ARRAY['inbound','fintech'],'Website','Requested pricing sheet.'),
 ('Orbit Retail','Greta Vogel','greta@orbitretail.com','+49 151 2234 8890','Marketing Director','Qualified',ARRAY['marketing'],'LinkedIn','Interested in analytics add-on.'),
 ('Harbor Media','Jordan Pike','jordan@harbormedia.com','+1 415 220 8891','Producer','Lost',ARRAY['at-risk'],'Partner','Lost to in-house build.')
) AS v(account,name,email,phone,title,stage,tags,source,notes)
JOIN public.accounts a ON a.name = v.account;

INSERT INTO public.deals (account_id,title,value,stage,owner,probability,close_date,notes)
SELECT a.id, v.title, v.value, v.stage, v.owner, v.prob, v.close_date::date, v.notes
FROM (VALUES
 ('Nimbus Logistics','Fleet Platform Expansion',180000,'Proposal','Ahmed Masror',65,'2026-09-12','Pricing approved internally.'),
 ('Vertex Health','Vertex Data Warehouse',240000,'Won','Marcus Bell',100,'2026-06-30','Closed won.'),
 ('Solaris Energy','Grid Monitoring Suite',132000,'Qualified','Ahmed Masror',45,'2026-10-05','Technical review next week.'),
 ('Kite Financial','Fintech Pilot Program',56000,'Contacted','Marcus Bell',25,'2026-11-18','Pilot scope drafting.'),
 ('Orbit Retail','Analytics Add-on',34000,'Lead','Sofia Almeida',15,'2026-12-01','Inbound demo request.'),
 ('Harbor Media','Renewal 2026',72000,'Lost','Marcus Bell',0,'2026-07-01','Lost to in-house build.'),
 ('Nimbus Logistics','Regional Rollout Phase 2',95000,'Qualified','Ahmed Masror',50,'2026-10-22','Depends on phase 1 delivery.')
) AS v(account,title,value,stage,owner,prob,close_date,notes)
JOIN public.accounts a ON a.name = v.account;

INSERT INTO public.projects (name,client,status,progress,lead,deadline,budget,description,tags) VALUES
('Nimbus Fleet Portal','Nimbus Logistics','In Progress',68,'Amara Okafor','2026-10-15',210000,'Real-time fleet tracking portal with predictive maintenance.',ARRAY['web','logistics']),
('Vertex Data Warehouse','Vertex Health','In Progress',42,'Daniel Kim','2026-11-30',240000,'HIPAA-compliant analytics warehouse and dashboards.',ARRAY['data','healthcare']),
('Solaris Grid Monitor','Solaris Energy','Planning',12,'Daniel Kim','2027-01-20',132000,'IoT monitoring for renewable grid assets.',ARRAY['iot','energy']),
('Orbit Commerce Revamp','Orbit Retail','Done',100,'Priya Nair','2026-05-28',96000,'Headless commerce redesign delivering +34% conversion.',ARRAY['ecommerce','design']),
('Kite Mobile Wallet','Kite Financial','On Hold',25,'Amara Okafor','2027-03-10',150000,'Cross-border wallet app pilot.',ARRAY['mobile','fintech']);

INSERT INTO public.tasks (project_id,title,assignee,priority,status,due_date)
SELECT p.id, v.title, v.assignee, v.priority, v.status, v.due::date
FROM (VALUES
 ('Nimbus Fleet Portal','Build route optimisation service','Daniel Kim','High','In Progress','2026-08-20'),
 ('Nimbus Fleet Portal','QA regression on driver app','Yuki Tanaka','Medium','To Do','2026-08-28'),
 ('Nimbus Fleet Portal','Client UAT walkthrough','Amara Okafor','High','Review','2026-09-04'),
 ('Vertex Data Warehouse','Define PHI masking rules','Daniel Kim','Critical','In Progress','2026-08-14'),
 ('Vertex Data Warehouse','Dashboard wireframes','Priya Nair','Medium','Done','2026-08-01'),
 ('Solaris Grid Monitor','Hardware vendor evaluation','Tomas Rivera','Medium','To Do','2026-09-09'),
 ('Orbit Commerce Revamp','Post-launch performance report','Sofia Almeida','Low','Done','2026-06-10'),
 ('Kite Mobile Wallet','Regulatory checklist','Lena Hoffmann','High','To Do','2026-09-15')
) AS v(project,title,assignee,priority,status,due)
JOIN public.projects p ON p.name = v.project;

INSERT INTO public.meetings (title,attendees,starts_at,duration_minutes,link,notes,status,kind,client) VALUES
('Meeting With Ahmed Masror','Ahmed Masror, Marcus Bell','2026-08-07 10:00:00+00',45,'https://meet.globaltech.io/ahmed-masror','Quarterly pipeline review and phase 2 scope.','Scheduled','Meeting','Nimbus Logistics'),
('Vertex Health Steering Committee','Eleanor Shaw, Daniel Kim, Amara Okafor','2026-08-11 14:30:00+00',60,'https://meet.globaltech.io/vertex-steering','Warehouse milestone sign-off.','Scheduled','Meeting','Vertex Health'),
('Solaris Technical Deep Dive','Pablo Ortega, Tomas Rivera','2026-08-13 09:00:00+00',90,'https://meet.globaltech.io/solaris-tech','Architecture walkthrough.','Scheduled','Demo','Solaris Energy'),
('Kite Financial Product Demo','Wei Lin, Marcus Bell','2026-08-18 06:30:00+00',30,'https://meet.globaltech.io/kite-demo','Wallet pilot demo.','Scheduled','Demo','Kite Financial'),
('Orbit Retail Analytics Demo','Greta Vogel, Sofia Almeida','2026-08-20 12:00:00+00',30,'https://meet.globaltech.io/orbit-demo','Analytics add-on walkthrough.','Scheduled','Demo','Orbit Retail'),
('Weekly Leadership Sync','Leadership team','2026-08-10 08:00:00+00',45,'https://meet.globaltech.io/leadership','Standing weekly sync.','Scheduled','Meeting',NULL),
('Harbor Media Renewal Call','Jordan Pike, Marcus Bell','2026-07-28 15:00:00+00',30,'https://meet.globaltech.io/harbor','Renewal declined.','Completed','Meeting','Harbor Media');

INSERT INTO public.agreements (title,client,status,value,signed_at,expires_at,notes) VALUES
('Master Services Agreement','Nimbus Logistics','Signed',480000,'2026-01-15','2027-01-14','Auto-renews annually.'),
('Data Processing Addendum','Vertex Health','Signed',0,'2026-06-30','2029-06-29','HIPAA BAA included.'),
('Pilot Agreement','Kite Financial','Draft',56000,NULL,'2026-12-31','Awaiting internal legal review.'),
('Grid Monitoring SOW','Solaris Energy','Sent',132000,NULL,'2026-10-31','Sent to client 5 Aug.'),
('Analytics Add-on Order Form','Orbit Retail','Signed',34000,'2026-03-02','2027-03-01','Add-on to base contract.'),
('Media Services Contract','Harbor Media','Expired',72000,'2025-07-01','2026-06-30','Not renewed.');

INSERT INTO public.tickets (subject,client,priority,status,satisfaction,assignee,sla_due_at) VALUES
('Driver app crashes on Android 15','Nimbus Logistics','Critical','Open',NULL,'Owen Carter','2026-08-07 18:00:00+00'),
('Slow dashboard load times','Vertex Health','High','Pending',NULL,'Owen Carter','2026-08-08 12:00:00+00'),
('Invoice discrepancy','Orbit Retail','Low','Resolved',5,'Owen Carter','2026-08-05 09:00:00+00'),
('SSO configuration help','Nimbus Logistics','Medium','Resolved',4,'Daniel Kim','2026-08-04 16:00:00+00'),
('Export to CSV missing columns','Solaris Energy','Medium','Open',NULL,'Yuki Tanaka','2026-08-09 10:00:00+00'),
('Feature request: dark mode','Kite Financial','Low','Pending',NULL,'Priya Nair','2026-08-12 10:00:00+00');

INSERT INTO public.documents (name,folder,file_type,size_kb,owner) VALUES
('Nimbus_MSA_2026.pdf','Contracts','pdf',842,'Lena Hoffmann'),
('Vertex_BAA.pdf','Contracts','pdf',311,'Lena Hoffmann'),
('Q3_Sales_Forecast.xlsx','Finance','xlsx',122,'Ahmed Masror'),
('Brand_Guidelines_v4.pdf','Marketing','pdf',5210,'Sofia Almeida'),
('Onboarding_Handbook.docx','People','docx',480,'Lena Hoffmann'),
('Fleet_Portal_Architecture.png','Engineering','png',1840,'Daniel Kim'),
('Orbit_Case_Study.pdf','Marketing','pdf',960,'Sofia Almeida'),
('Support_SLA_Policy.pdf','Operations','pdf',210,'Owen Carter');

INSERT INTO public.campaigns (name,channel,status,budget,spent,reach,conversions,starts_on,ends_on) VALUES
('Q3 Enterprise Demand Gen','Paid Search','Active',60000,38400,412000,318,'2026-07-01','2026-09-30'),
('Logistics Webinar Series','Webinar','Active',18000,11200,42000,164,'2026-06-15','2026-09-15'),
('Fintech Launch Push','Social','Planning',25000,0,0,0,'2026-09-01','2026-11-30'),
('Healthcare Thought Leadership','Content','Active',30000,21750,96000,142,'2026-05-01','2026-10-31'),
('Retail Retargeting','Display','Completed',12000,12000,188000,97,'2026-03-01','2026-05-31');
