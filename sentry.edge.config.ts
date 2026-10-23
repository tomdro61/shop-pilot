// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://a9864355af3e6629013ac882719c8407@o4511340408143872.ingest.us.sentry.io/4511340410109952",

  // A browser tab loaded before a deploy keeps the old client bundle. Its next
  // in-page navigation sends a router-state header the new server rejects;
  // Next throws, captureRequestError files it as an unhandled error, and the
  // client falls back to a full-page navigation (fetch-server-response.js,
  // non-OK RSC response -> doMpaNavigation). The app code is fine. Seen
  // 2026-10-23 (SHOP-PILOT-T, after the Next 16.1.6 -> 16.4.2 router-state
  // schema change). A stale server-action id usually gets console.warn + 409
  // from action-handler.js and does not reach captureRequestError; the second
  // pattern covers the rarer path where the module-map lookup throws. Keep
  // both exact; "router state header was too large" etc. still report.
  ignoreErrors: [
    /^The router state header was sent but could not be parsed\.?$/,
    /^Failed to find Server Action( "[0-9a-f]+")?\. This request might be from an older or newer deployment\./,
  ],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 0.1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});
