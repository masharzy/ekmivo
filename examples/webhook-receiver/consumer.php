<?php
declare(strict_types=1);
require_once __DIR__.'/verify.php';
// Invoke from the merchant server with the exact raw HTTP body. PDO targets
// the merchant application database provisioned using schema.sql.
function consumeBriofold(string $raw,array $headers,array $config,PDO $db):array {
    $event=verifyBriofold($raw,$headers,$config['secret'],$config['workspace'],$config['environment']);
    $p=$event['data'];$origin=parse_url($config['api_origin']);
    if(($origin['scheme']??'')!=='https'||empty($origin['host'])||isset($origin['user'])||isset($origin['query'])||isset($origin['fragment']))throw new RuntimeException('HTTPS API origin required');
    $url='https://'.$origin['host'].(isset($origin['port'])?':'.$origin['port']:'').'/v1/workspaces/'.$config['workspace'].'/operations/payments/'.$p['payment_id'].'?environment='.$config['environment'];
    $ch=curl_init($url);curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_TIMEOUT=>5,CURLOPT_HTTPHEADER=>['Authorization: Bearer '.$config['api_key']]]);
    $body=curl_exec($ch);$status=curl_getinfo($ch,CURLINFO_RESPONSE_CODE);curl_close($ch);
    if($status!==200||!is_string($body)||strlen($body)>16384)throw new RuntimeException('Payment query unavailable');
    $rows=json_decode($body,true,32,JSON_THROW_ON_ERROR)['items']??[];
    if(count($rows)!==1||$rows[0]['id']!==$p['payment_id']||$rows[0]['merchant_reference']!==$p['merchant_reference']||(int)$rows[0]['verified_amount_minor']!==$p['amount_minor']||$rows[0]['currency']!=='BDT')throw new RuntimeException('Payment query mismatch');
    $db->beginTransaction();try {
        $q=$db->prepare('SELECT amount_minor FROM merchant_orders WHERE reference=? FOR UPDATE');$q->execute([$p['merchant_reference']]);$expected=$q->fetchColumn();if($expected===false||(int)$expected!==$p['amount_minor'])throw new RuntimeException('Order mismatch');
        $q=$db->prepare('SELECT payment_id FROM merchant_fulfilment_jobs WHERE reference=?');$q->execute([$p['merchant_reference']]);$previous=$q->fetchColumn();if($previous!==false&&$previous!==$p['payment_id'])throw new RuntimeException('Different payment already accepted; reconcile overpayment');
        $q=$db->prepare('INSERT INTO merchant_webhook_events(event_id,payment_id,reference) VALUES(?,?,?) ON CONFLICT DO NOTHING RETURNING event_id');$q->execute([$event['id'],$p['payment_id'],$p['merchant_reference']]);$inserted=$q->fetchColumn();
        if($inserted!==false){$q=$db->prepare('INSERT INTO merchant_fulfilment_jobs(reference,payment_id) VALUES(?,?) ON CONFLICT DO NOTHING');$q->execute([$p['merchant_reference'],$p['payment_id']]);}
        $db->commit();return ['accepted'=>true,'duplicate'=>$inserted===false];
    }catch(Throwable $e){$db->rollBack();throw $e;}
}
