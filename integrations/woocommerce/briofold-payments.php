<?php
/**
 * Plugin Name: Briofold Payments
 * Description: Hosted phone-verified payments with signed server webhooks.
 * Version: 0.1.0
 * Requires PHP: 8.1
 */
defined('ABSPATH') || exit;
// Configure secrets in wp-config.php/secret manager, never browser settings:
// EKMIVO_API_ORIGIN, EKMIVO_API_KEY, EKMIVO_WORKSPACE, EKMIVO_ENVIRONMENT,
// EKMIVO_WEBHOOK_SECRET, EKMIVO_CHECKOUT_ORIGIN (HTTPS).
require_once __DIR__.'/verify.php';
function ekmivo_config():array {
    $c=[];foreach(['API_ORIGIN','API_KEY','WORKSPACE','ENVIRONMENT','WEBHOOK_SECRET','CHECKOUT_ORIGIN'] as $name){$key='EKMIVO_'.$name;if(!defined($key))throw new RuntimeException('Server configuration unavailable');$c[$name]=constant($key);}
    foreach(['API_ORIGIN','CHECKOUT_ORIGIN'] as $name){$u=parse_url($c[$name]);if(($u['scheme']??'')!=='https'||empty($u['host'])||isset($u['user'])||isset($u['pass'])||!in_array($u['path']??'',['','/'],true)||isset($u['query'])||isset($u['fragment']))throw new RuntimeException('Configured HTTPS origin required');}
    if(!in_array($c['ENVIRONMENT'],['sandbox','live'],true)||!preg_match('/^[0-9a-f-]{36}$/',$c['WORKSPACE'])||strlen($c['WEBHOOK_SECRET'])<32)throw new RuntimeException('Server scope unavailable');return $c;
}
function ekmivo_api(string $method,string $path,?array $body=null,string $key=''):array {
    $c=ekmivo_config();$args=['method'=>$method,'timeout'=>10,'redirection'=>0,'headers'=>['Authorization'=>'Bearer '.$c['API_KEY'],'Content-Type'=>'application/json']];if($key!=='')$args['headers']['Idempotency-Key']=$key;if($body!==null)$args['body']=wp_json_encode($body);
    $r=wp_remote_request(rtrim($c['API_ORIGIN'],'/').$path.'?environment='.$c['ENVIRONMENT'],$args);
    if(is_wp_error($r)||wp_remote_retrieve_response_code($r)<200||wp_remote_retrieve_response_code($r)>=300)throw new RuntimeException('Payment API outcome unconfirmed');$raw=wp_remote_retrieve_body($r);if(strlen($raw)>32768)throw new RuntimeException('API response too large');return json_decode($raw,true,32,JSON_THROW_ON_ERROR);
}
register_activation_hook(__FILE__,function(){global $wpdb;require_once ABSPATH.'wp-admin/includes/upgrade.php';$table=$wpdb->prefix.'ekmivo_payment_jobs';dbDelta("CREATE TABLE $table (reference varchar(128) NOT NULL,event_id varchar(36) NOT NULL,payment_id varchar(36) NOT NULL,order_id bigint unsigned NOT NULL,amount_minor bigint unsigned NOT NULL,state varchar(16) NOT NULL DEFAULT 'queued',lease_until datetime NULL,created_at datetime NOT NULL,PRIMARY KEY(reference),UNIQUE KEY event_id(event_id),UNIQUE KEY payment_id(payment_id)) ENGINE=InnoDB ".$wpdb->get_charset_collate().';');if(!wp_next_scheduled('ekmivo_process_jobs'))wp_schedule_event(time()+60,'ekmivo_minute','ekmivo_process_jobs');});
register_deactivation_hook(__FILE__,fn()=>wp_clear_scheduled_hook('ekmivo_process_jobs'));
add_filter('cron_schedules',function($s){$s['ekmivo_minute']=['interval'=>60,'display'=>'Briofold payment recovery'];return $s;});
add_action('plugins_loaded',function(){if(!class_exists('WC_Payment_Gateway'))return;
    class WC_Gateway_Briofold extends WC_Payment_Gateway {
        public function __construct(){ $this->id='briofold';$this->method_title='Briofold';$this->has_fields=false;$this->title='bKash / Nagad / Rocket';$this->description='Pay through the secure Briofold checkout. Verification is automatic.';$this->enabled='yes';$this->supports=['products'];try{ekmivo_config();}catch(Throwable){$this->enabled='no';}}
        public function process_payment($order_id){try{
            $c=ekmivo_config();$order=wc_get_order($order_id);if(!$order||$order->get_currency()!=='BDT'||$order->is_paid())throw new RuntimeException('Order cannot create a payment');
            $amount=(int)round((float)$order->get_total()*100);if($amount<=0)throw new RuntimeException('Invalid total');$reference='WC-'.$order_id;
            $result=ekmivo_api('POST','/v1/workspaces/'.$c['WORKSPACE'].'/payment-intents',['merchant_reference'=>$reference,'amount_minor'=>$amount,'currency'=>'BDT','expires_in_minutes'=>30],'woocommerce-'.$c['ENVIRONMENT'].'-'.$order_id);
            $token=$result['checkout_token']??'';if(!preg_match('/^[A-Za-z0-9_-]{43}$/',$token))throw new RuntimeException('Checkout capability unavailable');
            $order->update_meta_data('_ekmivo_expected_minor',$amount);$order->update_meta_data('_ekmivo_reference',$reference);$order->save();
            return ['result'=>'success','redirect'=>rtrim($c['CHECKOUT_ORIGIN'],'/').'/en/checkout/'.$token];
        }catch(Throwable){wc_add_notice('Payment could not be prepared. Please retry; no payment is confirmed.','error');return ['result'=>'failure'];}}
    }
    add_filter('woocommerce_payment_gateways',function($gateways){$gateways[]='WC_Gateway_Briofold';return $gateways;});
});
add_action('rest_api_init',function(){register_rest_route('briofold/v1','/webhook',['methods'=>'POST','permission_callback'=>'__return_true','callback'=>function(WP_REST_Request $request){global $wpdb;try{
    $c=ekmivo_config();$headers=[];foreach($request->get_headers() as $k=>$v)$headers[str_replace('_','-',$k)]=is_array($v)?$v[0]:$v;
    $event=verifyBriofold($request->get_body(),$headers,$c['WEBHOOK_SECRET'],$c['WORKSPACE'],$c['ENVIRONMENT']);$p=$event['data'];
    if(!preg_match('/^WC-([1-9][0-9]*)$/',$p['merchant_reference'],$m))return new WP_Error('scope','Order reference rejected',['status'=>422]);
    $order=wc_get_order((int)$m[1]);if(!$order||$order->get_payment_method()!=='briofold'||$order->get_currency()!=='BDT'||(int)$order->get_meta('_ekmivo_expected_minor')!==$p['amount_minor']||(int)round((float)$order->get_total()*100)!==$p['amount_minor'])return new WP_Error('mismatch','Order total changed',['status'=>409]);
    $state=ekmivo_api('GET','/v1/workspaces/'.$c['WORKSPACE'].'/operations/payments/'.$p['payment_id']);$rows=$state['items']??[];
    if(count($rows)!==1||$rows[0]['id']!==$p['payment_id']||$rows[0]['merchant_reference']!==$p['merchant_reference']||(int)$rows[0]['verified_amount_minor']!==$p['amount_minor']||$rows[0]['currency']!=='BDT')return new WP_Error('query','Payment query mismatch',['status'=>409]);
    $table=$wpdb->prefix.'ekmivo_payment_jobs';$inserted=$wpdb->query($wpdb->prepare("INSERT IGNORE INTO $table(reference,event_id,payment_id,order_id,amount_minor,created_at) VALUES(%s,%s,%s,%d,%d,UTC_TIMESTAMP())",$p['merchant_reference'],$event['id'],$p['payment_id'],$order->get_id(),$p['amount_minor']));
    if($inserted===false)return new WP_Error('queue','Durable queue unavailable',['status'=>503]);$saved=$wpdb->get_row($wpdb->prepare("SELECT payment_id FROM $table WHERE reference=%s",$p['merchant_reference']));if(!$saved||$saved->payment_id!==$p['payment_id'])return new WP_Error('collision','Payment requires review',['status'=>409]);
    return new WP_REST_Response(['accepted'=>true],200);
}catch(Throwable){return new WP_Error('unconfirmed','Webhook rejected or query unavailable',['status'=>503]);}}]);});
add_action('ekmivo_process_jobs',function(){global $wpdb;if(!function_exists('wc_get_order'))return;$table=$wpdb->prefix.'ekmivo_payment_jobs';$rows=$wpdb->get_results("SELECT * FROM $table WHERE state='queued' OR(state='running' AND lease_until<UTC_TIMESTAMP()) ORDER BY created_at LIMIT 20");foreach($rows as $job){
    $claimed=$wpdb->query($wpdb->prepare("UPDATE $table SET state='running',lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 MINUTE) WHERE reference=%s AND(state='queued' OR(state='running' AND lease_until<UTC_TIMESTAMP()))",$job->reference));if($claimed!==1)continue;
    $order=wc_get_order($job->order_id);if(!$order||$order->get_payment_method()!=='briofold'||(int)round((float)$order->get_total()*100)!==(int)$job->amount_minor){$wpdb->update($table,['state'=>'review'],['reference'=>$job->reference]);continue;}
    if($order->is_paid()&&$order->get_transaction_id()!==$job->payment_id){$wpdb->update($table,['state'=>'review'],['reference'=>$job->reference]);continue;}
    if(!$order->is_paid())$order->payment_complete($job->payment_id);$wpdb->update($table,['state'=>'complete','lease_until'=>null],['reference'=>$job->reference]);
}});
