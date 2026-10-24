// Installability only. Financial or authentication requests are never
// intercepted, mirrored, cached or made available offline by this worker.
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
