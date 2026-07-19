import { supabase } from "./supabase";
import { VAPID_PUBLIC_KEY } from "./config";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  } catch {
    return null;
  }
}

/** Ask for permission, subscribe, and store the subscription for the current user. */
export async function enablePush(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: "הדפדפן לא תומך בהתראות דחיפה" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, error: "ההרשאה להתראות נדחתה" };

  const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
  });

  const json = sub.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint!,
      p256dh: json.keys!.p256dh,
      auth: json.keys!.auth,
      user_agent: navigator.userAgent,
    },
    { onConflict: "endpoint" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function disablePush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
}

export async function pushEnabled(): Promise<boolean> {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}
