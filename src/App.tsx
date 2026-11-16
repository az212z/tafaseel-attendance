import {
  useEffect,
  useRef,
  useState,
  useId,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowSquareOut,
  CalendarBlank,
  Check,
  CheckCircle,
  Clock,
  Download,
  House,
  Info,
  Plus,
  QrCode,
  SignOut,
  SpinnerGap,
  Student as StudentIcon,
  Users,
  WarningCircle,
  X,
  ChatText,
  GearSix,
  MagnifyingGlass,
  ArrowsClockwise,
  Printer,
  LockKey,
  ClipboardText,
  ChalkboardTeacher,
} from "@phosphor-icons/react";
import QRCode from "qrcode";
import {
  request,
  appRoot,
  browserDemo,
  stamp,
  time,
  date,
  num,
  phase,
  phaseLabel,
  messageLabel,
  reasonLabel,
  type User,
  type System,
  type Session,
  type Student,
  type Cohort,
  type RosterRow,
  type Message,
} from "./api";

type View = "overview" | "sessions" | "students" | "messages" | "settings";
type Overview = {
  sessions: Session[];
  students: number;
  courses: number;
  system: System;
};
const western = (s: string) =>
  s.replace(/[٠-٩۰-۹]/g, (c) =>
    String(
      "٠١٢٣٤٥٦٧٨٩".indexOf(c) >= 0
        ? "٠١٢٣٤٥٦٧٨٩".indexOf(c)
        : "۰۱۲۳۴۵۶۷۸۹".indexOf(c),
    ),
  );
const future = (minutes: number) =>
  new Date(Date.now() + (minutes + 180) * 60000).toISOString().slice(0, 16);
