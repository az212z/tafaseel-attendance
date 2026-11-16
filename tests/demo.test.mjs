import { beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temp = await mkdtemp(join(tmpdir(), "attendance-pages-test-"));
const storage = new Map();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    clear: () => storage.clear(),
  },
  configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: {},
  configurable: true,
});
globalThis.location = { origin: "https://az212z.github.io" };
let networkRequests = 0;
globalThis.fetch = async () => {
  networkRequests++;
  throw new Error("The Pages demo must never call a remote API");
};
await build({
  entryPoints: ["src/api.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: join(temp, "api.mjs"),
  define: {
    "import.meta.env": JSON.stringify({
      VITE_STATIC_DEMO: "1",
      BASE_URL: "/tafaseel-attendance/",
    }),
  },
});
const { request, appRoot } = await import(
  pathToFileURL(join(temp, "api.mjs")).href
);
beforeEach(() => {
  storage.clear();
  networkRequests = 0;
});
after(async () => {
  assert.equal(networkRequests, 0);
  await rm(temp, { recursive: true, force: true });
});

test("GitHub demo uses the repository base path and a separate demo login", async () => {
  assert.equal(appRoot, "https://az212z.github.io/tafaseel-attendance/");
  const session = await request("session");
  assert.equal(session.user, null);
  assert.equal(session.system.browser_demo, true);
  assert.equal(session.system.sms_ready, false);
  await assert.rejects(request("overview"), (e) => e.status === 401);
  await assert.rejects(
    request("login", { username: "admin", password: "not-a-real-password" }),
    (e) => e.status === 422,
  );
  await request("demo_login", {});
  assert.ok((await request("session")).user);
  assert.equal(networkRequests, 0);
});
test("new students and session rosters persist between requests", async () => {
  await request("demo_login", {});
  const start = new Date(Date.now() + 86400000),
    end = new Date(Date.now() + 93600000);
  const s = await request("create_session", {
    title: "حصة اختبار محلية",
    cohort_id: 1,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
  });
  const p = await request("add_student", {
    name: "طالب اختبار محلي",
    mobile: "٠٥١١١١١١١١",
    cohort_id: 1,
  });
  assert.equal(p.pin.length, 8);
  assert.equal(p.reference, "9");
  const students = await request("students");
  assert.equal(students.total, 9);
  assert.ok(students.items.some((row) => row.id === p.id));
  assert.ok(!JSON.stringify(students).includes(p.pin));
  const rows = await request("roster", undefined, { id: s.id });
  assert.equal(rows.items.length, 7);
  assert.ok(rows.items.some((row) => row.student_id === p.id));
  assert.equal((await request("overview")).students, 9);
  assert.equal(networkRequests, 0);
});
test("QR check-in supports Arabic references, keeps its timestamp, and refuses an early checkout", async () => {
  await request("session");
  const input = {
    token: "1".repeat(64),
    reference: "١",
    pin: "24681357",
    mode: "in",
  };
  await assert.rejects(
    request("check", { ...input, pin: "11111111" }),
    (e) => e.status === 401,
  );
  const first = await request("check", input);
  assert.equal(first.already, false);
  assert.equal(first.late, true);
  const second = await request("check", input);
  assert.equal(second.already, true);
  assert.equal(first.time, second.time);
  await assert.rejects(
    request("check", { ...input, mode: "out" }),
    (e) => e.status === 409,
  );
  const publicData = await request("public_session", undefined, {
    token: input.token,
  });
  assert.equal(publicData.session.title, "الحصة الأولى · تدريب ومراجعة");
  assert.equal(publicData.items, undefined);
});
test("absence records are explicitly simulations, with no delivery or provider reference", async () => {
  await request("demo_login", {});
  const first = await request("messages");
  assert.equal(first.items.length, 2);
  assert.ok(
    first.items.every(
      (m) =>
        m.status === "demo" &&
        m.reason === "demo_only" &&
        m.provider_id === null &&
        m.attempts === 0,
    ),
  );
  const again = await request("messages");
  assert.equal(again.items.length, 2);
  assert.equal(networkRequests, 0);
});
test("contact updates validate consent and stay in this browser", async () => {
  await request("demo_login", {});
  const student = (await request("students")).items[0];
  await assert.rejects(
    request("contact", {
      student_id: student.id,
      guardian: "ولي اختبار",
      guardian_mobile: "0522222222",
      consent: false,
    }),
    (e) => e.status === 422,
  );
  await request("contact", {
    student_id: student.id,
    guardian: "ولي اختبار",
    guardian_mobile: "0522222222",
    consent: true,
  });
  const saved = (await request("students")).items.find(
    (p) => p.id === student.id,
  );
  assert.equal(saved.guardian_mobile, "+966522222222");
  assert.equal(saved.guardian, "ولي اختبار");
  assert.equal(networkRequests, 0);
});
test("closed sessions refuse further QR check-ins", async () => {
  await request("demo_login", {});
  await request("close_session", { session_id: "1".repeat(32) });
  await assert.rejects(
    request("check", {
      token: "1".repeat(64),
      reference: "1",
      pin: "24681357",
      mode: "in",
    }),
    (e) => e.status === 409,
  );
});
