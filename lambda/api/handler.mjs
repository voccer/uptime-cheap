import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const SITES_TABLE = process.env.SITES_TABLE;
const BEATS_TABLE = process.env.BEATS_TABLE;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const ALLOWED_INTERVALS = new Set([1, 2, 5, 10, 15, 30, 60]);

const isAuthorized = event => {
  if (!ADMIN_TOKEN) return true;
  const auth = event.headers?.authorization ?? event.headers?.Authorization ?? "";
  return auth === `Bearer ${ADMIN_TOKEN}`;
};

const resp = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  },
  body: JSON.stringify(body),
});

const getSites = async () => {
  const { Items = [] } = await ddb.send(new ScanCommand({ TableName: SITES_TABLE }));
  Items.sort((a, b) => (a.name ?? "").toLowerCase().localeCompare((b.name ?? "").toLowerCase()));
  return resp(200, Items);
};

const createSite = async body => {
  let interval = Number(body.check_interval_minutes ?? 1);
  if (!ALLOWED_INTERVALS.has(interval)) interval = 1;
  const item = {
    site_id: randomUUID().slice(0, 8),
    name: body.name,
    url: body.url,
    status: "UP",
    consecutive_ok: 0,
    consecutive_fail: 0,
    paused: false,
    check_interval_minutes: interval,
    created_at: new Date().toISOString(),
  };
  if (body.slack_webhook && body.slack_webhook.trim()) {
    item.slack_webhook = body.slack_webhook.trim();
  }
  await ddb.send(new PutCommand({ TableName: SITES_TABLE, Item: item }));
  return resp(201, item);
};

const updateSite = async (siteId, body) => {
  const allowed = ["name", "url", "paused", "check_interval_minutes", "slack_webhook"];
  if (!allowed.some(k => k in body))
    return resp(400, { error: `Provide at least one of: ${allowed.join(", ")}` });

  const names = { "#sid": "site_id" };
  const vals  = { ":ua": new Date().toISOString() };
  const parts = ["updated_at = :ua"];

  if ("name" in body) {
    const name = (body.name ?? "").trim();
    if (!name) return resp(400, { error: "name must be non-empty" });
    names["#n"] = "name"; vals[":name"] = name; parts.push("#n = :name");
  }
  if ("url" in body) {
    const url = (body.url ?? "").trim();
    if (!url.startsWith("http://") && !url.startsWith("https://"))
      return resp(400, { error: "url must start with http:// or https://" });
    names["#u"] = "url"; vals[":url"] = url; parts.push("#u = :url");
  }
  if ("paused" in body) {
    names["#p"] = "paused"; vals[":paused"] = Boolean(body.paused); parts.push("#p = :paused");
  }
  if ("check_interval_minutes" in body) {
    const iv = Number(body.check_interval_minutes);
    if (!ALLOWED_INTERVALS.has(iv))
      return resp(400, { error: `check_interval_minutes must be one of ${[...ALLOWED_INTERVALS]}` });
    names["#ci"] = "check_interval_minutes"; vals[":ci"] = iv; parts.push("#ci = :ci");
  }
  if ("slack_webhook" in body) {
    const webhook = (body.slack_webhook ?? "").trim();
    if (webhook) {
      names["#sw"] = "slack_webhook"; vals[":sw"] = webhook; parts.push("#sw = :sw");
    } else {
      parts.push("REMOVE slack_webhook");
    }
  }

  try {
    const out = await ddb.send(new UpdateCommand({
      TableName: SITES_TABLE,
      Key: { site_id: siteId },
      UpdateExpression: "SET " + parts.join(", "),
      ExpressionAttributeValues: vals,
      ExpressionAttributeNames: names,
      ConditionExpression: "attribute_exists(#sid)",
      ReturnValues: "ALL_NEW",
    }));
    return resp(200, out.Attributes);
  } catch (e) {
    if (e.name === "ConditionalCheckFailedException") return resp(404, { error: "Site not found" });
    throw e;
  }
};

const deleteSite = async siteId => {
  // Delete site from sites table
  await ddb.send(new DeleteCommand({ TableName: SITES_TABLE, Key: { site_id: siteId } }));

  // Delete all beats for this site (with pagination)
  let totalDeleted = 0;
  let lastEvaluatedKey = undefined;
  do {
    const { Items: beats = [], LastEvaluatedKey } = await ddb.send(new QueryCommand({
      TableName: BEATS_TABLE,
      KeyConditionExpression: "site_id = :sid",
      ExpressionAttributeValues: { ":sid": siteId },
      ProjectionExpression: "site_id, timestamp",
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    if (beats.length > 0) {
      for (let i = 0; i < beats.length; i += 25) {
        const batch = beats.slice(i, i + 25);
        await ddb.send(new BatchWriteCommand({
          RequestItems: {
            [BEATS_TABLE]: batch.map(item => ({
              DeleteRequest: { Key: { site_id: item.site_id, timestamp: item.timestamp } },
            })),
          },
        }));
      }
      totalDeleted += beats.length;
    }
    lastEvaluatedKey = LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return resp(200, { deleted: siteId, beatsDeleted: totalDeleted });
};

const getBeats = async siteId => {
  const { Items = [] } = await ddb.send(new QueryCommand({
    TableName: BEATS_TABLE,
    KeyConditionExpression: "site_id = :sid",
    ExpressionAttributeValues: { ":sid": siteId },
    ScanIndexForward: false,
    Limit: 90,
  }));
  return resp(200, Items.reverse());
};

export const lambda_handler = async event => {
  const method = event.requestContext?.http?.method ?? "GET";
  const path   = event.rawPath ?? "/";

  if (method === "OPTIONS") return resp(200, {});

  try {
    // Public routes
    if (path === "/sites" && method === "GET") return getSites();
    if (path.startsWith("/sites/") && path.endsWith("/beats") && method === "GET")
      return getBeats(path.split("/")[2]);

    // Auth endpoint
    if (path === "/auth" && method === "POST") {
      const { token } = JSON.parse(event.body || "{}");
      if (ADMIN_TOKEN && token === ADMIN_TOKEN) return resp(200, { ok: true });
      return resp(401, { error: "Invalid token" });
    }

    // Protected routes
    if (!isAuthorized(event)) return resp(401, { error: "Unauthorized" });

    if (path === "/sites" && method === "POST")
      return createSite(JSON.parse(event.body || "{}"));
    if (path.startsWith("/sites/") && method === "PATCH")
      return updateSite(path.split("/")[2], JSON.parse(event.body || "{}"));
    if (path.startsWith("/sites/") && method === "DELETE")
      return deleteSite(path.split("/")[2]);

    return resp(404, { error: "Not found" });
  } catch (e) {
    return resp(500, { error: e.message });
  }
};
