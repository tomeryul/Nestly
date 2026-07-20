// Nestly — push-dispatch edge function
// Invoked by pg_cron (dispatch_push). Reads unsent notifications, sends Web Push
// to each recipient's subscriptions, then marks them push_sent = true.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
function bytesToB64url(b: Uint8Array): string {
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Build a JWK key pair from raw base64url VAPID public point + private scalar.
function vapidJwk(pub: string, priv: string) {
  const raw = b64urlToBytes(pub); // 0x04 || X(32) || Y(32)
  const x = bytesToB64url(raw.slice(1, 33));
  const y = bytesToB64url(raw.slice(33, 65));
  return {
    publicKey: { kty: "EC", crv: "P-256", x, y, ext: true, key_ops: [] as string[] },
    privateKey: { kty: "EC", crv: "P-256", x, y, d: priv, ext: true, key_ops: ["sign"] },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // load config (VAPID keys + cron secret) from private.app_config
  const { data: cfg, error: cfgErr } = await admin.rpc("get_push_config");
  if (cfgErr || !cfg) {
    return new Response(JSON.stringify({ error: "config unavailable" }), { status: 500, headers: cors });
  }
  const config = cfg as Record<string, string>;

  // authorize: pg_cron passes x-cron-secret
  const secret = req.headers.get("x-cron-secret");
  if (config.cron_secret && secret !== config.cron_secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }

  // pending notifications
  const { data: notifs } = await admin
    .from("notifications")
    .select("id,user_id,title,body,link")
    .eq("push_sent", false)
    .limit(200);

  if (!notifs || notifs.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { headers: cors });
  }

  const appServer = await webpush.ApplicationServer.new({
    contactInformation: config.vapid_subject || "mailto:admin@nestly.app",
    vapidKeys: await webpush.importVapidKeys(vapidJwk(config.vapid_public, config.vapid_private), {
      extractable: false,
    }),
  });

  const userIds = [...new Set(notifs.map((n) => n.user_id))];
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth")
    .in("user_id", userIds);

  const subsByUser = new Map<string, typeof subs>();
  for (const s of subs ?? []) {
    const arr = subsByUser.get(s.user_id) ?? [];
    arr.push(s);
    subsByUser.set(s.user_id, arr);
  }

  let sent = 0;
  const results: Array<Record<string, unknown>> = [];
  for (const n of notifs) {
    const userSubs = subsByUser.get(n.user_id) ?? [];
    for (const s of userSubs) {
      try {
        const subscriber = appServer.subscribe({
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        });
        await subscriber.pushTextMessage(
          JSON.stringify({ title: n.title, body: n.body ?? "", link: n.link ?? "/" }),
          {},
        );
        sent++;
        results.push({ sub: s.id, ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const status = (err as { response?: { status?: number } })?.response?.status;
        console.error("push failed", { sub: s.id, status, msg });
        results.push({ sub: s.id, ok: false, status, error: msg });
        // expired / gone subscription -> remove it
        if (msg.includes("404") || msg.includes("410") || status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    }
  }

  await admin.from("notifications").update({ push_sent: true }).in("id", notifs.map((n) => n.id));

  return new Response(JSON.stringify({ sent, notifications: notifs.length, results }), { headers: cors });
});
