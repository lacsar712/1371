-- SQLite 支持中文：使用 UTF-8 编码（默认），连接时显式设置 PRAGMA
PRAGMA encoding = 'UTF-8';
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS student (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS semester (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year TEXT NOT NULL,
  semester_number INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0,
  UNIQUE(academic_year, semester_number)
);

CREATE TABLE IF NOT EXISTS course (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  credit INTEGER NOT NULL DEFAULT 0,
  capacity INTEGER NOT NULL DEFAULT 0,
  semester_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (semester_id) REFERENCES semester(id),
  UNIQUE(code, semester_id)
);

CREATE TABLE IF NOT EXISTS enrollment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  semester_id INTEGER NOT NULL,
  enrolled_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(student_id, course_id, semester_id),
  FOREIGN KEY (student_id) REFERENCES student(id),
  FOREIGN KEY (course_id) REFERENCES course(id),
  FOREIGN KEY (semester_id) REFERENCES semester(id)
);

CREATE INDEX IF NOT EXISTS idx_enrollment_student ON enrollment(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_course ON enrollment(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_semester ON enrollment(semester_id);

CREATE TABLE IF NOT EXISTS teacher (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  title TEXT,
  college TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS course_teacher (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  teacher_id INTEGER NOT NULL,
  UNIQUE(course_id, teacher_id),
  FOREIGN KEY (course_id) REFERENCES course(id),
  FOREIGN KEY (teacher_id) REFERENCES teacher(id)
);

CREATE INDEX IF NOT EXISTS idx_course_teacher_course ON course_teacher(course_id);
CREATE INDEX IF NOT EXISTS idx_course_teacher_teacher ON course_teacher(teacher_id);

CREATE TABLE IF NOT EXISTS college (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS major (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  college_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (college_id) REFERENCES college(id)
);

CREATE INDEX IF NOT EXISTS idx_major_college ON major(college_id);

CREATE TABLE IF NOT EXISTS class (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  major_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (major_id) REFERENCES major(id)
);

CREATE INDEX IF NOT EXISTS idx_class_major ON class(major_id);

ALTER TABLE student ADD COLUMN class_id INTEGER REFERENCES class(id);

CREATE TABLE IF NOT EXISTS classroom (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  building TEXT NOT NULL,
  room_number TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 0,
  is_multimedia INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_classroom_building ON classroom(building);

CREATE TABLE IF NOT EXISTS schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  classroom_id INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  start_period INTEGER NOT NULL,
  end_period INTEGER NOT NULL,
  semester_id INTEGER,
  FOREIGN KEY (course_id) REFERENCES course(id),
  FOREIGN KEY (classroom_id) REFERENCES classroom(id),
  FOREIGN KEY (semester_id) REFERENCES semester(id)
);

CREATE INDEX IF NOT EXISTS idx_schedule_course ON schedule(course_id);
CREATE INDEX IF NOT EXISTS idx_schedule_classroom ON schedule(classroom_id);
CREATE INDEX IF NOT EXISTS idx_schedule_day ON schedule(day_of_week);
CREATE INDEX IF NOT EXISTS idx_schedule_semester ON schedule(semester_id);

CREATE TABLE IF NOT EXISTS course_evaluation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  comment TEXT DEFAULT '',
  is_anonymous INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(student_id, course_id),
  FOREIGN KEY (student_id) REFERENCES student(id),
  FOREIGN KEY (course_id) REFERENCES course(id)
);

CREATE INDEX IF NOT EXISTS idx_eval_student ON course_evaluation(student_id);
CREATE INDEX IF NOT EXISTS idx_eval_course ON course_evaluation(course_id);