function useData<T>(
  action: string,
  version = 0,
  params: Record<string, string | number> = {},
) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const key = JSON.stringify(params);
  useEffect(() => {
    let active = true;
    setLoading(true);
    request<T>(action, undefined, JSON.parse(key))
      .then((v) => {
        if (active) {
          setData(v);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [action, version, key]);
  return { data, error, loading };
}
function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="alert error">
      <WarningCircle size={21} />
      <span>{children}</span>
    </div>
  );
}
function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <ClipboardText size={42} weight="duotone" />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Loading() {
  return (
    <div role="status" className="loading">
      <SpinnerGap className="spin" size={22} /> جارٍ تحميل البيانات…
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <div className="logo-wrap">
        <img
          src={`${import.meta.env.BASE_URL}brand/logo.webp`}
          alt="شعار مركز تفاصيل للتدريب"
        />
      </div>
      <div>
        <strong>حضور تفاصيل</strong>
        <span>مركز تفاصيل للتدريب</span>
      </div>
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const body = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll("[role=dialog]");
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = body;
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button
            className="icon-button"
            aria-label="إغلاق النافذة"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
function QR({ value, size = 224 }: { value: string; size?: number }) {
  const [src, setSrc] = useState(""),
    [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#203d4c", light: "#ffffff" },
    })
      .then((s) => {
        if (active) {
          setSrc(s);
          setError(false);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [value, size]);
  return error ? (
    <ErrorBox>تعذّر توليد الرمز. حدّث الصفحة.</ErrorBox>
  ) : src ? (
    <img
      width={size}
      height={size}
      src={src}
      className="qr-image"
      alt="رمز QR لفتح تسجيل الحضور لهذه الحصة"
    />
  ) : (
    <div style={{ width: size, height: size }} className="loading">
      <SpinnerGap className="spin" />
    </div>
  );
}
function Login({
  system,
  onLogin,
  error: initialError,
}: {
  system: System | null;
  onLogin: (user: User) => void;
  error: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(initialError);
  async function login(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = e ? new FormData(e.currentTarget) : null;
      const r = await request<{ user: User }>(
        f ? "login" : "demo_login",
        f ? { username: f.get("username"), password: f.get("password") } : {},
      );
      onLogin(r.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <Brand />
        <div>
          <div className="login-symbol">
            <QrCode size={78} weight="thin" />
          </div>
          <h1>
            من أول حضور،
            <br />
            إلى آخر انصراف.
          </h1>
          <p>
            متابعة يومية لطلاب مركز تفاصيل.
            <br />
            حصص واضحة، وسجل حضور في مكان واحد.
          </p>
        </div>
        <span className="story-foot">
          <CheckCircle size={20} />{" "}
          {system?.preview
            ? "تجربة محلية ببيانات توضيحية"
            : "متصل ببيانات الدورات والطلاب في المركز"}
        </span>
      </section>
      <section className="login-form">
        <div className="login-card">
          <span className="section-mark">
            <LockKey size={22} /> إدارة الحضور والانصراف
          </span>
          <h2>أهلًا بمدير المركز</h2>
          <p>
            {browserDemo
              ? "افتح نسخة الاختبار؛ بياناتها محفوظة في متصفحك فقط."
              : "استخدم حساب إدارة مركز تفاصيل للدخول."}
          </p>
          {system?.preview && (
            <div className="alert info">
              <Info size={21} />
              <span>نسخة تجريبية ببيانات توضيحية. الرسائل النصية معطّلة.</span>
            </div>
          )}
          {error && <ErrorBox>{error}</ErrorBox>}
          {!browserDemo && (
            <form onSubmit={login}>
              <label>
                اسم الدخول
                <input
                  name="username"
                  autoComplete="username"
                  defaultValue="admin"
                  required
                  dir="ltr"
                />
              </label>
              <label>
                كلمة المرور
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  dir="ltr"
                />
              </label>
              <button
                className="button primary full"
                disabled={busy || !system}
              >
                {busy ? <SpinnerGap className="spin" /> : <ArrowLeft />} تسجيل
                الدخول
              </button>
            </form>
          )}
          {system?.preview && (
            <button
              type="button"
              className="button secondary full demo-login"
              disabled={busy}
              onClick={() => login()}
            >
              دخول النسخة التجريبية <ArrowLeft size={18} />
            </button>
          )}
          <p className="login-foot">
            {browserDemo
              ? "لا تحتاج حسابًا حقيقيًا لاستخدام هذه النسخة."
              : "بيانات الدخول تخص إدارة المركز."}
          </p>
        </div>
      </section>
    </main>
  );
}
function SessionForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { data, error } = useData<{ items: Cohort[] }>("courses");
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setFailure("");
    try {
      const r = await request<{ id: string }>("create_session", {
        title: f.get("title"),
        cohort_id: Number(f.get("cohort")),
        starts_at: f.get("start") + "+03:00",
        ends_at: f.get("end") + "+03:00",
      });
      onSaved(r.id);
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="حصة جديدة" onClose={onClose}>
      <p className="modal-intro">
        اختر مجموعة من دورات المركز وحدد موعد الحصة. يُنشأ لها رمز حضور خاص.
      </p>
      {(error || failure) && <ErrorBox>{error || failure}</ErrorBox>}
      <form onSubmit={submit}>
        <label>
          اسم الحصة
          <input
            name="title"
            required
            maxLength={120}
            placeholder="مثلًا: الحصة الثالثة · القدرات الكمية"
          />
        </label>
        <label>
          الدورة والمجموعة
          <select name="cohort" required defaultValue="">
            <option value="" disabled>
              اختر المجموعة
            </option>
            {data?.items.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title} · مجموعة {num(g.number)} · {num(g.students)} طالب
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            بداية الحصة
            <input
              name="start"
              type="datetime-local"
              dir="ltr"
              required
              defaultValue={future(60)}
            />
          </label>
          <label>
            نهاية الحصة
            <input
              name="end"
              type="datetime-local"
              dir="ltr"
              required
              defaultValue={future(180)}
            />
          </label>
        </div>
        <div className="rule-note">
          <Clock size={23} />
          <span>
            توقيت الرياض. يبدأ فحص الغياب بعد{" "}
            <strong>٢٠ دقيقة من بداية الحصة</strong>. يُستبعد المنتظرون
            والتسجيلات الملغاة.
          </span>
        </div>
        <footer>
          <button type="button" className="button secondary" onClick={onClose}>
            إلغاء
          </button>
          <button className="button primary" disabled={busy || !data}>
            {busy ? <SpinnerGap className="spin" /> : <QrCode />} إنشاء الحصة
            والرمز
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function PinResult({
  pin,
  name,
  reference,
  onClose,
}: {
  pin: string;
  name: string;
  reference?: string | null;
  onClose: () => void;
}) {
  return (
    <Modal title="رمز حضور الطالب" onClose={onClose}>
      <div className="pin-result">
        <CheckCircle size={44} weight="duotone" />
        <h3>{name}</h3>
        <p>رمز الطالب</p>
        <strong dir="ltr">{pin}</strong>
        {reference && (
          <p>
            رقم التسجيل: <b dir="ltr">{reference}</b>
          </p>
        )}
        <p className="muted">
          يظهر الرمز مرة واحدة. سلّمه للطالب أو ولي أمره عبر وسيلة خاصة. يحتاج
          الطالب رقم تسجيل الحصة مع هذا الرمز.
        </p>
        <button className="button primary full" onClick={onClose}>
          تم حفظ الرمز
        </button>
      </div>
    </Modal>
  );
}
function AddStudent({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (
    pin: string,
    name: string,
    reference: string | null,
    status: string | null,
  ) => void;
}) {
  const { data, error } = useData<{ items: Cohort[] }>("courses");
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setFailure("");
    try {
      const name = String(f.get("name"));
      const r = await request<{
        pin: string;
        reference: string | null;
        status: string | null;
      }>("add_student", {
        name,
        mobile: f.get("mobile"),
        guardian: f.get("guardian"),
        guardian_mobile: f.get("guardian_mobile"),
        cohort_id: Number(f.get("cohort")),
        consent: f.get("consent") === "on",
      });
      onSaved(r.pin, name, r.reference, r.status);
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="إضافة طالب" onClose={onClose}>
      <p className="modal-intro">
        {browserDemo
          ? "يُحفظ الطالب تجريبيًا في هذا المتصفح فقط، ضمن نسخة الاختبار."
          : "يُحفظ الطالب في قاعدة بيانات المركز ويظهر في الموقع الأساسي أيضًا."}
      </p>
      {(error || failure) && <ErrorBox>{error || failure}</ErrorBox>}
      <form onSubmit={submit}>
        <label>
          اسم الطالب
          <input
            name="name"
            required
            minLength={2}
            maxLength={100}
            autoComplete="off"
          />
        </label>
        <label>
          جوال الطالب أو رقم التواصل المسجل
          <input
            name="mobile"
            required
            type="tel"
            dir="ltr"
            placeholder="05xxxxxxxx"
          />
        </label>
        <div className="form-grid">
          <label>
            اسم ولي الأمر
            <input name="guardian" maxLength={100} />
          </label>
          <label>
            جوال ولي الأمر
            <input
              name="guardian_mobile"
              type="tel"
              dir="ltr"
              placeholder="05xxxxxxxx"
            />
          </label>
        </div>
        <label>
          التسجيل في مجموعة
          <select name="cohort" defaultValue="0">
            <option value="0">إضافة ملف الطالب فقط</option>
            {data?.items.map((g) => (
              <option value={g.id} key={g.id}>
                {g.title} · المجموعة {num(g.number)} ({num(g.students)} / ٢٠)
              </option>
            ))}
          </select>
        </label>
        <p className="field-hint">
          عند اكتمال المجموعة يُضاف التسجيل إلى الانتظار. أضف الطالب قبل بداية
          الحصة ليظهر في قائمتها.
        </p>
        <label className="checkbox">
          <input name="consent" type="checkbox" />
          <span>
            تم الحصول على موافقة ولي الأمر على إشعارات حضور الطالب وغيابه.
          </span>
        </label>
        <footer>
          <button type="button" className="button secondary" onClick={onClose}>
            إلغاء
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? <SpinnerGap className="spin" /> : <Plus />} حفظ الطالب
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function Contact({
  student,
  onClose,
  onSaved,
}: {
  student: Student;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await request("contact", {
        student_id: student.id,
        guardian: f.get("guardian"),
        guardian_mobile: f.get("guardian_mobile"),
        consent: f.get("consent") === "on",
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="بيانات تنبيهات الحضور" onClose={onClose}>
      <p className="modal-intro">{student.name}</p>
      {error && <ErrorBox>{error}</ErrorBox>}
      <form onSubmit={save}>
        <label>
          اسم ولي الأمر
          <input
            name="guardian"
            defaultValue={student.guardian}
            maxLength={100}
          />
        </label>
        <label>
          جوال ولي الأمر
          <input
            name="guardian_mobile"
            defaultValue={student.guardian_mobile}
            dir="ltr"
            type="tel"
            placeholder="05xxxxxxxx"
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            name="consent"
            defaultChecked={!!student.sms_consent_at}
          />
          <span>
            تم الحصول على موافقة ولي الأمر على إشعارات الحضور والغياب.
          </span>
        </label>
        <footer>
          <button type="button" className="button secondary" onClick={onClose}>
            إلغاء
          </button>
          <button className="button primary" disabled={busy}>
            حفظ البيانات
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function Manual({
  row,
  session,
  onClose,
  onSaved,
}: {
  row: RosterRow;
  session: Session;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await request("mark", {
        session_id: session.id,
        student_id: row.student_id,
        mode: f.get("mode"),
        note: f.get("note"),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="تحديث حضور الطالب" onClose={onClose}>
      <p>{row.name}</p>
      {error && <ErrorBox>{error}</ErrorBox>}
      <form onSubmit={save}>
        <label>
          التحديث
          <select name="mode">
            <option value="in">تسجيل حضور الآن</option>
            {row.checked_in && <option value="out">تسجيل انصراف الآن</option>}
            {!row.checked_in && <option value="excused">غياب بعذر</option>}
          </select>
        </label>
        <label>
          سبب التحديث
          <textarea
            name="note"
            required
            minLength={2}
            maxLength={300}
            placeholder="يُحفظ السبب في سجل الحضور"
          />
        </label>
        <footer>
          <button className="button secondary" type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="button primary" disabled={busy}>
            حفظ التحديث
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function rowStatus(r: RosterRow, s: Session) {
  if (r.registration_status !== "registered")
    return { label: "تسجيل غير نشط", kind: "neutral" };
  if (r.excused) return { label: "غياب بعذر", kind: "neutral" };
  if (r.checked_out) return { label: "انصرف", kind: "present" };
  if (r.checked_in)
    return stamp(r.checked_in).getTime() >=
      stamp(s.starts_at).getTime() + 1200000
      ? { label: "متأخر", kind: "late" }
      : { label: "حاضر", kind: "present" };
  return Date.now() >= stamp(s.starts_at).getTime() + 1200000
    ? { label: "غائب", kind: "absent" }
    : { label: "بانتظار الحضور", kind: "neutral" };
}
function exportRoster(rows: RosterRow[], s: Session) {
  const columns = [
    "الطالب",
    "رقم التسجيل",
    "الحالة",
    "الحضور",
    "الانصراف",
    "الملاحظة",
  ];
  const safe = (v: unknown) => {
    let x = String(v ?? "");
    if (/^[\s\p{Cf}]*[=+@\-\t\r]/u.test(x)) x = "'" + x;
    return '"' + x.replaceAll('"', '""') + '"';
  };
  const values = rows.map((r) => [
    r.name,
    r.reference,
    rowStatus(r, s).label,
    r.checked_in ? `${date(r.checked_in)} ${time(r.checked_in)}` : "",
    time(r.checked_out),
    r.note,
  ]);
  const blob = new Blob(
    [
      "\ufeff" +
        [columns, ...values].map((row) => row.map(safe).join(",")).join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `حضور-${s.title.replace(/[/\\]/g, "-")}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Roster({
  id,
  onClose,
  notify,
}: {
  id: string;
  onClose: () => void;
  notify: (m: string) => void;
}) {
  const [version, setVersion] = useState(0),
    [query, setQuery] = useState(""),
    [manual, setManual] = useState<RosterRow | null>(null),
    [failure, setFailure] = useState(""),
    [closing, setClosing] = useState(false),
    [closingBusy, setClosingBusy] = useState(false);
  const { data, error, loading } = useData<{
    session: Session;
    items: RosterRow[];
  }>("roster", version, { id });
  async function closeSession() {
    setClosingBusy(true);
    try {
      await request("close_session", { session_id: id });
      setClosing(false);
      setVersion((v) => v + 1);
      notify("أُغلقت الحصة وتوقف رمزها وتنبيهاتها.");
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setClosingBusy(false);
    }
  }
  async function sync() {
    try {
      await request("sync_roster", { session_id: id });
      setVersion((v) => v + 1);
      notify("تحدثت قائمة الطلاب من بيانات الموقع.");
    } catch (e) {
      setFailure((e as Error).message);
    }
  }
  return (
    <Modal title="سجل الحصة" onClose={onClose} wide>
      {(error || failure) && <ErrorBox>{error || failure}</ErrorBox>}
      {loading && !data ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="roster-heading">
              <div>
                <h3>{data.session.title}</h3>
                <p>
                  {data.session.course_title} · المجموعة{" "}
                  {num(data.session.cohort_number)}
                </p>
              </div>
              <div className="actions">
                <button
                  className="button secondary small"
                  onClick={() => exportRoster(data.items, data.session)}
                >
                  <Download /> تصدير CSV
                </button>
                {phase(data.session) === "upcoming" && (
                  <button className="button secondary small" onClick={sync}>
                    <ArrowsClockwise /> تحديث الطلاب
                  </button>
                )}
              </div>
            </div>
            <div className="search">
              <MagnifyingGlass />
              <input
                aria-label="البحث في سجل الحصة"
                placeholder="ابحث باسم الطالب أو رقم التسجيل…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>الطالب</th>
                    <th>الحالة</th>
                    <th>الحضور</th>
                    <th>الانصراف</th>
                    <th>التنبيه</th>
                    <th>
                      <span className="sr-only">الإجراء</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items
                    .filter((r) => (r.name + r.reference).includes(query))
                    .map((r) => {
                      const status = rowStatus(r, data.session);
                      return (
                        <tr key={r.student_id}>
                          <td>
                            <strong>{r.name}</strong>
                            <small>رقم التسجيل {r.reference}</small>
                          </td>
                          <td>
                            <span className={`badge ${status.kind}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="nowrap">{time(r.checked_in)}</td>
                          <td className="nowrap">{time(r.checked_out)}</td>
                          <td>
                            <small>
                              {r.message_status
                                ? messageLabel[r.message_status]
                                : !r.guardian_mobile
                                  ? "رقم ولي الأمر غير مسجل"
                                  : "—"}
                            </small>
                          </td>
                          <td>
                            <button
                              className="text-button"
                              onClick={() => setManual(r)}
                            >
                              تحديث
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <p className="field-hint">
              توقيت الرياض. يشمل السجل الطلاب المثبتين للحصة، وتُستبعد التسجيلات
              الملغاة من التنبيهات.
            </p>
            {data.session.status === "open" && (
              <footer>
                <button
                  className="button secondary"
                  onClick={() => setClosing(true)}
                >
                  إغلاق الحصة
                </button>
              </footer>
            )}
          </>
        )
      )}
      {closing && (
        <Modal title="إغلاق الحصة" onClose={() => setClosing(false)}>
          <p>
            يتوقف رمز الحضور والانصراف وتنبيهات الغياب لهذه الحصة. يبقى سجلها
            محفوظًا.
          </p>
          <footer>
            <button
              className="button secondary"
              onClick={() => setClosing(false)}
            >
              إلغاء
            </button>
            <button
              className="button primary"
              disabled={closingBusy}
              onClick={closeSession}
            >
              إغلاق الحصة
            </button>
          </footer>
        </Modal>
      )}
      {manual && data && (
        <Manual
          row={manual}
          session={data.session}
          onClose={() => setManual(null)}
          onSaved={() => {
            setManual(null);
            setVersion((v) => v + 1);
            notify("حُفظ تحديث حضور الطالب.");
          }}
        />
      )}
    </Modal>
  );
}
function Students({
  version,
  onAdd,
  onContact,
  onPin,
}: {
  version: number;
  onAdd: () => void;
  onContact: (s: Student) => void;
  onPin: (s: Student) => void;
}) {
  const [query, setQuery] = useState(""),
    [offset, setOffset] = useState(0);
  const { data, error, loading } = useData<{ items: Student[]; total: number }>(
    "students",
    version,
    { q: query, offset },
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>الطلاب</h1>
          <p>ملفات مشتركة مع الموقع الأساسي، وبيانات جاهزة للحضور.</p>
        </div>
        <button className="button primary" onClick={onAdd}>
          <Plus /> إضافة طالب
        </button>
      </div>
      <section className="panel">
        <div className="panel-toolbar">
          <div className="search">
            <MagnifyingGlass />
            <input
              aria-label="البحث عن طالب"
              placeholder="ابحث باسم الطالب أو رقم الجوال…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOffset(0);
              }}
            />
          </div>
          <span className="muted">{num(data?.total || 0)} طالب</span>
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
        {loading && !data ? (
          <Loading />
        ) : data?.items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>الطالب</th>
                    <th>رقم التسجيل</th>
                    <th>ولي الأمر</th>
                    <th>رمز الحضور</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div className="student-cell">
                          <span className="avatar">
                            {s.name.replace("طالب تجريبي ", "").slice(0, 1)}
                          </span>
                          <div>
                            <strong>{s.name}</strong>
                            <small dir="ltr">{s.mobile}</small>
                          </div>
                        </div>
                      </td>
                      <td>{s.refs || "غير مسجل في مجموعة"}</td>
                      <td>
                        <strong>{s.guardian || "غير مسجل"}</strong>
                        <small>
                          {s.guardian_mobile ? (
                            <span dir="ltr">{s.guardian_mobile}</span>
                          ) : (
                            <span className="amber">أضف رقم ولي الأمر</span>
                          )}
                        </small>
                      </td>
                      <td>
                        <span
                          className={`badge ${s.has_pin ? "present" : "neutral"}`}
                        >
                          {s.has_pin ? "مجهز" : "لم يُجهز"}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="text-button"
                            onClick={() => onContact(s)}
                          >
                            بيانات التنبيه
                          </button>
                          <button
                            className="text-button"
                            onClick={() => onPin(s)}
                          >
                            {s.has_pin ? "تجديد الرمز" : "تجهيز الرمز"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                عرض {num(offset + 1)}–{num(Math.min(offset + 50, data.total))}{" "}
                من {num(data.total)}
              </span>
              <div>
                <button
                  className="button secondary small"
                  disabled={!offset}
                  onClick={() => setOffset((v) => Math.max(0, v - 50))}
                >
                  السابق
                </button>
                <button
                  className="button secondary small"
                  disabled={offset + 50 >= data.total}
                  onClick={() => setOffset((v) => v + 50)}
                >
                  التالي
                </button>
              </div>
            </div>
          </>
        ) : (
          <Empty title="لا يوجد طلاب مطابقون">
            أضف طالبًا أو عدّل عبارة البحث.
          </Empty>
        )}
      </section>
    </>
  );
}
function Messages({ version }: { version: number }) {
  const { data, error, loading } = useData<{
    items: Message[];
    system: System;
  }>("messages", version);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>تنبيهات أولياء الأمور</h1>
          <p>متابعة كل تنبيه غياب من إنشائه إلى نتيجة إرساله.</p>
        </div>
        <span className="badge neutral">SMS</span>
      </div>
      <div className="rule-note">
        <Info size={24} />
        <span>
          «قبله المزوّد» تعني قبول طلب الإرسال. تأكيد وصول الرسالة إلى الجوال
          يُراجع لدى مزوّد الرسائل.
        </span>
      </div>
      <section className="panel">
        {error && <ErrorBox>{error}</ErrorBox>}
        {loading && !data ? (
          <Loading />
        ) : data?.items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الطالب والحصة</th>
                  <th>الوقت</th>
                  <th>الحالة</th>
                  <th>التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.name}</strong>
                      <small>{m.title}</small>
                    </td>
                    <td>
                      {time(m.created_at)}
                      <small>{date(m.created_at)}</small>
                    </td>
                    <td>
                      <span
                        className={`badge ${m.status === "submitted" ? "present" : m.status === "blocked" ? "late" : "neutral"}`}
                      >
                        {messageLabel[m.status]}
                      </span>
                    </td>
                    <td>
                      <small>{reasonLabel[m.reason] || "—"}</small>
                      {m.provider_id && (
                        <small>مرجع المزوّد: {m.provider_id}</small>
                      )}
                      {m.body && (
                        <details>
                          <summary>نص الرسالة</summary>
                          <p>{m.body}</p>
                          <span dir="ltr">{m.recipient}</span>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="لا توجد تنبيهات غياب بعد">
            تُنشأ تنبيهات الغياب بعد ٢٠ دقيقة من بداية الحصة، عند تشغيل المهمة
            المجدولة.
          </Empty>
        )}
      </section>
    </>
  );
}
function Settings({ system }: { system: System }) {
  const cron =
    system.last_cron && Date.now() - stamp(system.last_cron).getTime() < 180000;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>حالة الربط</h1>
          <p>اتصال التطبيق ببيانات المركز وخدمة التنبيهات.</p>
        </div>
      </div>
      <section className="settings-list panel">
        <div>
          <span className="setting-icon">
            <Users size={27} />
          </span>
          <div>
            <h3>قاعدة بيانات المركز</h3>
            <p>
              {system.browser_demo
                ? "بيانات تجريبية محفوظة في هذا المتصفح فقط، ولا تتصل ببيانات المركز."
                : system.preview
                  ? "قاعدة تجريبية معزولة. الربط الفعلي عند النشر على استضافة المركز."
                  : "الدورات والمجموعات وملفات الطلاب مشتركة مباشرة مع الموقع الأساسي."}
            </p>
          </div>
          <span className={`badge ${system.preview ? "late" : "present"}`}>
            {system.preview ? "تجريبية" : "متصلة"}
          </span>
        </div>
        <div>
          <span className="setting-icon">
            <ChatText size={27} />
          </span>
          <div>
            <h3>الرسائل النصية</h3>
            <p>
              {system.sms_ready
                ? "خدمة الرسائل مهيأة للإرسال من الخادم."
                : "يلزم ربط حساب مزوّد الرسائل واسم مرسل معتمد في إعدادات الاستضافة."}
            </p>
            <a
              href="https://dev.taqnyat.sa/ar/doc/sms/"
              target="_blank"
              rel="noreferrer"
            >
              توثيق ربط تقنيات <ArrowSquareOut size={14} />
            </a>
          </div>
          <span className={`badge ${system.sms_ready ? "present" : "late"}`}>
            {system.sms_ready ? "مفعّلة" : "غير مفعّلة"}
          </span>
        </div>
        <div>
          <span className="setting-icon">
            <Clock size={27} />
          </span>
          <div>
            <h3>فحص الغياب التلقائي</h3>
            <p>
              {system.browser_demo
                ? "محاكاة بعد ٢٠ دقيقة من بداية الحصة. تعمل أثناء فتح نسخة الاختبار، ولا ترسل SMS."
                : "بعد ٢٠ دقيقة من بداية الحصة، بتوقيت الرياض. يُشغّل الخادم الفحص كل دقيقة."}
            </p>
            <small>
              {system.browser_demo
                ? "لا توجد مهمة خادم في نسخة GitHub Pages."
                : system.last_cron
                  ? `آخر تشغيل: ${date(system.last_cron)}، ${time(system.last_cron)}`
                  : "لم يُسجل تشغيل المهمة المجدولة بعد."}
            </small>
          </div>
          <span className={`badge ${cron ? "present" : "late"}`}>
            {system.browser_demo ? "محاكاة" : cron ? "تعمل" : "تحتاج تشغيلًا"}
          </span>
        </div>
      </section>
      <section className="panel setup-note">
        <h3>قبل الاستخدام الفعلي</h3>
        <p>
          يُرفع التطبيق برابط مستقل على استضافة المركز، مع مسار قاعدة البيانات
          الحالية. تُضاف إعدادات SMS في ملفات الخادم الخاصة وتُفعّل مهمة فحص
          الغياب. أضف أرقام أولياء الأمور ورموز الطلاب قبل أول حصة.
        </p>
      </section>
    </>
  );
}
function QrPanel({
  session,
  system,
  onRoster,
}: {
  session: Session | null;
  system: System;
  onRoster: (id: string) => void;
}) {
  if (!session)
    return (
      <aside className="qr-panel">
        <QrCode size={50} weight="thin" />
        <h3>رمز لكل حصة</h3>
        <p>أنشئ حصة لعرض رمز حضور طلابها هنا.</p>
      </aside>
    );
  const url = `${appRoot}?s=${session.token}`;
  const p = phase(session);
  return (
    <aside className="qr-panel">
      <div className="qr-top">
        <QrCode size={22} />
        <span>رمز الحصة</span>
        <span className={`badge ${p}`}>{phaseLabel[p]}</span>
      </div>
      <h3>{session.title}</h3>
      <p>
        {session.course_title} · المجموعة {num(session.cohort_number)}
      </p>
      <div className="qr-paper">
        <QR value={url} />
        <span>امسح الرمز وسجّل حضورك</span>
      </div>
      <p className="qr-time">
        <CalendarBlank size={17} /> {date(session.starts_at)}
        <br />
        <Clock size={17} /> {time(session.starts_at)} — {time(session.ends_at)}
      </p>
      <a
        className="button primary full"
        href={`${appRoot}?display=${session.id}`}
        target="_blank"
        rel="noreferrer"
      >
        <ArrowSquareOut /> عرض الرمز للكلاس
      </a>
      <button
        className="button secondary full"
        onClick={() => onRoster(session.id)}
      >
        <ClipboardText /> فتح سجل الحصة
      </button>
      <a className="text-button" href={url} target="_blank" rel="noreferrer">
        فتح صفحة الطالب <ArrowSquareOut size={14} />
      </a>
      {system.preview && (
        <p className="qr-preview">
          {browserDemo
            ? "بيانات الحصص الجديدة محفوظة في هذا المتصفح فقط. جرّب صفحة الطالب من الرابط أعلاه."
            : "رمز التجربة يفتح على هذا الجهاز. يتاح للطلاب بالجوال بعد النشر."}
        </p>
      )}
    </aside>
  );
}
function Dashboard({
  data,
  view,
  onCreate,
  onRoster,
  selected,
  setSelected,
}: {
  data: Overview;
  view: View;
  onCreate: () => void;
  onRoster: (id: string) => void;
  selected: string;
  setSelected: (id: string) => void;
}) {
  const [filter, setFilter] = useState("all");
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Riyadh",
  });
  const sameDay = (s: Session) =>
    stamp(s.starts_at).toLocaleDateString("en-CA", {
      timeZone: "Asia/Riyadh",
    }) === today;
  const todaySessions = data.sessions
      .filter(sameDay)
      .sort(
        (a, b) => stamp(a.starts_at).getTime() - stamp(b.starts_at).getTime(),
      ),
    sessions =
      view === "overview"
        ? todaySessions
        : data.sessions.filter(
            (s) =>
              filter === "all" ||
              (filter === "today" && sameDay(s)) ||
              (filter === "upcoming" && phase(s) === "upcoming"),
          );
  const chosen =
    sessions.find((s) => s.id === selected) ||
    sessions.find((s) => phase(s) === "live") ||
    sessions[0] ||
    null;
  const registered = todaySessions.reduce((sum, s) => sum + Number(s.total), 0),
    present = todaySessions.reduce((sum, s) => sum + Number(s.present), 0);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="heading-context">مركز تفاصيل للتدريب</span>
          <h1>
            {view === "overview" ? "الحضور والانصراف" : "الحصص ورموز الحضور"}
          </h1>
          <p>
            {view === "overview"
              ? "نظرة على يوم المركز، وحضور كل طالب."
              : "أنشئ الحصص وتابع سجلاتها من مكان واحد."}
          </p>
        </div>
        <button className="button primary" onClick={onCreate}>
          <Plus size={19} /> حصة جديدة
        </button>
      </div>
      {view === "overview" && (
        <section className="day-strip">
          <div className="day-icon">
            <CalendarBlank size={31} weight="duotone" />
          </div>
          <div className="day-title">
            <span>جدول اليوم</span>
            <strong>{date(new Date().toISOString())}</strong>
          </div>
          <div className="day-stat">
            <strong>{num(todaySessions.length)}</strong>
            <span>حصص اليوم</span>
          </div>
          <div className="day-stat">
            <strong>
              {num(present)}
              <small> / {num(registered)}</small>
            </strong>
            <span>تسجيل حضور</span>
          </div>
          <div className="day-stat">
            <strong>{num(data.students)}</strong>
            <span>طلاب المركز</span>
          </div>
        </section>
      )}
      <div className="workspace-grid">
        <div className="schedule-column">
          <section className="panel schedule">
            <div className="panel-heading">
              <div>
                <h2>{view === "overview" ? "حصص اليوم" : "جدول الحصص"}</h2>
                <p>
                  {view === "overview"
                    ? "اختر حصة لعرض رمزها ومتابعة طلابها."
                    : "آخر ٢٠٠ حصة، مرتبة حسب الموعد."}
                </p>
              </div>
              {view === "overview" ? (
                <span className="live-caption">
                  <span /> تحديث دوري
                </span>
              ) : (
                <select
                  aria-label="تصفية الحصص"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="today">اليوم</option>
                  <option value="upcoming">القادمة</option>
                  <option value="all">جميع الحصص</option>
                </select>
              )}
            </div>
            {sessions.length ? (
              <div className="session-list">
                {sessions.map((s) => {
                  const p = phase(s);
                  return (
                    <article
                      key={s.id}
                      className={`session-row ${chosen?.id === s.id ? "selected" : ""}`}
                    >
                      <button
                        className="session-main"
                        onClick={() => setSelected(s.id)}
                        aria-pressed={chosen?.id === s.id}
                      >
                        <div className="session-clock">
                          <strong>{time(s.starts_at)}</strong>
                          <span>{time(s.ends_at)}</span>
                        </div>
                        <div className="session-name">
                          <span className={`badge ${p}`}>{phaseLabel[p]}</span>
                          <h3>{s.title}</h3>
                          <p>{s.course_title}</p>
                          <span className="session-meta">
                            المجموعة {num(s.cohort_number)}
                            {view === "sessions"
                              ? ` · ${date(s.starts_at)}`
                              : ""}
                          </span>
                        </div>
                      </button>
                      <div className="session-bottom">
                        <span>
                          <Users size={16} /> {num(s.present)} من {num(s.total)}{" "}
                          حضروا
                        </span>
                        <button
                          className="text-button"
                          onClick={() => onRoster(s.id)}
                        >
                          سجل الحضور <ArrowLeft size={15} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <Empty title="لا توجد حصص في هذه الفترة">
                أنشئ حصة جديدة من إحدى مجموعات المركز.
              </Empty>
            )}
          </section>
          <section className="absence-note">
            <div className="absence-clock">
              <Clock size={27} />
              <strong>٢٠</strong>
              <span>دقيقة</span>
            </div>
            <div>
              <h3>
                {browserDemo
                  ? "جرّب تنبيه الغياب بعد ٢٠ دقيقة"
                  : "غياب الطالب يصل لولي أمره"}
              </h3>
              <p>
                {browserDemo
                  ? "تظهر محاكاة تنبيه الغياب في سجل التنبيهات أثناء فتح نسخة الاختبار. لا تُرسل رسائل نصية فعلية."
                  : "بعد ٢٠ دقيقة من بداية الحصة، يُجهّز تنبيه للطلاب الذين لم يسجلوا حضورهم. يُرسل عند تفعيل خدمة SMS وتشغيل الفحص المجدول."}
              </p>
              <span
                className={`connection ${data.system.sms_ready ? "ready" : ""}`}
              >
                <span />
                {data.system.sms_ready
                  ? "خدمة الرسائل مفعّلة"
                  : "خدمة الرسائل تنتظر الربط"}
              </span>
            </div>
          </section>
        </div>
        <QrPanel session={chosen} system={data.system} onRoster={onRoster} />
      </div>
    </>
  );
}
function Display({ id, onExit }: { id: string; onExit: () => void }) {
  const { data, error, loading } = useData<{
    session: Session;
    items: RosterRow[];
  }>("roster", 0, { id });
  const [mode, setMode] = useState("in");
  return (
    <main className="display-page">
      <div className="display-tools">
        <button className="button secondary" onClick={onExit}>
          <ArrowLeft /> العودة للوحة
        </button>
        <button className="button primary" onClick={() => window.print()}>
          <Printer /> طباعة الرمز
        </button>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {loading ? (
        <Loading />
      ) : (
        data && (
          <section className="display-sheet">
            <Brand />
            <span className="display-label">
              {mode === "in" ? "تسجيل الحضور" : "تسجيل الانصراف"}
            </span>
            <h1>{data.session.title}</h1>
            <h2>{data.session.course_title}</h2>
            <p>
              المجموعة {num(data.session.cohort_number)} ·{" "}
              {date(data.session.starts_at)}
            </p>
            <div className="display-qr">
              <QR
                size={300}
                value={`${appRoot}?s=${data.session.token}&mode=${mode}`}
              />
            </div>
            <h3>امسح الرمز بكاميرا جوالك</h3>
            <p>
              أدخل رقم تسجيلك ورمز الطالب لتأكيد{" "}
              {mode === "in" ? "حضورك" : "انصرافك"}.
            </p>
            <div className="display-times">
              <span>
                البداية <b>{time(data.session.starts_at)}</b>
              </span>
              <span>
                النهاية <b>{time(data.session.ends_at)}</b>
              </span>
            </div>
            <div className="segment no-print">
              <button
                aria-pressed={mode === "in"}
                onClick={() => setMode("in")}
              >
                رمز الحضور
              </button>
              <button
                aria-pressed={mode === "out"}
                onClick={() => setMode("out")}
              >
                رمز الانصراف
              </button>
            </div>
          </section>
        )
      )}
    </main>
  );
}
function StudentPortal({
  token,
  system,
}: {
  token: string;
  system: System | null;
}) {
  const { data, error, loading } = useData<{ session: Session; clock: string }>(
    "public_session",
    0,
    { token },
  );
  const [mode, setMode] = useState(
      new URLSearchParams(location.search).get("mode") === "out" ? "out" : "in",
    ),
    [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<{
      already: boolean;
      mode: string;
      time: string;
      late: boolean;
    } | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setFailure("");
    try {
      const r = await request<{
        already: boolean;
        mode: string;
        time: string;
        late: boolean;
      }>("check", {
        token,
        reference: western(String(f.get("reference"))).trim(),
        pin: western(String(f.get("pin"))).trim(),
        mode,
      });
      setResult(r);
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="student-portal">
      <Brand />
      {browserDemo && (
        <div className="alert info">
          <Info size={20} />
          <span>
            نسخة اختبار: يُحفظ الحضور على هذا المتصفح فقط، ولا يرتبط بسجل المركز
            الفعلي.
          </span>
        </div>
      )}
      <section className="portal-card">
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox>{error}</ErrorBox>
        ) : (
          data && (
            <>
              {result ? (
                <div className="attendance-success">
                  <div>
                    <Check size={45} weight="bold" />
                  </div>
                  <h1>
                    {result.already
                      ? "سبق تسجيل " +
                        (result.mode === "in" ? "حضورك" : "انصرافك")
                      : "تم تسجيل " +
                        (result.mode === "in" ? "حضورك" : "انصرافك")}
                  </h1>
                  <h2>{data.session.title}</h2>
                  <p>
                    {time(result.time)} · {date(result.time)}
                  </p>
                  {result.late && (
                    <span className="badge late">حضور متأخر</span>
                  )}
                  <button
                    className="button secondary full"
                    onClick={() => {
                      setResult(null);
                      setFailure("");
                    }}
                  >
                    العودة
                  </button>
                </div>
              ) : (
                <>
                  <span className="section-mark">
                    <ChalkboardTeacher size={22} /> مركز تفاصيل للتدريب
                  </span>
                  <h1>{data.session.title}</h1>
                  <p className="portal-date">
                    {date(data.session.starts_at)}
                    <br />
                    {time(data.session.starts_at)} —{" "}
                    {time(data.session.ends_at)}
                  </p>
                  <div className="segment">
                    <button
                      aria-pressed={mode === "in"}
                      onClick={() => {
                        setMode("in");
                        setFailure("");
                      }}
                    >
                      تسجيل الحضور
                    </button>
                    <button
                      aria-pressed={mode === "out"}
                      onClick={() => {
                        setMode("out");
                        setFailure("");
                      }}
                    >
                      تسجيل الانصراف
                    </button>
                  </div>
                  {failure && <ErrorBox>{failure}</ErrorBox>}
                  {data.session.status !== "open" ? (
                    <div className="alert info">
                      أُغلق تسجيل الحضور لهذه الحصة.
                    </div>
                  ) : (
                    <form onSubmit={submit}>
                      <label>
                        رقم التسجيل
                        <input
                          name="reference"
                          required
                          dir="ltr"
                          inputMode="numeric"
                          maxLength={32}
                          autoComplete="off"
                          placeholder="رقم تسجيلك في هذه الدورة"
                        />
                      </label>
                      <label>
                        رمز الطالب
                        <input
                          name="pin"
                          type="password"
                          required
                          dir="ltr"
                          inputMode="numeric"
                          minLength={8}
                          maxLength={8}
                          autoComplete="off"
                          placeholder="٨ أرقام"
                        />
                      </label>
                      <p className="field-hint">
                        تحصل على رقم التسجيل ورمز الطالب من إدارة المركز.
                        {mode === "out"
                          ? " يفتح الانصراف قبل نهاية الحصة بـ١٥ دقيقة."
                          : ""}
                      </p>
                      <button
                        className="button primary full"
                        disabled={busy || !system}
                      >
                        {busy ? (
                          <SpinnerGap className="spin" />
                        ) : (
                          <CheckCircle size={21} />
                        )}{" "}
                        تأكيد {mode === "in" ? "الحضور" : "الانصراف"}
                      </button>
                    </form>
                  )}
                  {system?.preview && (
                    <p className="demo-hint">
                      بيانات التجربة: رقم تسجيل ١، رمز الطالب{" "}
                      <span dir="ltr">24681357</span>. لا تُرسل رسائل من هذه
                      النسخة.
                    </p>
                  )}
                </>
              )}
            </>
          )
        )}
      </section>
      <span className="portal-foot">
        <LockKey size={15} /> سجل حضور خاص بطلاب المركز
      </span>
    </main>
  );
}
export default function App() {
  const [boot, setBoot] = useState(true),
    [user, setUser] = useState<User | null>(null),
    [system, setSystem] = useState<System | null>(null),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0),
    [view, setView] = useState<View>("overview"),
    [selected, setSelected] = useState(""),
    [modal, setModal] = useState<"session" | "student" | null>(null),
    [roster, setRoster] = useState(""),
    [contact, setContact] = useState<Student | null>(null),
    [pinResult, setPinResult] = useState<{
      pin: string;
      name: string;
      reference?: string | null;
    } | null>(null),
    [pinStudent, setPinStudent] = useState<Student | null>(null),
    [toast, setToast] = useState(""),
    [display, setDisplay] = useState(
      new URLSearchParams(location.search).get("display") || "",
    ),
    [operationBusy, setOperationBusy] = useState(false);
  const token = new URLSearchParams(location.search).get("s");
  useEffect(() => {
    request<{ user: User | null; system: System }>("session")
      .then((r) => {
        setUser(r.user);
        setSystem(r.system);
      })
      .catch((e) => setError(e.message))
      .finally(() => setBoot(false));
    const unauthorized = () => {
      setUser(null);
      setError("انتهت جلسة الدخول. سجّل الدخول مجددًا.");
    };
    window.addEventListener("attendance:unauthorized", unauthorized);
    return () =>
      window.removeEventListener("attendance:unauthorized", unauthorized);
  }, []);
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") setVersion((v) => v + 1);
    }, 15000);
    return () => clearInterval(id);
  }, [user]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(id);
  }, [toast]);
  function notify(message: string) {
    setToast(message);
    setVersion((v) => v + 1);
  }
  async function logout() {
    try {
      await request("logout", {});
      setUser(null);
      setError("");
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  async function resetPin() {
    if (!pinStudent) return;
    setOperationBusy(true);
    try {
      const r = await request<{ pin: string }>("reset_pin", {
        student_id: pinStudent.id,
      });
      setPinResult({
        pin: r.pin,
        name: pinStudent.name,
        reference: pinStudent.refs,
      });
      setPinStudent(null);
      setVersion((v) => v + 1);
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setOperationBusy(false);
    }
  }
  if (boot)
    return (
      <div className="boot">
        <Brand />
        <Loading />
      </div>
    );
  if (token) return <StudentPortal token={token} system={system} />;
  if (!user)
    return (
      <Login
        system={system}
        onLogin={(u) => {
          setUser(u);
          setError("");
        }}
        error={error}
      />
    );
  if (display)
    return (
      <Display
        id={display}
        onExit={() => {
          setDisplay("");
          history.replaceState(null, "", import.meta.env.BASE_URL);
        }}
      />
    );
  const navigation: [View, string, ReactNode][] = [
    ["overview", "نظرة اليوم", <House />],
    ["sessions", "الحصص والرموز", <QrCode />],
    ["students", "الطلاب", <Users />],
    ["messages", "تنبيهات الغياب", <ChatText />],
    ["settings", "حالة الربط", <GearSix />],
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <span className="sidebar-label">إدارة المركز</span>
        <nav aria-label="القائمة الرئيسية">
          {navigation.map(([id, label, icon]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              aria-current={view === id ? "page" : undefined}
              onClick={() => setView(id)}
            >
              {icon}
              <span>{label}</span>
              {id === "overview" && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <QrCode size={24} />
            <strong>حضور يبدأ بمسحة</strong>
            <p>اعرض رمز الحصة في القاعة، وتابع حضور طلابك.</p>
          </div>
          <div className="admin-user">
            <span className="user-avatar">
              <StudentIcon size={23} />
            </span>
            <div>
              <strong>مدير المركز</strong>
              <small>إدارة الحضور</small>
            </div>
            <button aria-label="تسجيل الخروج" onClick={logout}>
              <SignOut size={21} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            حضور تفاصيل <span>/</span>{" "}
            {navigation.find((n) => n[0] === view)?.[1]}
          </div>
          <div className="topbar-left">
            <span className="today-header">
              <CalendarBlank size={17} />
              {date(new Date().toISOString())}
            </span>
            <span className="topbar-avatar">ت</span>
          </div>
        </header>
        <main id="main-content" className="main-content">
          {system?.preview && (
            <div className="preview-banner">
              <span>
                <Info size={18} /> نسخة تجريبية ببيانات توضيحية
              </span>
              <span>
                {browserDemo
                  ? "بيانات هذا المتصفح فقط · لا توجد رسائل فعلية"
                  : "الربط بقاعدة المركز والرسائل الفعلية عند النشر"}
              </span>
            </div>
          )}
          <Workspace
            view={view}
            version={version}
            selected={selected}
            setSelected={setSelected}
            onCreate={() => setModal("session")}
            onRoster={setRoster}
            onAdd={() => setModal("student")}
            onContact={setContact}
            onPin={setPinStudent}
          />
          <footer className="app-footer">
            <span>مركز تفاصيل للتدريب</span>
            <span>
              <LockKey size={13} /> وقت المركز: الرياض
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle size={21} />
          {toast}
          <button aria-label="إغلاق الإشعار" onClick={() => setToast("")}>
            <X />
          </button>
        </div>
      )}
      {modal === "session" && (
        <SessionForm
          onClose={() => setModal(null)}
          onSaved={(id) => {
            setModal(null);
            setSelected(id);
            setView("sessions");
            notify("أُنشئت الحصة ورمز حضورها.");
          }}
        />
      )}
      {modal === "student" && (
        <AddStudent
          onClose={() => setModal(null)}
          onSaved={(pin, name, reference, status) => {
            setModal(null);
            setPinResult({ pin, name, reference });
            notify(
              status === "waitlist"
                ? "حُفظ الطالب في قائمة الانتظار لاكتمال المجموعة."
                : browserDemo
                  ? "حُفظ الطالب في نسخة الاختبار على هذا المتصفح."
                  : "حُفظ الطالب في بيانات المركز.",
            );
          }}
        />
      )}
      {contact && (
        <Contact
          student={contact}
          onClose={() => setContact(null)}
          onSaved={() => {
            setContact(null);
            notify("حُفظت بيانات ولي الأمر.");
          }}
        />
      )}
      {pinStudent && (
        <Modal
          title={pinStudent.has_pin ? "تجديد رمز الطالب" : "تجهيز رمز الطالب"}
          onClose={() => setPinStudent(null)}
        >
          <p>
            إنشاء رمز خاص للطالب <strong>{pinStudent.name}</strong>.
          </p>
          {!!pinStudent.has_pin && (
            <p className="muted">يُلغى الرمز السابق فور إنشاء الرمز الجديد.</p>
          )}
          <footer>
            <button
              className="button secondary"
              onClick={() => setPinStudent(null)}
            >
              إلغاء
            </button>
            <button
              className="button primary"
              disabled={operationBusy}
              onClick={resetPin}
            >
              إنشاء الرمز
            </button>
          </footer>
        </Modal>
      )}
      {pinResult && (
        <PinResult {...pinResult} onClose={() => setPinResult(null)} />
      )}
      {roster && (
        <Roster id={roster} onClose={() => setRoster("")} notify={notify} />
      )}
    </div>
  );
}
function Workspace(props: {
  view: View;
  version: number;
  selected: string;
  setSelected: (id: string) => void;
  onCreate: () => void;
  onRoster: (id: string) => void;
  onAdd: () => void;
  onContact: (s: Student) => void;
  onPin: (s: Student) => void;
}) {
  const { data, error, loading } = useData<Overview>("overview", props.version);
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (loading && !data) return <Loading />;
  if (!data) return null;
  if (props.view === "students")
    return (
      <Students
        version={props.version}
        onAdd={props.onAdd}
        onContact={props.onContact}
        onPin={props.onPin}
      />
    );
  if (props.view === "messages") return <Messages version={props.version} />;
  if (props.view === "settings") return <Settings system={data.system} />;
  return <Dashboard data={data} {...props} />;
}
