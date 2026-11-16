// Browser-only fixtures for GitHub Pages. Never connects to the center or an SMS provider.
import {
  ApiError,
  stamp,
  type Cohort,
  type Message,
  type RosterRow,
  type Session,
  type Student,
} from "./api";
import catalog from "./data/demo-courses.json";

type DemoStudent = Student & {
  cohort_id: number;
  reference: string;
  registration_status: string;
  pin: string;
};
type Model = {
  version: 1;
  loggedIn: boolean;
  sequence: number;
  students: DemoStudent[];
  cohorts: Cohort[];
  sessions: Session[];
  rosters: Record<string, RosterRow[]>;
  messages: Message[];
};
const storageKey = "tafaseel-attendance-pages-v1";
const uid = () => crypto.randomUUID().replaceAll("-", "");
const clock = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const shifted = (minutes: number) =>
  new Date(Date.now() + minutes * 60000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
const western = (s: string) =>
  s.replace(/[٠-٩۰-۹]/g, (c) =>
    String(
      "٠١٢٣٤٥٦٧٨٩".indexOf(c) >= 0
        ? "٠١٢٣٤٥٦٧٨٩".indexOf(c)
        : "۰۱۲۳۴۵۶۷۸۹".indexOf(c),
    ),
  );
function fail(status: number, message: string): never {
  throw new ApiError(message, status);
}
function text(value: unknown, label: string, max = 120, required = false) {
  const s = typeof value === "string" ? value.trim() : "";
  if (s.length > max || (required && s.length < 2))
    fail(422, `تحقق من ${label}.`);
  return s;
}
function phone(value: unknown) {
  const v = western(String(value ?? "")).replace(/[\s()\-]/g, "");
  if (/^05\d{8}$/.test(v)) return "+966" + v.slice(1);
  if (/^(?:\+?966|00966)5\d{8}$/.test(v)) return "+966" + v.slice(-9);
  return fail(422, "أدخل رقم جوال سعودي صحيحًا.");
}
function pin() {
  const numbers = new Uint32Array(1);
  crypto.getRandomValues(numbers);
  return String(10000000 + (numbers[0] % 90000000));
}
function roster(student: DemoStudent): RosterRow {
  return {
    student_id: student.id,
    name: student.name,
    mobile: student.mobile,
    guardian: student.guardian,
    guardian_mobile: student.guardian_mobile,
    reference: student.reference,
    checked_in: null,
    checked_out: null,
    excused: 0,
    has_pin: 1,
    registration_status: student.registration_status,
    message_status: null,
    note: "",
  };
}
function seed(): Model {
  const cohorts: Cohort[] = catalog.courses.map((c, i) => ({
    id: i + 1,
    number: 1,
    title: c.title,
    status: "collecting",
    students: i === 0 ? 6 : i === 1 ? 2 : 0,
    course_slug: c.slug,
  }));
  const names = [
    "أحمد",
    "عمر",
    "محمد",
    "خالد",
    "يوسف",
    "عبدالرحمن",
    "فهد",
    "زياد",
  ];
  const students: DemoStudent[] = names.map((name, i) => ({
    id: uid(),
    name: "طالب تجريبي " + name,
    mobile: "+966500000000",
    guardian: "ولي أمر تجريبي",
    guardian_mobile: "+966500000000",
    sms_consent_at: clock(),
    has_pin: 1,
    refs: String(i + 1),
    registrations: 1,
    cohort_id: i < 6 ? 1 : 2,
    reference: String(i + 1),
    registration_status: "registered",
    pin: "24681357",
  }));
  const sessions: Session[] = [
    {
      id: "1".repeat(32),
      title: "الحصة الأولى · تدريب ومراجعة",
      cohort_id: 1,
      course_title: cohorts[0].title,
      cohort_number: 1,
      starts_at: shifted(-25),
      ends_at: shifted(95),
      token: "1".repeat(64),
      status: "open",
      total: 6,
      present: 4,
      late: 0,
      excused: 0,
    },
    {
      id: "2".repeat(32),
      title: "الحصة الأولى · تأسيس",
      cohort_id: 2,
      course_title: cohorts[1].title,
      cohort_number: 1,
      starts_at: shifted(180),
      ends_at: shifted(300),
      token: "2".repeat(64),
      status: "open",
      total: 2,
      present: 0,
      late: 0,
      excused: 0,
    },
  ];
  const rosters: Record<string, RosterRow[]> = {};
  for (const s of sessions) {
    rosters[s.id] = students
      .filter((p) => p.cohort_id === s.cohort_id)
      .map(roster);
  }
  for (const row of rosters[sessions[0].id].slice(2))
    row.checked_in = shifted(-20);
  return {
    version: 1,
    loggedIn: false,
    sequence: 8,
    students,
    cohorts,
    sessions,
    rosters,
    messages: [],
  };
}
function load(): Model {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const model = JSON.parse(raw);
      if (model.version === 1) return model;
    }
  } catch {
    fail(
      503,
      "تعذّر قراءة بيانات التجربة. فعّل التخزين في المتصفح أو أعد بيانات التجربة.",
    );
  }
  return seed();
}
function save(m: Model) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(m));
  } catch {
    fail(503, "تعذّر حفظ بيانات التجربة في المتصفح. تأكد من إتاحة التخزين.");
  }
}
function system() {
  return {
    preview: true,
    browser_demo: true,
    sms_ready: false,
    sms_provider: "محاكاة محلية",
    last_cron: null,
    clock: clock(),
    absence_minutes: 20,
    origin: location.origin,
  };
}
function getSession(m: Model, id: string) {
  return (
    m.sessions.find((s) => s.id === id) ??
    fail(404, "الحصة غير موجودة في بيانات هذا المتصفح.")
  );
}
function publicSession(m: Model, token: string) {
  const s =
    m.sessions.find((s) => s.token === token) ??
    fail(
      404,
      "رمز الحصة غير موجود في هذا المتصفح. افتح صفحة الطالب من نسخة الاختبار التي أنشأت الحصة.",
    );
  return {
    id: s.id,
    title: s.title,
    starts_at: s.starts_at,
    ends_at: s.ends_at,
    status: s.status,
  };
}
function joinRows(m: Model, s: Session) {
  return (m.rosters[s.id] ?? []).map((r) => {
    const p = m.students.find((p) => p.id === r.student_id);
    return {
      ...r,
      name: p?.name ?? r.name,
      guardian: p?.guardian ?? "",
      guardian_mobile: p?.guardian_mobile ?? "",
      has_pin: p?.has_pin ?? 0,
      message_status:
        m.messages.find(
          (msg) =>
            (msg as Message & { session_id?: string; student_id?: string })
              .session_id === s.id &&
            (msg as Message & { student_id?: string }).student_id ===
              r.student_id,
        )?.status ?? null,
    };
  });
}
function sessionSummary(m: Model) {
  return m.sessions
    .map((s) => {
      const rs = m.rosters[s.id] ?? [];
      return {
        ...s,
        total: rs.length,
        present: rs.filter((r) => r.checked_in).length,
        late: rs.filter(
          (r) =>
            r.checked_in &&
            stamp(r.checked_in).getTime() >=
              stamp(s.starts_at).getTime() + 1200000,
        ).length,
        excused: rs.filter((r) => r.excused).length,
      };
    })
    .sort(
      (a, b) => stamp(b.starts_at).getTime() - stamp(a.starts_at).getTime(),
    );
}
function cancelUnsent(m: Model, sid: string, pid?: string) {
  for (const msg of m.messages as (Message & {
    session_id: string;
    student_id: string;
  })[]) {
    if (
      msg.session_id === sid &&
      (!pid || msg.student_id === pid) &&
      ["pending", "blocked"].includes(msg.status)
    ) {
      msg.status = "cancelled";
      msg.reason = "attendance_recorded";
      msg.updated_at = clock();
    }
  }
}
function queue(m: Model) {
  for (const s of m.sessions) {
    if (s.status !== "open") continue;
    const now = Date.now();
    if (
      now < stamp(s.starts_at).getTime() + 1200000 ||
      now > stamp(s.ends_at).getTime()
    )
      continue;
    for (const r of m.rosters[s.id] ?? []) {
      if (r.checked_in || r.excused || r.registration_status !== "registered")
        continue;
      const p = m.students.find((p) => p.id === r.student_id);
      if (!p) continue;
      const existing = (
        m.messages as (Message & { session_id: string; student_id: string })[]
      ).find((msg) => msg.session_id === s.id && msg.student_id === p.id);
      if (existing && existing.status !== "blocked") continue;
      const reason = !p.guardian_mobile
        ? "missing_guardian"
        : !p.sms_consent_at
          ? "missing_consent"
          : "demo_only";
      const message: Message & { session_id: string; student_id: string } = {
        id: existing?.id ?? uid(),
        session_id: s.id,
        student_id: p.id,
        name: p.name,
        title: s.title,
        status: reason === "demo_only" ? "demo" : "blocked",
        reason,
        provider_id: null,
        attempts: 0,
        created_at: existing?.created_at ?? clock(),
        updated_at: clock(),
        recipient: p.guardian_mobile,
        body: `محاكاة فقط: لم يسجل الطالب ${p.name} حضوره لحصة «${s.title}» بعد مرور ٢٠ دقيقة على بدايتها. لم تُرسل رسالة فعلية.`,
      };
      if (existing) Object.assign(existing, message);
      else m.messages.push(message);
    }
  }
}
function handle(
  m: Model,
  action: string,
  d: Record<string, unknown>,
  params: Record<string, string | number>,
): unknown {
  if (action === "session")
    return {
      user: m.loggedIn ? { id: "demo-admin", name: "مدير التجربة" } : null,
      csrf: "local-demo-only",
      system: system(),
    };
  if (action === "public_session")
    return { session: publicSession(m, String(params.token)), clock: clock() };
  if (action === "login")
    return fail(
      422,
      "هذه نسخة GitHub للتجربة. استخدم زر «دخول النسخة التجريبية».",
    );
  if (action === "demo_login") {
    m.loggedIn = true;
    return {
      user: { id: "demo-admin", name: "مدير التجربة" },
      csrf: "local-demo-only",
    };
  }
  if (action === "check") {
    const s =
      m.sessions.find((s) => s.token === d.token) ??
      fail(404, "رمز الحصة غير موجود في هذا المتصفح.");
    if (s.status !== "open") fail(409, "أُغلق تسجيل الحضور لهذه الحصة.");
    const now = Date.now(),
      start = stamp(s.starts_at).getTime(),
      end = stamp(s.ends_at).getTime();
    if (now < start - 900000 || now > end + 1800000)
      fail(409, "الرمز متاح من ١٥ دقيقة قبل الحصة وحتى ٣٠ دقيقة بعد نهايتها.");
    if (d.mode !== "in" && d.mode !== "out")
      fail(422, "حدد الحضور أو الانصراف.");
    if (d.mode === "out" && now < end - 900000)
      fail(409, "يفتح تسجيل الانصراف قبل نهاية الحصة بـ١٥ دقيقة.");
    const reference = western(String(d.reference ?? "")).trim();
    const p = m.students.find(
      (p) =>
        p.reference === reference && p.pin === western(String(d.pin ?? "")),
    );
    const r = (m.rosters[s.id] ?? []).find(
      (r) => r.student_id === p?.id && r.registration_status === "registered",
    );
    if (!p || !r) fail(401, "تحقق من رقم التسجيل ورمز الطالب لهذه الحصة.");
    if (r.excused) fail(409, "يوجد عذر مسجل لهذه الحصة. راجع الإدارة.");
    if (d.mode === "out" && !r.checked_in)
      fail(409, "سجّل حضورك أولًا قبل تسجيل الانصراف.");
    const key = d.mode === "in" ? "checked_in" : "checked_out",
      already = !!r[key];
    if (!already) {
      r[key] = clock();
      if (d.mode === "in") cancelUnsent(m, s.id, r.student_id);
    }
    return {
      ok: true,
      already,
      mode: d.mode,
      time: r[key],
      late: d.mode === "in" && stamp(r[key]!).getTime() >= start + 1200000,
    };
  }
  if (!m.loggedIn) fail(401, "سجّل دخول النسخة التجريبية للمتابعة.");
  if (action === "logout") {
    m.loggedIn = false;
    return { ok: true };
  }
  if (action === "reset_demo") return { reset: true };
  if (action === "system") return system();
  if (action === "overview")
    return {
      sessions: sessionSummary(m),
      students: m.students.length,
      courses: m.cohorts.length,
      system: system(),
    };
  if (action === "courses")
    return {
      items: m.cohorts.map((g) => ({
        ...g,
        students: m.students.filter(
          (p) => p.cohort_id === g.id && p.registration_status === "registered",
        ).length,
      })),
    };
  if (action === "students") {
    const q = String(params.q ?? "").trim(),
      offset = Math.max(0, Number(params.offset) || 0);
    const items = m.students
      .filter((p) => (p.name + " " + p.mobile + " " + p.guardian).includes(q))
      .slice()
      .reverse()
      .map(({ pin: _, ...p }) => p);
    return { items: items.slice(offset, offset + 50), total: items.length };
  }
  if (action === "roster") {
    const s = getSession(m, String(params.id));
    return { session: s, items: joinRows(m, s) };
  }
  if (action === "messages")
    return { items: [...m.messages].reverse(), system: system() };
  if (action === "create_session") {
    const title = text(d.title, "اسم الحصة", 120, true),
      g =
        m.cohorts.find((g) => g.id === Number(d.cohort_id)) ??
        fail(422, "اختر المجموعة.");
    const start = new Date(String(d.starts_at)),
      end = new Date(String(d.ends_at)),
      duration = end.getTime() - start.getTime();
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      duration < 1260000 ||
      duration > 43200000
    )
      fail(422, "مدة الحصة يجب أن تكون بين ٢١ دقيقة و١٢ ساعة.");
    if (start.getTime() < Date.now() - 60000)
      fail(422, "اختر موعدًا قادمًا للحصة.");
    if (
      m.sessions.some(
        (s) =>
          s.cohort_id === g.id &&
          s.status === "open" &&
          stamp(s.starts_at) < end &&
          stamp(s.ends_at) > start,
      )
    )
      fail(409, "توجد حصة متداخلة لهذه المجموعة.");
    const pupils = m.students.filter(
      (p) => p.cohort_id === g.id && p.registration_status === "registered",
    );
    if (!pupils.length)
      fail(422, "لا يوجد طلاب في هذه المجموعة. أضف الطلاب أولًا.");
    const id = uid();
    m.sessions.push({
      id,
      title,
      cohort_id: g.id,
      course_title: g.title,
      cohort_number: g.number,
      starts_at: start.toISOString().slice(0, 19).replace("T", " "),
      ends_at: end.toISOString().slice(0, 19).replace("T", " "),
      token: uid() + uid(),
      status: "open",
      total: pupils.length,
      present: 0,
      late: 0,
      excused: 0,
    });
    m.rosters[id] = pupils.map(roster);
    return { id };
  }
  if (action === "add_student") {
    const name = text(d.name, "اسم الطالب", 100, true),
      mobile = phone(d.mobile),
      guardian = text(d.guardian, "اسم ولي الأمر", 100),
      guardianMobile = d.guardian_mobile ? phone(d.guardian_mobile) : "";
    if (guardianMobile && d.consent !== true)
      fail(422, "أكد موافقة ولي الأمر على الإشعارات.");
    if (m.students.some((s) => s.name === name && s.mobile === mobile))
      fail(409, "هذا الطالب موجود بالفعل.");
    const cohortId = Number(d.cohort_id) || 0;
    if (cohortId && !m.cohorts.some((g) => g.id === cohortId))
      fail(422, "اختر مجموعة صحيحة.");
    const reference = cohortId ? String(++m.sequence) : "",
      status = cohortId
        ? m.students.filter(
            (p) =>
              p.cohort_id === cohortId &&
              p.registration_status === "registered",
          ).length >= 20
          ? "waitlist"
          : "registered"
        : "";
    const student: DemoStudent = {
      id: uid(),
      name,
      mobile,
      guardian,
      guardian_mobile: guardianMobile,
      sms_consent_at: guardianMobile ? clock() : null,
      has_pin: 1,
      refs: status === "registered" ? reference : null,
      registrations: status === "registered" ? 1 : 0,
      cohort_id: cohortId,
      reference,
      registration_status: status,
      pin: pin(),
    };
    m.students.push(student);
    if (status === "registered")
      for (const s of m.sessions)
        if (
          s.cohort_id === cohortId &&
          s.status === "open" &&
          stamp(s.starts_at).getTime() > Date.now()
        )
          m.rosters[s.id].push(roster(student));
    return {
      id: student.id,
      pin: student.pin,
      reference: reference || null,
      status: status || null,
    };
  }
  if (action === "contact" || action === "reset_pin") {
    const p =
      m.students.find((p) => p.id === d.student_id) ??
      fail(404, "الطالب غير موجود.");
    if (action === "reset_pin") {
      p.pin = pin();
      p.has_pin = 1;
      return { pin: p.pin };
    }
    const value = d.guardian_mobile ? phone(d.guardian_mobile) : "";
    if (value && d.consent !== true)
      fail(422, "أكد موافقة ولي الأمر على الإشعارات.");
    p.guardian = text(d.guardian, "اسم ولي الأمر", 100);
    p.guardian_mobile = value;
    p.sms_consent_at = value ? clock() : null;
    return { ok: true };
  }
  if (action === "sync_roster") {
    const s = getSession(m, String(d.session_id));
    if (s.status !== "open" || stamp(s.starts_at).getTime() <= Date.now())
      fail(409, "يمكن تحديث القائمة قبل بداية الحصة فقط.");
    m.rosters[s.id] = m.students
      .filter(
        (p) =>
          p.cohort_id === s.cohort_id && p.registration_status === "registered",
      )
      .map(roster);
    return { ok: true };
  }
  if (action === "close_session") {
    const s = getSession(m, String(d.session_id));
    s.status = "closed";
    cancelUnsent(m, s.id);
    return { ok: true };
  }
  if (action === "mark") {
    const s = getSession(m, String(d.session_id)),
      r =
        (m.rosters[s.id] ?? []).find((r) => r.student_id === d.student_id) ??
        fail(404, "الطالب غير موجود في الحصة.");
    if (stamp(s.starts_at).getTime() > Date.now())
      fail(409, "لم تبدأ الحصة بعد.");
    const note = text(d.note, "سبب التحديث", 300, true);
    if (d.mode === "excused") {
      if (r.checked_in) fail(409, "الطالب مسجل حاضرًا.");
      r.excused = 1;
    } else if (d.mode === "out") {
      if (!r.checked_in) fail(409, "سجّل حضور الطالب أولًا.");
      r.checked_out ??= clock();
    } else if (d.mode === "in") {
      r.checked_in ??= clock();
      r.excused = 0;
    } else fail(422, "اختر حالة صحيحة.");
    r.note = note;
    cancelUnsent(m, s.id, r.student_id);
    return { ok: true };
  }
  return fail(404, "العملية غير متاحة في نسخة التجربة.");
}
export async function demoRequest(
  action: string,
  data: Record<string, unknown> = {},
  params: Record<string, string | number> = {},
): Promise<unknown> {
  const execute = () => {
    const model = load();
    queue(model);
    const result = handle(model, action, data, params);
    if (action === "reset_demo") {
      const fresh = seed();
      fresh.loggedIn = true;
      save(fresh);
    } else save(model);
    return result;
  };
  return navigator.locks
    ? navigator.locks.request(storageKey, execute)
    : execute();
}
