"""
PostgreSQL Database Client for Upload Service
Handles all database interactions for marksheet processing
"""

import psycopg2
from psycopg2.extras import RealDictCursor, execute_values
from contextlib import contextmanager
import os
from typing import Dict, List, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


class DatabaseClient:
    """PostgreSQL Database Client"""
    
    def __init__(self):
        self.conn_params = {
            'host': os.getenv('POSTGRES_HOST', 'postgres'),
            'port': int(os.getenv('POSTGRES_PORT', 5432)),
            'database': os.getenv('POSTGRES_DB', 'edu'),
            'user': os.getenv('POSTGRES_USER', 'admin'),
            'password': os.getenv('POSTGRES_PASSWORD', 'password')
        }
    
    @contextmanager
    def get_connection(self):
        """Get database connection with context manager"""
        conn = psycopg2.connect(**self.conn_params)
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    
    def check_file_exists(self, file_hash: str) -> Optional[Dict]:
        """Check if file with this hash has been processed before"""
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, file_name, processing_status as status, created_at as uploaded_at, processed_at, error_details as error_message
                    FROM marksheets
                    WHERE file_hash = %s
                    ORDER BY created_at DESC
                    LIMIT 1
                """, (file_hash,))
                result = cur.fetchone()
                return dict(result) if result else None
    
    def _derive_marksheet_category(self, assessment_name: str) -> str:
        """Derive marksheet category from assessment name."""
        return 'LAB' if 'lab' in assessment_name.lower() else 'THEORY'

    def create_marksheet_record(
        self,
        course_id: str,
        assessment_name: str,
        file_name: str,
        file_hash: str,
        table_name: str,
        columns: List[str],
        row_count: int
    ) -> str:
        """Create new marksheet record and return its ID"""
        import json
        category = self._derive_marksheet_category(assessment_name)
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    INSERT INTO marksheets (
                        course_id, assessment_name, file_name, file_hash,
                        table_name, columns, row_count, marksheet_category,
                        processing_status, created_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, 'processing', NOW()
                    ) RETURNING id
                """, (
                    course_id, assessment_name, file_name, file_hash,
                    table_name, json.dumps(columns), row_count, category
                ))
                result = cur.fetchone()
                return result['id']
    
    def update_marksheet_status(
        self,
        marksheet_id: str,
        status: str,
        error_message: Optional[str] = None
    ):
        """Update marksheet processing status"""
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE marksheets
                    SET processing_status = %s,
                        processed_at = CASE WHEN %s = 'completed' THEN NOW() ELSE processed_at END,
                        error_details = %s,
                        updated_at = NOW()
                    WHERE id = %s
                """, (status, status, error_message, marksheet_id))
    
    def get_or_create_assessment(
        self,
        course_id: str,
        assessment_name: str,
        assessment_type: str,
        max_marks: int
    ) -> str:
        """Get existing assessment or create new one"""
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Check if assessment exists
                cur.execute("""
                    SELECT id FROM assessments
                    WHERE course_id = %s AND name = %s
                """, (course_id, assessment_name))
                
                result = cur.fetchone()
                if result:
                    return result['id']
                
                # Create new assessment
                cur.execute("""
                    INSERT INTO assessments (
                        course_id, name, type, max_marks, weightage,
                        assessment_date, created_at, updated_at
                    ) VALUES (
                        %s, %s, %s, %s, 20, NOW(), NOW(), NOW()
                    ) RETURNING id
                """, (course_id, assessment_name, assessment_type, max_marks))
                
                result = cur.fetchone()
                return result['id']
    
    def bulk_insert_student_scores(
        self,
        assessment_id: str,
        scores: List[Dict]
    ):
        """Bulk insert student scores with ON CONFLICT handling"""
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                # Prepare data for bulk insert
                values = [
                    (
                        assessment_id,
                        score['student_id'],
                        score['column_name'],
                        score['co_number'],
                        score['marks_obtained'],
                        score['max_marks']
                    )
                    for score in scores
                ]

                # Bulk insert with ON CONFLICT
                execute_values(
                    cur,
                    """
                    INSERT INTO student_scores (
                        assessment_id, student_id,
                        column_name, co_number, marks_obtained, max_marks,
                        created_at, updated_at
                    ) VALUES %s
                    ON CONFLICT (student_id, assessment_id, column_name)
                    DO UPDATE SET
                        marks_obtained = EXCLUDED.marks_obtained,
                        max_marks = EXCLUDED.max_marks,
                        updated_at = NOW()
                    """,
                    values,
                    template="""
                    (%s, %s, %s, %s, %s, %s, NOW(), NOW())
                    """
                )
    
    def bulk_insert_raw_marks_columns(
        self,
        assessment_id: str,
        columns: List[Dict]
    ):
        """Bulk insert raw marks column metadata"""
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                values = [
                    (
                        assessment_id,
                        col['column_name'],
                        col['co_number'],
                        col['max_marks'],
                        idx
                    )
                    for idx, col in enumerate(columns)
                ]

                execute_values(
                    cur,
                    """
                    INSERT INTO raw_marks_columns (
                        assessment_id, column_name, co_number, max_marks, column_order,
                        created_at
                    ) VALUES %s
                    ON CONFLICT (assessment_id, column_name)
                    DO UPDATE SET
                        co_number = EXCLUDED.co_number,
                        max_marks = EXCLUDED.max_marks,
                        column_order = EXCLUDED.column_order
                    """,
                    values,
                    template="(%s, %s, %s, %s, %s, NOW())"
                )
    
    def get_students_by_course(self, course_id: str) -> List[Dict]:
        """Get all students enrolled in a course"""
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT u.id, u.usn, u.name
                    FROM users u
                    JOIN students_courses sc ON u.id = sc.student_id
                    WHERE sc.course_id = %s AND u.role = 'student'
                    ORDER BY u.usn
                """, (course_id,))
                return [dict(row) for row in cur.fetchall()]
    
    def verify_course_exists(self, course_id: str) -> bool:
        """Verify course exists"""
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT EXISTS(SELECT 1 FROM courses WHERE id = %s)",
                    (course_id,)
                )
                return cur.fetchone()[0]

    def create_marksheet_table(self, table_name: str, columns: List[str]):
        """Create a dynamic table to store marksheet data"""
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                # Drop if exists and create fresh
                cur.execute(f'DROP TABLE IF EXISTS "{table_name}"')

                # Create column definitions
                col_defs = ', '.join([f'"{col}" TEXT' for col in columns])

                # Create table
                create_sql = f'CREATE TABLE "{table_name}" ({col_defs})'
                cur.execute(create_sql)
                logger.info(f"Created table: {table_name}")

    def insert_marksheet_data(self, table_name: str, data: List[Dict]):
        """Insert data into dynamic marksheet table using raw SQL"""
        from psycopg2.extras import execute_values

        if not data:
            return

        with self.get_connection() as conn:
            with conn.cursor() as cur:
                # Get column names from first row
                columns = list(data[0].keys())

                # Prepare values for bulk insert
                values = []
                for row in data:
                    row_values = [row.get(col) for col in columns]
                    values.append(tuple(row_values))

                # Build INSERT query
                col_names = ', '.join([f'"{col}"' for col in columns])
                placeholders = ', '.join(['%s'] * len(columns))

                # Use execute_values for efficient bulk insert
                insert_query = f'INSERT INTO "{table_name}" ({col_names}) VALUES %s'
                execute_values(cur, insert_query, values)

                logger.info(f"Inserted {len(data)} rows into {table_name}")

    def auto_enroll_students(self, course_id: str, students_data: List[Dict]) -> Dict:
        """
        Auto-enroll students from marksheet
        Creates user accounts if they don't exist and enrolls them in the course
        Returns: {'created': count, 'enrolled': count, 'already_enrolled': count}
        """
        import bcrypt

        created = 0
        enrolled = 0
        already_enrolled = 0

        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                for student in students_data:
                    usn = student['usn']
                    name = student.get('name', usn)

                    # Check if user exists
                    cur.execute("SELECT id FROM users WHERE usn = %s", (usn,))
                    user = cur.fetchone()

                    if not user:
                        # Create user with default password (usn)
                        default_password = usn.lower()
                        password_hash = bcrypt.hashpw(
                            default_password.encode('utf-8'),
                            bcrypt.gensalt()
                        ).decode('utf-8')

                        # Email must be lowercase to match login normalization
                        student_email = f"{usn.lower()}@dsce.edu.in"

                        cur.execute("""
                            INSERT INTO users (email, password_hash, role, name, usn, department)
                            VALUES (%s, %s, 'student', %s, %s, 'AI')
                            RETURNING id
                        """, (student_email, password_hash, name, usn))

                        user_id = cur.fetchone()['id']
                        created += 1
                        logger.info(f"Created student account: {usn}")
                    else:
                        user_id = user['id']

                    # Check if already enrolled
                    cur.execute("""
                        SELECT id FROM students_courses
                        WHERE student_id = %s AND course_id = %s
                    """, (user_id, course_id))

                    if not cur.fetchone():
                        # Enroll student
                        cur.execute("""
                            INSERT INTO students_courses (student_id, course_id, status)
                            VALUES (%s, %s, 'active')
                        """, (user_id, course_id))
                        enrolled += 1
                        logger.info(f"Enrolled student: {usn} in course")
                    else:
                        already_enrolled += 1

        return {
            'created': created,
            'enrolled': enrolled,
            'already_enrolled': already_enrolled,
            'total': len(students_data)
        }


# Singleton instance
db_client = DatabaseClient()
