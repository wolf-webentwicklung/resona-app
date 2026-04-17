import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:contact@resona-app.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PUSH_MESSAGES: Record<string, { title: string; body: string }> = {
  trace: { title: "Resona", body: "something is here for you" },
  nudge: { title: "Resona", body: "someone is waiting for you" },
  still_here: { title: "Resona", body: "your person is here" },
  turn_reminder: { title: "Resona", body: "it's your turn" },
  proposal: { title: "Resona", body: "your person sent you something" },
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401, headers: CORS_HEADERS });
  }

  // Authenticate caller
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) {
    return new Response("Unauthorized", { status: 401, headers: CORS_HEADERS });
  }

  let event_type: string, pair_id: string;
  try {
    const body = await req.json();
    event_type = body.event_type;
    pair_id = body.pair_id;
  } catch {
    return new Response("Invalid JSON body", { status: 400, headers: CORS_HEADERS });
  }
  if (!event_type || !pair_id) {
    return new Response("Missing event_type or pair_id", { status: 400, headers: CORS_HEADERS });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Resolve partner ID
  const { data: pair } = await supabaseAdmin
    .from("pairs")
    .select("user_a_id, user_b_id")
    .eq("id", pair_id)
    .single();

  if (!pair) {
    return new Response("Pair not found", { status: 404, headers: CORS_HEADERS });
  }

  const partnerId = pair.user_a_id === user.id ? pair.user_b_id : pair.user_a_id;

  // Get partner push subscription
  const { data: partnerRow } = await supabaseAdmin
    .from("users")
    .select("push_token")
    .eq("id", partnerId)
    .single();

  if (!partnerRow?.push_token) {
    return new Response(JSON.stringify({ ok: true, skipped: "no_subscription" }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let subscription;
  try {
    subscription = JSON.parse(partnerRow.push_token);
  } catch {
    return new Response(JSON.stringify({ ok: true, skipped: "invalid_subscription" }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const msg = PUSH_MESSAGES[event_type] || { title: "Resona", body: "something happened" };
  const payload = JSON.stringify({
    title: msg.title,
    body: msg.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: event_type,
  });

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  try {
    await webpush.sendNotification(subscription, payload);
  } catch (err: unknown) {
    // 410 Gone = subscription expired — clean it up
    if (err && typeof err === "object" && "statusCode" in err && (err as { statusCode: number }).statusCode === 410) {
      await supabaseAdmin.from("users").update({ push_token: null }).eq("id", partnerId);
    }
    console.error("Push send error:", err);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
