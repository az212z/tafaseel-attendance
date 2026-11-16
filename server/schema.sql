CREATE TABLE IF NOT EXISTS attendance_students (
 student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
 guardian_mobile TEXT NOT NULL DEFAULT '',
 sms_consent_at TEXT,
 pin_hash TEXT,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attendance_sessions (
 id TEXT PRIMARY KEY,
 cohort_id INTEGER NOT NULL REFERENCES cohorts(id),
 title TEXT NOT NULL,
 starts_at TEXT NOT NULL,
 ends_at TEXT NOT NULL,
 token TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','cancelled')),
 created_by TEXT REFERENCES users(id),
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS attendance_session_time ON attendance_sessions(status,starts_at);
CREATE TABLE IF NOT EXISTS attendance_roster (
 session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
 student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 registration_id TEXT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
 checked_in TEXT,
 checked_out TEXT,
 excused INTEGER NOT NULL DEFAULT 0 CHECK(excused IN (0,1)),
 method TEXT,
 note TEXT NOT NULL DEFAULT '',
 PRIMARY KEY(session_id,student_id)
);
CREATE TABLE IF NOT EXISTS attendance_messages (
 id TEXT PRIMARY KEY,
 session_id TEXT NOT NULL,
 student_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','blocked','sending','submitted','failed','unknown','cancelled','expired')),
 reason TEXT NOT NULL DEFAULT '',
 recipient TEXT NOT NULL DEFAULT '',
 body TEXT NOT NULL DEFAULT '',
 provider_id TEXT,
 attempts INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(session_id,student_id),
 FOREIGN KEY(session_id,student_id) REFERENCES attendance_roster(session_id,student_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS attendance_messages_pending ON attendance_messages(status,created_at);
-- Keep the main application's permanent student deletion complete for attendance too.
CREATE TRIGGER IF NOT EXISTS attendance_student_audit_cleanup BEFORE DELETE ON students
BEGIN
 DELETE FROM audit WHERE action LIKE 'attendance.%' AND (entity=OLD.id OR json_extract(detail,'$.student_id')=OLD.id);
END;
