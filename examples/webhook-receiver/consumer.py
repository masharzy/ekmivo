"""Merchant server integration. Apply schema.sql to the merchant DB first.
Requires psycopg 3; HTTP routes must pass the untouched raw body and headers.
No success redirect can call this handler to fulfil an order.
"""
import json
import urllib.request
import urllib.parse
from verify import verify as verify_briofold

def consume(raw, headers, config, connection):
    event = verify_briofold(raw, headers, config['secret'], config['workspace'], config['environment'])
    origin = urllib.parse.urlsplit(config['api_origin'])
    if origin.scheme != 'https' or not origin.hostname or origin.username or origin.query or origin.fragment:
        raise ValueError('Configured HTTPS API origin required')
    payment = event['data']
    target = urllib.parse.urlunsplit(('https', origin.netloc,
        '/v1/workspaces/'+config['workspace']+'/operations/payments/'+payment['payment_id'],
        urllib.parse.urlencode({'environment':config['environment']}), ''))
    request = urllib.request.Request(target, headers={'Authorization':'Bearer '+config['api_key']})
    # Redirects must never carry credentials to another origin.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, hdrs, newurl): return None
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=5) as response:
        raw_state = response.read(16385)
        if len(raw_state)>16384: raise ValueError('API response bound exceeded')
        state = json.loads(raw_state)
    items = state.get('items', [])
    if len(items)!=1 or any(items[0].get(k)!=payment.get(v) for k,v in
        [('id','payment_id'),('merchant_reference','merchant_reference'),('verified_amount_minor','amount_minor'),('currency','currency')]):
        raise ValueError('Authoritative payment query mismatch')
    with connection.transaction():
        expected = connection.execute('SELECT amount_minor FROM merchant_orders WHERE reference=%s FOR UPDATE',
            (payment['merchant_reference'],)).fetchone()
        if not expected or expected[0]!=payment['amount_minor']: raise ValueError('Order total mismatch')
        previous = connection.execute('SELECT payment_id FROM merchant_fulfilment_jobs WHERE reference=%s', (payment['merchant_reference'],)).fetchone()
        if previous and str(previous[0])!=payment['payment_id']: raise ValueError('Different payment already accepted; reconcile overpayment')
        inserted = connection.execute('INSERT INTO merchant_webhook_events(event_id,payment_id,reference) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING RETURNING event_id',
            (event['id'],payment['payment_id'],payment['merchant_reference'])).fetchone()
        if inserted:
            connection.execute('INSERT INTO merchant_fulfilment_jobs(reference,payment_id) VALUES(%s,%s) ON CONFLICT DO NOTHING',
                (payment['merchant_reference'],payment['payment_id']))
    return {'accepted': True, 'duplicate': not bool(inserted)}
