"""
CSV/XLSX Parser for Marksheets
Detects file type, parses data, extracts question columns
"""

import pandas as pd
import hashlib
from typing import Dict, List, Tuple, Optional
import re
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class MarksheetParser:
    """Parse CSV/XLSX marksheet files"""
    
    # Column patterns to identify Q-columns (supports Q1, Q1a, Q1A, Q1b, Q1B sub-questions)
    Q_COLUMN_PATTERNS = [
        r'^Q\d+[a-zA-Z]?$',  # Q1, Q2a, Q3b, Q1A, Q1B, etc.
        r'^q\d+[a-zA-Z]?$',  # q1, q2a, q1b, etc.
        r'^\d+[a-zA-Z]?$',   # 1, 2a, 3b, etc.
    ]
    
    # Columns to ignore
    IGNORE_COLUMNS = [
        'usn', 'student name', 'name', 'roll no', 'roll number',
        'total', 'grand total', 'percentage', 'grade', 'remarks',
        'cos mapped', 'co mapped', 'cos', 'co', "co's mapped", 'sl no', 'slno'
    ]
    
    @staticmethod
    def compute_file_hash(file_path: str) -> str:
        """Compute SHA256 hash of file for idempotency"""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    
    @staticmethod
    def detect_file_type(file_path: str) -> str:
        """Detect if file is CSV or XLSX"""
        suffix = Path(file_path).suffix.lower()
        if suffix == '.csv':
            return 'csv'
        elif suffix in ['.xlsx', '.xls']:
            return 'xlsx'
        else:
            raise ValueError(f"Unsupported file type: {suffix}")
    
    @staticmethod
    def read_file(file_path: str, file_type: str) -> pd.DataFrame:
        """Read CSV or XLSX file into DataFrame"""
        try:
            if file_type == 'csv':
                # Try multiple encodings
                for encoding in ['utf-8', 'latin-1', 'cp1252']:
                    try:
                        df = pd.read_csv(file_path, encoding=encoding)
                        break
                    except UnicodeDecodeError:
                        continue
                else:
                    raise ValueError("Could not read CSV with any supported encoding")
            else:
                df = pd.read_excel(file_path)
            
            # Clean column names
            df.columns = df.columns.str.strip()
            
            return df
        except Exception as e:
            logger.error(f"Error reading file: {e}")
            raise ValueError(f"Error reading file: {e}")
    
    @classmethod
    def fix_multirow_header(cls, df: pd.DataFrame):
        """
        Detect and fix multi-row header format.
        Some CIE CSV files look like:
          header row:  Sl No., USN, STUDENT NAME, COs mapped, COs mapped, ...
          data row 0:  Sl No., USN, STUDENT NAME, CO1, CO1, CO3, ...
          data row 1:  Sl No., USN, STUDENT NAME, Q1A, Q1B, Q2A, ...
          data row 2+: actual student marks

        Renames "COs mapped.N" columns to the actual Q-names found in the data row,
        removes the non-student header rows, and returns (df_fixed, q_columns).
        If no multi-row header is detected returns (df_unchanged, []).
        """
        rename_map = {}   # { "COs mapped.1": "Q1A", ... }
        q_row_idx = None

        for idx in range(min(4, len(df))):
            row = df.iloc[idx]
            candidate = {}
            for col_name in df.columns:
                val = str(row[col_name]).strip()
                if not val or val.upper() in ['USN', 'STUDENT NAME', 'SL NO', 'SLNO', 'NAN', '']:
                    continue
                for pattern in cls.Q_COLUMN_PATTERNS:
                    if re.match(pattern, val, re.IGNORECASE):
                        candidate[col_name] = val.upper()
                        break
            if len(candidate) >= 5:
                q_row_idx = idx
                rename_map = candidate
                break

        if not rename_map:
            return df, []

        df_fixed = df.rename(columns=rename_map)
        # Remove all rows up to and including the Q-name row
        df_fixed = df_fixed.iloc[q_row_idx + 1:].reset_index(drop=True)
        q_columns = list(rename_map.values())  # ["Q1A", "Q1B", ...]
        logger.info(f"Fixed multi-row header: renamed {len(rename_map)} columns, {len(df_fixed)} data rows remain")
        return df_fixed, q_columns

    @classmethod
    def extract_q_columns(cls, df: pd.DataFrame) -> List[str]:
        """
        Extract question columns (Q1, Q2, Q3, etc.)
        Handles multi-row headers where Q-columns are in row 2 or 3
        """
        q_columns = []

        # First, try to find Q-columns in the column headers themselves
        for col in df.columns:
            col_lower = col.lower().strip()

            # Skip ignore columns
            if col_lower in cls.IGNORE_COLUMNS:
                continue

            # Check if matches Q-column pattern
            for pattern in cls.Q_COLUMN_PATTERNS:
                if re.match(pattern, col.strip(), re.IGNORECASE):
                    q_columns.append(col)
                    break

        # If we found Q-columns in headers, return them
        if q_columns:
            logger.info(f"Extracted {len(q_columns)} Q-columns from headers: {q_columns}")
            return q_columns

        # Otherwise, check first 3 rows for Q-column names (multi-row header format)
        logger.info("No Q-columns in headers, checking first 3 rows for Q-column names")

        for idx in range(min(3, len(df))):
            row = df.iloc[idx]
            potential_q_cols = []

            for col_name in df.columns:
                # Skip ignore columns by name
                if col_name.lower().strip() in cls.IGNORE_COLUMNS:
                    continue

                val = str(row[col_name]).strip()

                # Skip empty or basic columns
                if not val or val.upper() in ['USN', 'STUDENT NAME', 'SLNO', 'SL NO', 'CO1', 'CO2', 'CO3', 'CO4', 'CO5', 'CO6', 'NAN', '']:
                    continue

                # Check if value matches Q-column pattern
                for pattern in cls.Q_COLUMN_PATTERNS:
                    if re.match(pattern, val, re.IGNORECASE):
                        potential_q_cols.append(col_name)
                        break

            # If we found multiple Q-columns in this row, use it
            if len(potential_q_cols) > 5:  # At least 5 questions
                q_columns = potential_q_cols
                logger.info(f"Found {len(q_columns)} Q-columns in row {idx}: {q_columns}")
                break

        logger.info(f"Extracted {len(q_columns)} Q-columns: {q_columns}")
        return q_columns
    
    @staticmethod
    def extract_co_mappings_from_header(df: pd.DataFrame) -> Optional[Dict[str, int]]:
        """
        Try to extract CO mappings from header row
        Look for rows like: Q1 -> CO1, Q2 -> CO2, etc.
        """
        co_mappings = {}
        
        # Check first 3 rows for CO mapping information
        for idx in range(min(3, len(df))):
            row = df.iloc[idx]
            
            # Check if this row contains CO mapping info
            if any(str(val).strip().upper().startswith('CO') for val in row):
                for col_name in df.columns:
                    val = str(row[col_name]).strip().upper()
                    
                    # Extract CO number (CO1, CO2, etc.)
                    match = re.search(r'CO\s*(\d+)', val, re.IGNORECASE)
                    if match:
                        co_number = int(match.group(1))
                        co_mappings[col_name] = co_number
                
                # If we found mappings, remove this row
                if co_mappings:
                    logger.info(f"Found CO mappings in header row {idx}: {co_mappings}")
                    return co_mappings
        
        return None
    
    @classmethod
    def parse_marksheet(
        cls,
        file_path: str
    ) -> Tuple[pd.DataFrame, List[str], Dict[str, int], str, str]:
        """
        Parse marksheet file and extract:
        - DataFrame with student data
        - List of Q-columns
        - CO mappings (if present in header)
        - File type
        - File hash

        Returns: (df, q_columns, co_mappings, file_type, file_hash)
        """
        # Compute file hash for idempotency
        file_hash = cls.compute_file_hash(file_path)

        # Detect file type
        file_type = cls.detect_file_type(file_path)

        # Read file
        df = cls.read_file(file_path, file_type)

        logger.info(f"Read file with {len(df)} rows and {len(df.columns)} columns")

        # Extract CO mappings from header (if present)
        co_mappings_from_header = cls.extract_co_mappings_from_header(df)

        # Extract Q-columns (might be in headers or in row data)
        q_columns = cls.extract_q_columns(df)

        # Find the first row with actual student data (skip header rows)
        data_start_idx = 0
        for idx in range(min(5, len(df))):
            row_usn = str(df.iloc[idx].get('USN', '')).strip()

            # Check if this row has a valid USN (not header text)
            if row_usn and row_usn.upper() not in ['USN', 'STUDENT NAME', 'SL NO', 'CO1', 'CO2', 'CO3', 'CO4', 'CO5', 'CO6', 'Q1A', 'Q1B', 'NAN', '']:
                # This looks like actual student data
                if len(row_usn) > 5:  # USN should be reasonably long
                    data_start_idx = idx
                    logger.info(f"Found student data starting at row {idx}")
                    break

        # Remove header rows
        if data_start_idx > 0:
            df = df.iloc[data_start_idx:].reset_index(drop=True)
            logger.info(f"Removed {data_start_idx} header rows, {len(df)} data rows remain")

        # Use header mappings or empty dict
        co_mappings = co_mappings_from_header or {}

        logger.info(f"Final: {len(q_columns)} Q-columns, {len(co_mappings)} CO mappings, {len(df)} student rows")

        return df, q_columns, co_mappings, file_type, file_hash
    
    @staticmethod
    def group_q_columns_by_question_number(q_columns: List[str]) -> Dict[int, List[str]]:
        """
        Group sub-question columns by their parent question number.
        e.g. ['Q1A', 'Q1B', 'Q2A', 'Q2B', 'Q3'] -> {1: ['Q1A', 'Q1B'], 2: ['Q2A', 'Q2B'], 3: ['Q3']}
        Non-Q columns (AAT, QUIZ, lab cols) are grouped under key 0.
        """
        groups: Dict[int, List[str]] = {}
        for col in q_columns:
            match = re.match(r'^[Qq](\d+)', col.strip())
            if match:
                q_num = int(match.group(1))
                groups.setdefault(q_num, []).append(col)
            else:
                groups.setdefault(0, []).append(col)
        return groups

    @staticmethod
    def infer_max_marks_from_data(df: pd.DataFrame, q_columns: List[str]) -> Dict[str, float]:
        """
        Infer per-column max marks by scanning the data for each Q-column.
        Returns {col_name: inferred_max_marks}.
        Falls back to 10.0 if no valid numeric data found.
        """
        col_maxes: Dict[str, float] = {}
        for col in q_columns:
            if col not in df.columns:
                col_maxes[col] = 10.0
                continue
            series = pd.to_numeric(df[col], errors='coerce').dropna()
            if series.empty or series.max() == 0:
                col_maxes[col] = 0.0
            else:
                import math
                col_maxes[col] = math.ceil(series.max())
        return col_maxes

    @staticmethod
    def extract_student_scores(
        df: pd.DataFrame,
        q_columns: List[str],
        co_mappings: Dict[str, int]
    ) -> List[Dict]:
        """
        Extract individual student scores for each Q-column
        Returns list of score records
        """
        scores = []
        
        # Find USN column
        usn_col = None
        for col in df.columns:
            if col.upper().strip() in ['USN', 'STUDENT USN', 'ROLL NO', 'ROLL NUMBER']:
                usn_col = col
                break
        
        if not usn_col:
            raise ValueError("No USN column found in marksheet")
        
        logger.info(f"Using USN column: {usn_col}")
        
        # Process each row
        for idx, row in df.iterrows():
            usn = str(row[usn_col]).strip()
            
            # Skip empty or invalid USNs
            if not usn or usn.upper() in ['NAN', 'NONE', '']:
                continue
            
            # Extract scores for each Q-column
            for q_col in q_columns:
                marks = row[q_col]
                
                # Handle missing/invalid marks
                if pd.isna(marks) or marks == '':
                    marks_obtained = 0
                else:
                    try:
                        marks_obtained = float(marks)
                    except (ValueError, TypeError):
                        marks_obtained = 0
                
                # Get CO mapping (if available)
                co_number = co_mappings.get(q_col)
                
                scores.append({
                    'usn': usn,
                    'column_name': q_col,
                    'co_number': co_number,
                    'marks_obtained': marks_obtained
                })
        
        logger.info(f"Extracted {len(scores)} score records from {len(df)} students")
        return scores


# Singleton instance
marksheet_parser = MarksheetParser()
