"""
FastAPI Upload Service - Marksheet Processing
Handles CSV/XLSX upload, parsing, validation, and storage
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import tempfile
import os
from pathlib import Path
import logging
from typing import Optional
import json

from src.parser.csv_parser import marksheet_parser
from src.validators.schema_validator import schema_validator
from src.storage.db_client import db_client
from src.models.schemas import (
    UploadResponse,
    MarksheetMetadata,
    UpdateCOMappingsRequest,
    HealthResponse,
    ErrorResponse
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Upload Service API",
    description="Marksheet CSV/XLSX Processing Service for OBE Attainment System",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    try:
        # Test database connection
        with db_client.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        db_connected = True
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        db_connected = False

    return HealthResponse(
        status="healthy" if db_connected else "unhealthy",
        version="1.0.0",
        database_connected=db_connected
    )


@app.post("/upload")
async def upload_legacy(
    file: UploadFile = File(..., description="CSV or XLSX marksheet file"),
    courseId: str = Form(..., description="Course ID"),
    assessmentName: str = Form(..., description="Assessment name")
):
    """
    Legacy upload endpoint - REFACTORED with all new features
    - Creates dynamic table for viewing
    - Auto-enrolls students from marksheet
    - Saves marksheet record
    - Processes scores for attainment calculation
    """
    import pandas as pd
    import re
    import hashlib
    import numpy as np

    temp_file_path = None

    try:
        logger.info(f"📤 Starting upload: {file.filename} for course {courseId}, assessment {assessmentName}")

        # Save uploaded file temporarily
        suffix = Path(file.filename).suffix.lower()
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            temp_file_path = tmp.name

        # Calculate file hash for idempotency
        file_hash = hashlib.sha256(content).hexdigest()

        # Check if already processed
        existing = db_client.check_file_exists(file_hash)
        if existing and existing['status'] == 'completed':
            logger.info(f"✅ File already processed: {file_hash}")
            return {
                "success": True,
                "message": f"File already processed on {existing['uploaded_at']}",
                "already_processed": True,
                "table_name": existing.get('table_name'),
                "data": existing
            }

        # Read file
        file_type = marksheet_parser.detect_file_type(temp_file_path)
        df = marksheet_parser.read_file(temp_file_path, file_type)

        logger.info(f"📊 Read {len(df)} rows and {len(df.columns)} columns")
        logger.info(f"📋 Columns: {list(df.columns)}")

        # Fix multi-row header format (COs mapped → Q1A, Q1B, etc.)
        df_fixed, fixed_q_columns = marksheet_parser.fix_multirow_header(df)
        if fixed_q_columns:
            logger.info(f"🔧 Multi-row header fixed. Q-columns: {fixed_q_columns}")
            df = df_fixed

        # Generate table name
        safe_course = re.sub(r'[^a-zA-Z0-9]', '', courseId.lower())
        safe_assessment = re.sub(r'[^a-zA-Z0-9]', '', assessmentName.lower())
        table_name = f"{safe_course}_marks_{safe_assessment}marks"

        logger.info(f"🗃️ Creating table: {table_name}")

        # Create dynamic table using helper function
        db_client.create_marksheet_table(table_name, list(df.columns))

        # Insert all raw data
        db_client.insert_marksheet_data(table_name, df.to_dict('records'))

        logger.info(f"✅ Created and populated table {table_name} with {len(df)} rows")

        # AUTO-ENROLL STUDENTS
        logger.info("👥 Extracting student data for auto-enrollment")
        students_data = []
        for _, row in df.iterrows():
            usn_val = row.get('USN', '')
            name_val = row.get('STUDENT NAME', '')

            # Handle NaN and convert to string
            if pd.isna(usn_val) or usn_val == '':
                continue

            usn = str(usn_val).strip()
            name = str(name_val).strip() if not pd.isna(name_val) else usn

            # Skip header rows and invalid USNs
            if usn and usn.upper() != 'USN' and len(usn) > 0:
                students_data.append({'usn': usn, 'name': name})
                logger.debug(f"  Found student: {usn} - {name}")

        logger.info(f"🎓 Found {len(students_data)} students to enroll")

        # Auto-enroll students
        enrollment_result = db_client.auto_enroll_students(courseId, students_data)
        logger.info(f"✅ Enrollment complete: {enrollment_result}")

        # Get or create assessment for quick-upload path
        cie_max_marks = 50
        logger.info(f"🎯 [Quick Upload] Creating/using assessment: name={assessmentName}, type=CIE, max_marks={cie_max_marks}")
        assessment_id = db_client.get_or_create_assessment(
            courseId, assessmentName, 'CIE', cie_max_marks
        )
        logger.info(f"📝 Using assessment ID: {assessment_id}")

        # Create marksheet record in database
        marksheet_id = db_client.create_marksheet_record(
            course_id=courseId,
            assessment_name=assessmentName,
            file_name=file.filename,
            file_hash=file_hash,
            table_name=table_name,
            columns=list(df.columns),
            row_count=len(df)
        )
        logger.info(f"💾 Created marksheet record: {marksheet_id}")

        # Extract Q-columns for attainment calculation
        q_columns = marksheet_parser.extract_q_columns(df)
        co_mappings = {}
        score_records = []

        logger.info(f"🔍 Extracted {len(q_columns)} Q-columns: {q_columns}")

        if q_columns:
            # Extract student scores
            scores_data = marksheet_parser.extract_student_scores(df, q_columns, co_mappings)

            # Get students in course (now includes newly enrolled ones)
            students = db_client.get_students_by_course(courseId)
            usn_to_id = {s['usn']: s['id'] for s in students}

            logger.info(f"👨‍🎓 Found {len(students)} enrolled students")

            # Infer per-column max marks from actual data.
            # Each main question in a CIE paper is 10 marks; sub-questions
            # (Q1A + Q1B) together make up that 10.  We infer individual
            # sub-question maxes by scanning each column for its highest value.
            col_max_marks = marksheet_parser.infer_max_marks_from_data(df, q_columns)
            q_groups = marksheet_parser.group_q_columns_by_question_number(q_columns)
            logger.info(f"📊 CIE config: total_max_marks={cie_max_marks}, "
                        f"q_columns={q_columns}, main_questions={list(q_groups.keys())}")

            # For any column where inference returned 0 (no data), fall back to
            # dividing 10 marks equally among sub-columns in the same group.
            for q_num, group_cols in q_groups.items():
                if q_num == 0:
                    continue
                n = len(group_cols)
                for col in group_cols:
                    if col_max_marks.get(col, 0) == 0:
                        col_max_marks[col] = round(10.0 / n, 2)

            # Prepare score records
            score_records = []
            missing_students = []
            for score in scores_data:
                student_id = usn_to_id.get(score['usn'])
                if not student_id:
                    missing_students.append(score['usn'])
                    continue

                score_records.append({
                    'student_id': student_id,
                    'column_name': score['column_name'],
                    'co_number': score['co_number'],
                    'marks_obtained': score['marks_obtained'],
                    'max_marks': col_max_marks.get(score['column_name'], 10.0)
                })

            if missing_students:
                logger.warning(f"⚠️ Missing students: {missing_students}")

            # Bulk insert scores
            if score_records:
                db_client.bulk_insert_student_scores(assessment_id, score_records)
                logger.info(f"✅ Inserted {len(score_records)} scores")

                # Insert column metadata with correct per-column max marks
                column_metadata = [
                    {
                        'column_name': q_col,
                        'co_number': co_mappings.get(q_col, 1),
                        'max_marks': col_max_marks.get(q_col, 10.0)
                    }
                    for q_col in q_columns
                ]
                db_client.bulk_insert_raw_marks_columns(assessment_id, column_metadata)

        # Update marksheet status
        db_client.update_marksheet_status(marksheet_id, 'completed')

        # Prepare preview data
        df_clean = df.replace({np.nan: None})
        preview_data = df_clean.head(10).to_dict('records')

        logger.info(f"🎉 Upload complete!")

        return {
            "success": True,
            "message": f"✅ Successfully uploaded {file.filename}. Created {enrollment_result['created']} accounts, enrolled {enrollment_result['enrolled']} students.",
            "table_name": table_name,
            "marksheet_id": marksheet_id,
            "columns": list(df.columns),
            "row_count": len(df),
            "file_name": file.filename,
            "preview": preview_data,
            "enrollment": enrollment_result,
            "assessment_id": assessment_id,
            "scores_processed": len(score_records) if q_columns else 0,
            "already_processed": False
        }

    except Exception as e:
        logger.error(f"❌ Upload error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload file: {str(e)}"
        )
    finally:
        # Clean up temp file
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except:
                pass


@app.get("/table/{table_name}")
async def get_table_data(table_name: str):
    """Fetch all data from a dynamically created table"""
    import pandas as pd

    try:
        with db_client.get_connection() as conn:
            # Safely query the table
            query = f'SELECT * FROM "{table_name}"'
            df = pd.read_sql(query, conn)

            # Convert to list of dicts
            data = df.to_dict('records')
            columns = df.columns.tolist()

            return {
                "success": True,
                "table_name": table_name,
                "columns": columns,
                "data": data,
                "row_count": len(data)
            }
    except Exception as e:
        logger.error(f"Error fetching table data: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch table data: {str(e)}"
        )


@app.post("/upload-marksheet", response_model=UploadResponse)
async def upload_marksheet(
    file: UploadFile = File(..., description="CSV or XLSX marksheet file"),
    course_id: str = Form(..., description="Course ID"),
    assessment_name: str = Form(..., description="Assessment name (e.g., CIE-1)"),
    assessment_type: str = Form("CIE", description="Assessment type (CIE, SEE, CES)"),
    max_marks: int = Form(50, description="Maximum marks for assessment (CIE default = 50)")
):
    """
    Upload and process marksheet file
    - Validates file format and structure
    - Extracts Q-columns and CO mappings
    - Stores data in database with idempotency (using file hash)
    """
    temp_file_path = None
    
    try:
        # Validate course exists
        if not db_client.verify_course_exists(course_id):
            raise HTTPException(status_code=404, detail=f"Course {course_id} not found")
        
        # Save uploaded file temporarily
        suffix = Path(file.filename).suffix.lower()
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            temp_file_path = tmp.name
        
        file_size = len(content)
        
        # Parse marksheet
        logger.info(f"Parsing marksheet: {file.filename}")
        df, q_columns, co_mappings, file_type, file_hash = marksheet_parser.parse_marksheet(temp_file_path)
        
        # Check if file already processed (idempotency)
        existing = db_client.check_file_exists(file_hash)
        if existing and existing['status'] == 'completed':
            logger.info(f"File already processed: {file_hash}")
            return UploadResponse(
                success=True,
                message=f"File already processed on {existing['uploaded_at']}",
                marksheet_id=existing['id'],
                file_hash=file_hash,
                already_processed=True,
                data={
                    'uploaded_at': str(existing['uploaded_at']),
                    'status': existing['status']
                }
            )
        
        # Validate marksheet
        logger.info("Validating marksheet schema")
        is_valid, errors = schema_validator.validate_marksheet(df, q_columns, file_size)
        if not is_valid:
            raise HTTPException(
                status_code=400,
                detail={"message": "Validation failed", "errors": errors}
            )
        
        # Get or create assessment
        logger.info(f"🎯 Creating/using assessment: name={assessment_name}, type={assessment_type}, max_marks={max_marks}")
        assessment_id = db_client.get_or_create_assessment(
            course_id, assessment_name, assessment_type, max_marks
        )
        logger.info(f"Using assessment ID: {assessment_id}")
        
        # Generate table name for storing marksheet data
        import re
        sanitized_name = re.sub(r'[^a-z0-9_]', '_', assessment_name.lower())
        table_name = f"marksheet_{sanitized_name}_{course_id[:8]}"

        # Create dynamic table and insert raw data
        logger.info(f"Creating dynamic table: {table_name}")
        db_client.create_marksheet_table(table_name, list(df.columns))
        db_client.insert_marksheet_data(table_name, df.to_dict('records'))

        # Create marksheet record
        marksheet_id = db_client.create_marksheet_record(
            course_id=course_id,
            assessment_name=assessment_name,
            file_name=file.filename,
            file_hash=file_hash,
            table_name=table_name,
            columns=list(df.columns),
            row_count=len(df)
        )
        logger.info(f"Created marksheet record: {marksheet_id}")

        # Extract student data for auto-enrollment
        logger.info("Extracting student information")
        students_data = []
        for _, row in df.iterrows():
            usn = str(row.get('USN', '')).strip()
            name = str(row.get('STUDENT NAME', usn)).strip()
            if usn and usn.upper() != 'USN':  # Skip header rows
                students_data.append({'usn': usn, 'name': name})

        # Auto-enroll students
        logger.info(f"Auto-enrolling {len(students_data)} students")
        enrollment_result = db_client.auto_enroll_students(course_id, students_data)
        logger.info(f"Enrollment result: {enrollment_result}")

        # Extract student scores
        logger.info("Extracting student scores")
        scores = marksheet_parser.extract_student_scores(df, q_columns, co_mappings)
        
        # Map USN to student_id
        students = db_client.get_students_by_course(course_id)
        usn_to_id = {s['usn']: s['id'] for s in students}
        
        # Infer per-column max marks from actual data so that sub-questions
        # (Q1A, Q1B) get their real individual maxes rather than an equal split
        # of the total assessment max across all columns.
        col_max_marks = marksheet_parser.infer_max_marks_from_data(df, q_columns)
        q_groups = marksheet_parser.group_q_columns_by_question_number(q_columns)

        for q_num, group_cols in q_groups.items():
            if q_num == 0:
                continue
            n = len(group_cols)
            for col in group_cols:
                if col_max_marks.get(col, 0) == 0:
                    col_max_marks[col] = round(10.0 / n, 2)

        # Prepare score records with student IDs
        score_records = []
        missing_students = set()

        for score in scores:
            student_id = usn_to_id.get(score['usn'])
            if not student_id:
                missing_students.add(score['usn'])
                continue

            score_records.append({
                'student_id': student_id,
                'column_name': score['column_name'],
                'co_number': score['co_number'],
                'marks_obtained': score['marks_obtained'],
                'max_marks': col_max_marks.get(score['column_name'], 10.0)
            })

        if missing_students:
            logger.warning(f"Students not found in course: {missing_students}")

        # Bulk insert student scores
        logger.info(f"Inserting {len(score_records)} score records")
        db_client.bulk_insert_student_scores(
            assessment_id, score_records
        )

        # Insert raw marks column metadata with correct per-column max marks
        column_metadata = [
            {
                'column_name': q_col,
                'co_number': co_mappings.get(q_col),
                'max_marks': col_max_marks.get(q_col, 10.0)
            }
            for q_col in q_columns
        ]
        db_client.bulk_insert_raw_marks_columns(assessment_id, column_metadata)
        
        # Update marksheet status
        db_client.update_marksheet_status(marksheet_id, 'completed')
        
        logger.info(f"Successfully processed marksheet: {marksheet_id}")
        
        return UploadResponse(
            success=True,
            message=f"Successfully processed {file.filename}. Created {enrollment_result['created']} accounts, enrolled {enrollment_result['enrolled']} students.",
            marksheet_id=marksheet_id,
            file_hash=file_hash,
            already_processed=False,
            data={
                'assessment_id': assessment_id,
                'table_name': table_name,
                'q_columns': q_columns,
                'co_mappings': co_mappings,
                'student_count': len(set(s['student_id'] for s in score_records)),
                'total_scores': len(score_records),
                'missing_students': list(missing_students),
                'enrollment': enrollment_result
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing marksheet: {e}", exc_info=True)
        
        # Update marksheet status if created
        if 'marksheet_id' in locals():
            try:
                db_client.update_marksheet_status(
                    marksheet_id, 'failed', str(e)
                )
            except:
                pass
        
        raise HTTPException(
            status_code=500,
            detail=f"Error processing marksheet: {str(e)}"
        )
    finally:
        # Clean up temporary file
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except:
                pass


@app.get("/marksheet/{marksheet_id}", response_model=MarksheetMetadata)
async def get_marksheet_metadata(marksheet_id: str):
    """Get marksheet metadata by ID"""
    try:
        with db_client.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        id, file_name, file_hash, file_size, file_type,
                        q_columns, co_mappings, status, uploaded_at,
                        (SELECT COUNT(*) FROM student_scores WHERE marksheet_id = %s) as total_scores,
                        (SELECT COUNT(DISTINCT student_id) FROM student_scores WHERE marksheet_id = %s) as student_count
                    FROM marksheets
                    WHERE id = %s
                """, (marksheet_id, marksheet_id, marksheet_id))
                
                result = cur.fetchone()
                if not result:
                    raise HTTPException(status_code=404, detail="Marksheet not found")
                
                return MarksheetMetadata(
                    marksheet_id=result[0],
                    file_name=result[1],
                    file_hash=result[2],
                    file_size=result[3],
                    file_type=result[4],
                    q_columns=result[5],
                    co_mappings=result[6],
                    status=result[7],
                    uploaded_at=result[8],
                    total_scores=result[9],
                    student_count=result[10]
                )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving marksheet: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/marksheet/{marksheet_id}/update-co-mappings")
