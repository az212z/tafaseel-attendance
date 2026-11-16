export type User = { id: string; name: string };
export type System = {
  preview: boolean;
  browser_demo?: boolean;
  sms_ready: boolean;
  sms_provider: string;
  last_cron: string | null;
  clock: string;
  absence_minutes: number;
  origin: string;
};
export type Session = {
  id: string;
  title: string;
  cohort_id: number;
  course_title: string;
  cohort_number: number;
  starts_at: string;
  ends_at: string;
  token: string;
  status: string;
  total: number;
  present: number;
  late: number;
  excused: number;
};
export type Student = {
  id: string;
  name: string;
  mobile: string;
  guardian: string;
  guardian_mobile: string;
  sms_consent_at: string | null;
  has_pin: number;
  refs: string | null;
  registrations: number;
};
export type Cohort = {
  id: number;
  number: number;
  title: string;
  status: string;
  students: number;
  course_slug: string;
};
export type RosterRow = {
  student_id: string;
  name: string;
  mobile: string;
  guardian: string;
  guardian_mobile: string;
  reference: string;
  checked_in: string | null;
  checked_out: string | null;
  excused: number;
  has_pin: number;
  registration_status: string;
  message_status: string | null;
  note: string;
};
export type Message = {
  id: string;
  name: string;
  title: string;
  status: string;
  reason: string;
  provider_id: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  recipient: string;
  body: string;
};
let csrf = "";
export const browserDemo = import.meta.env.VITE_STATIC_DEMO === "1";
export const appRoot = `${location.origin}${import.meta.env.BASE_URL}`;
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request<T>(
  action: string,
  data?: Record<string, unknown>,
  params: Record<string, string | number> = {},
): Promise<T> {
  if (browserDemo) {
    const { demoRequest } = await import("./demo");
    return demoRequest(action, data, params) as Promise<T>;
  }
  const query = new URLSearchParams({
    action,
    ...Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ),
  });
  const response = await fetch(`/api/?${query}`, {
    method: data ? "POST" : "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("تعذّر الاتصال بخدمة الحضور. حاول مجددًا.");
  }
  if (result.csrf) csrf = result.csrf;
  if (!response.ok) {
    if (response.status === 401 && action !== "login" && action !== "check")
      window.dispatchEvent(new Event("attendance:unauthorized"));
    throw new ApiError(result.error || "تعذّر إتمام العملية.", response.status);
  }
  return result;
}
export const stamp = (s: string) =>
  new Date(
    s.replace(" ", "T") +
      (s.endsWith("Z") || /\+\d\d:\d\d$/.test(s) ? "" : "Z"),
  );
export const time = (s?: string | null) =>
  s
    ? stamp(s).toLocaleTimeString("ar-SA", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Riyadh",
      })
    : "—";
export const date = (s: string) =>
  stamp(s).toLocaleDateString("ar-SA", {
    calendar: "gregory",
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Riyadh",
  });
export const num = (v: number) => Number(v || 0).toLocaleString("ar-SA");
export function phase(s: Session, clock = Date.now()) {
  return s.status !== "open"
    ? "closed"
    : clock < stamp(s.starts_at).getTime()
      ? "upcoming"
      : clock > stamp(s.ends_at).getTime()
        ? "ended"
        : "live";
}
export const phaseLabel = {
  closed: "مغلقة",
  upcoming: "قادمة",
  ended: "انتهت",
  live: "جارية الآن",
};
export const messageLabel: Record<string, string> = {
  demo: "محاكاة فقط",
  pending: "بانتظار الإرسال",
  blocked: "يتطلب استكمالًا",
  sending: "جارٍ الإرسال",
  submitted: "قبله المزوّد",
  failed: "رفضه المزوّد",
  unknown: "تحتاج مراجعة",
  cancelled: "أُلغي التنبيه",
  expired: "انتهت المهلة",
};
export const reasonLabel: Record<string, string> = {
  demo_only: "تنبيه تجريبي في المتصفح؛ لم تُرسل رسالة SMS",
  missing_guardian: "أضف رقم ولي الأمر",
  missing_consent: "موافقة ولي الأمر غير مسجلة",
  sms_disabled: "خدمة SMS غير مفعّلة",
  provider_rejected: "تحقق من حساب الرسائل واسم المرسل",
  connection_uncertain: "نتيجة الاتصال غير مؤكدة؛ راجع سجل المزوّد",
  provider_response_uncertain: "استجابة غير مؤكدة؛ راجع سجل المزوّد",
  worker_interrupted: "انقطع تشغيل المهمة؛ راجع سجل المزوّد",
  attendance_recorded: "تم تسجيل الحضور",
  admin_updated: "حدّثت الإدارة حالة الطالب",
  no_longer_eligible: "تغيرت حالة الطالب أو انتهت الحصة",
  session_closed: "أُغلقت الحصة",
};
