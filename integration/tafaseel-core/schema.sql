CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','manager','viewer')),active INTEGER NOT NULL DEFAULT 1,auth_version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS programs(id TEXT PRIMARY KEY,title TEXT NOT NULL,short_title TEXT NOT NULL,sort_order INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS courses(slug TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,program_id TEXT NOT NULL REFERENCES programs(id),capacity INTEGER NOT NULL DEFAULT 20 CHECK(capacity=20),active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),sort_order INTEGER NOT NULL DEFAULT 1000,created_at TEXT NOT NULL,updated_at TEXT);
CREATE TABLE IF NOT EXISTS cohorts(id INTEGER PRIMARY KEY AUTOINCREMENT,course_slug TEXT NOT NULL REFERENCES courses(slug),number INTEGER NOT NULL,capacity INTEGER NOT NULL DEFAULT 20 CHECK(capacity=20),status TEXT NOT NULL DEFAULT 'collecting' CHECK(status IN ('collecting','running','completed')),created_at TEXT NOT NULL,started_at TEXT,completed_at TEXT,UNIQUE(course_slug,number));
CREATE UNIQUE INDEX IF NOT EXISTS one_collecting ON cohorts(course_slug) WHERE status='collecting';
CREATE TABLE IF NOT EXISTS students(id TEXT PRIMARY KEY,name TEXT NOT NULL,name_key TEXT NOT NULL,mobile TEXT NOT NULL,email TEXT NOT NULL DEFAULT '',city TEXT NOT NULL DEFAULT '',guardian TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,UNIQUE(mobile,name_key));
CREATE TABLE IF NOT EXISTS registrations(id TEXT PRIMARY KEY,reference TEXT NOT NULL UNIQUE,student_id TEXT NOT NULL REFERENCES students(id),course_slug TEXT REFERENCES courses(slug),course_title TEXT NOT NULL,cohort_id INTEGER REFERENCES cohorts(id),status TEXT NOT NULL CHECK(status IN ('registered','waitlist','cancelled')),contacted INTEGER NOT NULL DEFAULT 0 CHECK(contacted IN (0,1)),confirmed INTEGER NOT NULL DEFAULT 0 CHECK(confirmed IN (0,1)),note TEXT NOT NULL DEFAULT '',source TEXT NOT NULL,consent_at TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_registration ON registrations(student_id,cohort_id) WHERE status!='cancelled';
CREATE INDEX IF NOT EXISTS registration_cohort ON registrations(cohort_id,status,created_at);
CREATE INDEX IF NOT EXISTS registration_student ON registrations(student_id,created_at);
CREATE INDEX IF NOT EXISTS registration_course ON registrations(course_slug,created_at);
CREATE INDEX IF NOT EXISTS registration_date ON registrations(created_at);
CREATE TABLE IF NOT EXISTS registration_sequence(id INTEGER PRIMARY KEY CHECK(id=1),last_number INTEGER NOT NULL CHECK(typeof(last_number)='integer' AND last_number>=0));
CREATE TABLE IF NOT EXISTS registration_reference_aliases(reference TEXT PRIMARY KEY,registration_id TEXT NOT NULL UNIQUE REFERENCES registrations(id));
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT REFERENCES users(id),action TEXT NOT NULL,entity TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS visits(day TEXT NOT NULL,visitor TEXT NOT NULL,path TEXT NOT NULL,views INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(day,visitor,path));
CREATE TABLE IF NOT EXISTS limits(key TEXT NOT NULL,slot INTEGER NOT NULL,hits INTEGER NOT NULL,PRIMARY KEY(key,slot));

CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,event_key TEXT NOT NULL UNIQUE,kind TEXT NOT NULL CHECK(kind IN ('registration','cohort_full')),title TEXT NOT NULL,body TEXT NOT NULL,student_id TEXT REFERENCES students(id),cohort_id INTEGER REFERENCES cohorts(id),created_at TEXT NOT NULL,read_at TEXT);
CREATE INDEX IF NOT EXISTS notification_unread ON notifications(read_at,id);

CREATE TABLE IF NOT EXISTS registration_followups (
 registration_id TEXT PRIMARY KEY REFERENCES registrations(id),
 stage TEXT NOT NULL CHECK(stage IN ('new','contacted','awaiting','confirmed','declined')),
 due_at TEXT,
 note TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS followups_due ON registration_followups(due_at) WHERE due_at IS NOT NULL;
