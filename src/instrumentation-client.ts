// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://a9864355af3e6629013ac882719c8407@o4511340408143872.ingest.us.sentry.io/4511340410109952",

  // Browser extensions inject scripts into every page and the SDK's global error
  // handler captures whatever they throw as if it were ours. A staff machine's
  // crypto-wallet extension filed "Failed to connect to MetaMask" against
  // /dashboard as a vercel-production error (Aug 2026) — stacktrace entirely in
  // app:///scripts/inpage.js, zero application frames. Noise like that trains you
  // to ignore Sentry, which is worse than not having it.
  //
  // Keep these narrow. Do NOT broaden to bare /^app:\/\/\// — Sentry also
  // normalizes real application frames under that scheme, so a wide rule here
  // would silently discard our own errors.
  denyUrls: [
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
    /^safari-(web-)?extension:\/\//i,
    /^chrome:\/\//i,
    /^app:\/\/\/scripts\//i,
  ],
  ignoreErrors: [
    // Wallet extensions probe for each other on page load. This app has no web3
    // code and no wallet dependencies, so any such error is someone's browser.
    /MetaMask/i,
    /ethereum provider/i,
  ],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 0.1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
