-- Control database. Derived entitlement only: never replaces a purchased subscription.
BEGIN;
DO $patch$
DECLARE def text;body_at integer;override text;
BEGIN
 def:=pg_get_functiondef('payment_plan_effective(uuid)'::regprocedure);
 IF strpos(def,'system_workspace_unlimited')>0 THEN RAISE EXCEPTION 'system override already installed';END IF;
 body_at:=strpos(upper(def),'BEGIN');
 IF body_at=0 THEN RAISE EXCEPTION 'effective plan entry point changed';END IF;
 override:=$body$
 -- system_workspace_unlimited: selection is checked on every effective-plan read.
 IF platform_billing_system_workspace(w) THEN
  RETURN jsonb_build_object('active',true,'platform_billing',true,'plan_id','system-workspace','version_id',NULL,'revision',0,
   'period_start',date_trunc('month',now() AT TIME ZONE 'Asia/Dhaka') AT TIME ZONE 'Asia/Dhaka',
   'period_end',(date_trunc('month',now() AT TIME ZONE 'Asia/Dhaka')+interval '1 month') AT TIME ZONE 'Asia/Dhaka',
   'access_until','infinity','extra_payments',0,'next_version_id',NULL,
   'terms',jsonb_build_object('name','System workspace','name_bn','সিস্টেম ওয়ার্কস্পেস','kind','free','amount_minor',0,
    'description','','description_bn','','period_days',30,'grace_days',0,'free_days',NULL,'quota_period','calendar',
    'payment_limit',NULL,'active_checkout_limit',NULL,'create_per_minute',NULL,
    'features',jsonb_build_object('invoices',true,'payment_links',true,'reports',true,'exports',true),
    'limits',jsonb_build_object('api_keys',NULL,'team_members',NULL,'devices',NULL,'payment_methods',NULL),
    'badge','','badge_bn','','contact_url',''));
 END IF;
$body$;
 def:=overlay(def placing 'BEGIN'||override from body_at for 5);
 EXECUTE def;
END $patch$;
COMMIT;
