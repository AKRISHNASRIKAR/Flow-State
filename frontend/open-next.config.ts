import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// The dashboard is client-rendered against the API — there is no ISR or
// server data cache to back with R2/KV, so the defaults are all it needs.
export default defineCloudflareConfig();