async def update_co_mappings(
    marksheet_id: str,
    request: UpdateCOMappingsRequest
):
    """Update CO mappings for a marksheet and reprocess"""
    try:
        # Update marksheet CO mappings
        co_mappings_dict = {m.column_name: m.co_number for m in request.co_mappings}
        
        with db_client.get_connection() as conn:
            with conn.cursor() as cur:
                # Update marksheet
                cur.execute("""
                    UPDATE marksheets
                    SET co_mappings = %s, updated_at = NOW()
                    WHERE id = %s
                """, (json.dumps(co_mappings_dict), marksheet_id))
                
                # Get assessment_id
                cur.execute(
                    "SELECT assessment_id FROM marksheets WHERE id = %s",
                    (marksheet_id,)
                )
                result = cur.fetchone()
                if not result:
                    raise HTTPException(status_code=404, detail="Marksheet not found")
                
                assessment_id = result[0]
                
                # Update student_scores
                for mapping in request.co_mappings:
                    cur.execute("""
                        UPDATE student_scores
                        SET co_number = %s, updated_at = NOW()
                        WHERE marksheet_id = %s AND column_name = %s
                    """, (mapping.co_number, marksheet_id, mapping.column_name))
                
                # Update raw_marks_columns
                for mapping in request.co_mappings:
                    cur.execute("""
                        UPDATE raw_marks_columns
                        SET co_number = %s, updated_at = NOW()
                        WHERE assessment_id = %s AND column_name = %s
                    """, (mapping.co_number, assessment_id, mapping.column_name))
        
        return {
            "success": True,
            "message": f"Updated CO mappings for {len(request.co_mappings)} columns"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating CO mappings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/course/{course_id}/marksheets")
async def list_course_marksheets(course_id: str):
    """List all marksheets for a course"""
    try:
        with db_client.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        m.id, m.file_name, m.file_hash, m.status,
                        m.uploaded_at, m.processed_at,
                        a.name as assessment_name, a.type as assessment_type,
                        (SELECT COUNT(DISTINCT student_id) FROM student_scores WHERE marksheet_id = m.id) as student_count
                    FROM marksheets m
                    JOIN assessments a ON m.assessment_id = a.id
                    WHERE m.course_id = %s
                    ORDER BY m.uploaded_at DESC
                """, (course_id,))
                
                results = cur.fetchall()
                
                return {
                    "success": True,
                    "course_id": course_id,
                    "total_marksheets": len(results),
                    "marksheets": [
                        {
                            "marksheet_id": r[0],
                            "file_name": r[1],
                            "file_hash": r[2],
                            "status": r[3],
                            "uploaded_at": str(r[4]),
                            "processed_at": str(r[5]) if r[5] else None,
                            "assessment_name": r[6],
                            "assessment_type": r[7],
                            "student_count": r[8]
                        }
                        for r in results
                    ]
                }
    except Exception as e:
        logger.error(f"Error listing marksheets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
