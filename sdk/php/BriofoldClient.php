<?php
declare(strict_types=1);
final class BriofoldApiError extends RuntimeException {public function __construct(public readonly int $status,public readonly string $safeCode,public readonly ?string $correlationId=null){parent::__construct($safeCode);}}
final class BriofoldClient {
    private array $operations;
    public function __construct(private string $origin,private string $key,private string $environment){
        $u=parse_url($origin);if(($u['scheme']??'')!=='https'||empty($u['host'])||isset($u['user'])||isset($u['pass'])||!in_array($u['path']??'',['','/'],true)||isset($u['query'])||isset($u['fragment'])||!in_array($environment,['sandbox','live'],true))throw new InvalidArgumentException('HTTPS origin/environment required');
        $this->operations=json_decode(file_get_contents(__DIR__.'/../operations.json'),true,64,JSON_THROW_ON_ERROR);
    }
    public function request(string $operation,array $path=[],array $query=[],mixed $body=null,?string $idempotencyKey=null,?string $rawBody=null,?string $filename=null):mixed {
        $spec=$this->operations[$operation]??throw new InvalidArgumentException('Unknown operation');$target=$spec['path'];foreach($path as $name=>$value)$target=str_replace('{'.$name.'}',rawurlencode((string)$value),$target);if(str_contains($target,'{'))throw new InvalidArgumentException('Missing path parameter');
        if(isset($query['environment'])&&$query['environment']!==$this->environment)throw new InvalidArgumentException('Environment cannot change');$query['environment']=$this->environment;
        $headers=['Content-Type: '.($rawBody!==null?'application/octet-stream':'application/json')];if(!$spec['public'])$headers[]='Authorization: Bearer '.$this->key;if($idempotencyKey!==null)$headers[]='Idempotency-Key: '.$idempotencyKey;
        if($filename!==null){if(strpbrk($filename,"\r\n\0")!==false)throw new InvalidArgumentException('Invalid filename');$headers[]='X-Filename: '.rawurlencode($filename);$headers[]='X-Filename-Encoding: uri-component';}
        if($idempotencyKey!==null&&strpbrk($idempotencyKey,"\r\n")!==false)throw new InvalidArgumentException('Invalid idempotency key');
        $response='';$ch=curl_init(rtrim($this->origin,'/').$target.'?'.http_build_query($query));curl_setopt_array($ch,[CURLOPT_CUSTOMREQUEST=>$spec['method'],CURLOPT_FOLLOWLOCATION=>false,CURLOPT_TIMEOUT=>15,CURLOPT_HTTPHEADER=>$headers,CURLOPT_WRITEFUNCTION=>function($handle,$chunk)use(&$response){if(strlen($response)+strlen($chunk)>2097152)return 0;$response.=$chunk;return strlen($chunk);}]);
        if($rawBody!==null||$body!==null)curl_setopt($ch,CURLOPT_POSTFIELDS,$rawBody??json_encode($body,JSON_THROW_ON_ERROR));$ok=curl_exec($ch);$status=curl_getinfo($ch,CURLINFO_RESPONSE_CODE);$type=curl_getinfo($ch,CURLINFO_CONTENT_TYPE)??'';curl_close($ch);if($ok===false)throw new BriofoldApiError(0,'OUTCOME_UNCONFIRMED');
        if($status<200||$status>=300){$data=json_decode($response,true);throw new BriofoldApiError($status,$data['error']['code']??'REQUEST_FAILED',$data['error']['correlation_id']??null);}
        return str_contains($type,'application/json')?json_decode($response,true,64,JSON_THROW_ON_ERROR):$response;
    }
}
