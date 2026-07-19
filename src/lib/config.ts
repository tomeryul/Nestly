// Public client configuration. The anon key and VAPID public key are safe to
// expose in the browser bundle — data access is protected by row-level security.
// Override any of these at build time with the matching VITE_ env var.
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "https://wvirgnuncvumryhuzhtd.supabase.co";

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_1SVgnMu_1llRFNeya_t7ug_kz2l31oa";

export const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ??
  "BFIeMIP7EuTachOii5Ety3GrsTuPuIq52f9vvo_qJifu9cqqoGAsaAmiP4f-Pvm6Zz48sQ904z3modeEWEE8T44";
