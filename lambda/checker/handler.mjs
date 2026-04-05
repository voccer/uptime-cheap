import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const SITES_TABLE = process.env.SITES_TABLE;
const BEATS_TABLE = process.env.BEATS_TABLE;
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL || "";

const sleep = ms => new Promise(r => setTimeout(r, ms));

const shouldCheck = (site, now) => {
  if (site.paused) return false;
  const interval = Number(site.check_interval_minutes ?? 1);
  if (interval <= 1) return true;
  if (!site.last_checked_at) return true;
  return (now - new Date(site.last_checked_at)) / 1000 >= interval * 60;
};

const doHttpCheck = async url => {
  const start = Date.now();
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10_000) });
    return { ok: res.status < 400, latency: Date.now() - start, statusCode: res.status };
  } catch {
    return { ok: false, latency: null, statusCode: 0 };
  }
};

const saveBeat = async (siteId, ok, latency, statusCode) => {
  const now = new Date();
  const item = {
    site_id: siteId,
    timestamp: now.toISOString(),
    ok,
    status_code: statusCode,
    ttl: Math.floor(now / 1000) + (Number(process.env.BEATS_TTL_SECONDS) || 18000),
  };
  if (latency != null) item.latency_ms = latency;
  await ddb.send(new PutCommand({ TableName: BEATS_TABLE, Item: item }));
};

const notifySlack = async (site, status) => {
  const webhook = site.slack_webhook || SLACK_WEBHOOK;
  if (!webhook) return;
  const isDown = status === "DOWN";
  const dashboardUrl = process.env.DASHBOARD_URL || "";
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `${isDown ? "🔴" : "✅"} *<${site.url}|${site.name}>* is *${status}* | <${dashboardUrl}|[Status]>`,
      }),
    });
  } catch {}
};

const updateState = async (site, ok) => {
  const currentStatus = site.status ?? "UP";
  const consecOk   = Math.min(ok ? Number(site.consecutive_ok ?? 0) + 1 : 0, 10);
  const consecFail = Math.min(ok ? 0 : Number(site.consecutive_fail ?? 0) + 1, 10);

  let newStatus = currentStatus;
  if (consecFail >= 2 && currentStatus !== "DOWN") { newStatus = "DOWN"; notifySlack(site, "DOWN"); }
  else if (consecOk >= 2 && currentStatus !== "UP") { newStatus = "UP";  notifySlack(site, "UP"); }

  const now = new Date().toISOString();
  let expr = "SET consecutive_ok = :ok, consecutive_fail = :fail, #st = :status, last_checked_at = :lca";
  const vals = { ":ok": consecOk, ":fail": consecFail, ":status": newStatus, ":lca": now };
  if (newStatus !== currentStatus) { expr += ", last_changed_at = :changed"; vals[":changed"] = now; }

  try {
    await ddb.send(new UpdateCommand({
      TableName: SITES_TABLE,
      Key: { site_id: site.site_id },
      UpdateExpression: expr,
      ExpressionAttributeValues: vals,
      ExpressionAttributeNames: { "#st": "status" },
      ConditionExpression: "attribute_exists(site_id)",
    }));
  } catch (e) {
    if (e.name === "ConditionalCheckFailedException") return;  // site was deleted, skip
    throw e;
  }

  site.status = newStatus;
  site.consecutive_ok = consecOk;
  site.consecutive_fail = consecFail;
};

const checkSite = async site => {
  const { ok, latency, statusCode } = await doHttpCheck(site.url);
  await saveBeat(site.site_id, ok, latency, statusCode);
  await updateState(site, ok);
};

export const lambda_handler = async () => {
  const { Items: sites = [] } = await ddb.send(new ScanCommand({ TableName: SITES_TABLE }));
  if (!sites.length) return;

  const now = new Date();
  const active = sites.filter(s => shouldCheck(s, now));
  if (!active.length) return;

  for (let round = 0; round < 3; round++) {
    if (round > 0) await sleep(20_000);
    for (const site of active) await checkSite(site);
  }
};
