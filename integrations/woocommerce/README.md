# WooCommerce payment connector

Source implementation, not a live-tested WordPress release. PHP 8.1+, WooCommerce and a durable InnoDB database are required. Install the `woocommerce` folder as a WordPress plugin. Activate it after defining the server-side constants listed at the top of `ekmivo-payments.php` in a secret-managed `wp-config.php`. Never paste secrets into public pages or JavaScript.

Register `https://your-store/wp-json/ekmivo/v1/webhook` as an Briofold signed endpoint. Use that endpoint's raw signing secret. Merchant API key scopes: payments:write and payments:read. Both credentials must belong to the same business/environment. Set the API and checkout HTTPS origins explicitly.

The payment method appears only when server configuration is valid. It creates a server-priced BDT hosted checkout. A changed total using the same order key conflicts; resolve the old request rather than creating a second blind charge. Webhooks validate raw HMAC, timestamp, account/environment, reference, currency and total, then query authoritative Go payment state. A unique durable job is acknowledged after database insertion. Conflicting second payment IDs go to review.

Configure a real server scheduler to invoke WordPress cron at least every minute; traffic-driven WP-Cron alone is not reliable. Recovery jobs claim leases and call WooCommerce's idempotent payment completion. A crash after payment completion is recovered by comparing the already-paid transaction ID; never shipping a second order. Changed totals or another payment ID require review.

Required combined verification: sandbox checkout, failed creation/lost response, signature tampering, wrong environment, wrong order total, duplicate webhook, process death before/after payment completion, actual scheduler and HPOS compatibility. Successful redirect does not fulfil goods. Refunds are requests to the seller; this plugin does not transfer money or advertise native refunds.
