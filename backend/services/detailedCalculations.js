import pool from '../config/db.js';

/**
 * DETAILED ATTAINMENT CALCULATIONS SERVICE
 * Auto-detects numeric question columns and performs vertical/horizontal analysis
 */

class DetailedCalculationsService {
  /**
   * OPTIONAL QUESTION LOGIC
   * Questions 1-2: Compulsory (always count)
   * Questions 3-4: Optional pair (student chooses one)
   * Questions 5-6: Optional pair (student chooses one)
   * Questions 7-8: Optional pair (student chooses one)
   */

  /**
   * Get question number from column name (e.g., "q3a" -> 3, "Q5A" -> 5)
   * Handles both strings and objects with columnName property
   */
  extractQuestionNumber(columnName) {
    // Handle objects with columnName property
    const name = typeof columnName === 'string' ? columnName : columnName?.columnName;
    if (!name || typeof name !== 'string') return null;

    // AAT and QUIZ are not exam questions - return null
    const nameUpper = name.toUpperCase();
    if (nameUpper === 'AAT' || nameUpper === 'QUIZ') return null;

    const match = name.match(/q(\d+)/i);
    return match ? parseInt(match[1]) : null;
  }

  /**
   * Check if a question is compulsory (Q1 or Q2)
   * AAT and QUIZ are always compulsory (single columns, not optional)
   */
  isCompulsoryQuestion(columnName) {
    const name = typeof columnName === 'string' ? columnName : columnName?.columnName;
    if (!name) return false;

    const nameUpper = name.toUpperCase();
    // AAT and QUIZ are compulsory (not part of optional pairs)
    if (nameUpper === 'AAT' || nameUpper === 'QUIZ') return true;

    const qNum = this.extractQuestionNumber(name);
    // If no Q-number (e.g. lab columns like Lab_CIE_30), treat as compulsory
    if (qNum === null) return true;
    return qNum === 1 || qNum === 2;
  }

  /**
   * Get the pair partner for optional questions
   * Q3 <-> Q4, Q5 <-> Q6, Q7 <-> Q8
   * AAT and QUIZ have no pairs
   */
  getOptionalPairPartner(columnName) {
    const name = typeof columnName === 'string' ? columnName : columnName?.columnName;
    if (!name) return null;

    const nameUpper = name.toUpperCase();
    if (nameUpper === 'AAT' || nameUpper === 'QUIZ') return null;

    const qNum = this.extractQuestionNumber(name);
    if (!qNum || qNum <= 2) return null;

    // Dynamic pairing: odd ↔ odd+1, even ↔ even-1
    return qNum % 2 === 1 ? qNum + 1 : qNum - 1;
  }

  /**
   * Case-insensitive row value lookup.
   * Row keys from PostgreSQL preserve original column case, so we try the
   * exact name first, then uppercase, then lowercase fallbacks.
   */
  _rowVal(rowData, colName) {
    if (colName in rowData) return rowData[colName];
    const up = colName.toUpperCase();
    if (up in rowData) return rowData[up];
    const lo = colName.toLowerCase();
    if (lo in rowData) return rowData[lo];
    return undefined;
  }

  /**
   * Check whether a student has any non-zero mark across a group of sub-columns.
   * (e.g. group = ['Q3A', 'Q3B'] → true if Q3A > 0 OR Q3B > 0)
   */
  _groupHasMarks(rowData, group) {
    return group.some(c => {
      const val = this._rowVal(rowData, c);
      if (val === null || val === undefined || val === '' || val === 'NaN' || val === 'nan') return false;
      const mark = parseFloat(val);
      return !isNaN(mark) && mark > 0;
    });
  }

  /**
   * For a student's row data, determine which question sub-columns should be
   * counted in vertical analysis.
   *
   * Rules:
   *   • Non-Q columns (lab marks, AAT, QUIZ, etc.) → always counted
   *   • Q1 and Q2 (and all their sub-parts) → always counted (compulsory)
   *   • Q3/Q4, Q5/Q6, Q7/Q8, Q9/Q10, … → optional pairs; a student answered
   *     ONE of the pair.  ALL sub-columns of the chosen question are counted;
   *     sub-columns of the unchosen question are NOT counted.
   *   • Pairing is dynamic: odd Q pairs with odd+1. Works for any Q number ≥ 3.
   *   • A question is considered "chosen" if ANY of its sub-columns has marks > 0.
   *   • If neither side of a pair has marks (absent / skipped), the odd-numbered
   *     group's sub-columns are included by default (avoids zero-division).
   */
  getAttemptedQuestions(rowData, allQuestionColumns) {
    const attempted = new Set();

    // ── Step 1: bucket each column by parent question number ─────────────────
    // questionGroups[3] = ['Q3A', 'Q3B'], questionGroups[4] = ['Q4A'], etc.
    const questionGroups = {};   // { qNum: string[] }
    const alwaysInclude  = [];   // non-Q columns

    for (const col of allQuestionColumns) {
      const colName = typeof col === 'string' ? col : col.columnName;
      if (!colName) continue;
      const upper = colName.toUpperCase();

      // Named special columns are always compulsory
      if (upper === 'AAT' || upper === 'QUIZ') {
        alwaysInclude.push(colName);
        continue;
      }

      const qNum = this.extractQuestionNumber(colName);
      if (qNum === null) {
        // No Q-number pattern → lab / extra column → always count
        alwaysInclude.push(colName);
        continue;
      }

      if (!questionGroups[qNum]) questionGroups[qNum] = [];
      questionGroups[qNum].push(colName);
    }

    // ── Step 2: always-include columns ───────────────────────────────────────
    alwaysInclude.forEach(c => attempted.add(c));

    // ── Step 3: compulsory Q1 and Q2 (all their sub-parts) ───────────────────
    [1, 2].forEach(n => {
      if (questionGroups[n]) questionGroups[n].forEach(c => attempted.add(c));
    });

    // ── Step 4: optional pairs (dynamic, works for any Q number ≥ 3) ─────────
    const optionalNums = Object.keys(questionGroups)
      .map(Number)
      .filter(n => n >= 3)
      .sort((a, b) => a - b);

    const processed = new Set();

    for (const qNum of optionalNums) {
      if (processed.has(qNum)) continue;

      // Pair: odd n ↔ n+1,  even n ↔ n-1
      const pairNum = qNum % 2 === 1 ? qNum + 1 : qNum - 1;
      processed.add(qNum);
      processed.add(pairNum);

      const group1 = questionGroups[qNum]      || [];
      const group2 = questionGroups[pairNum]   || [];

      // Only one side present in this marksheet → always include it
      if (group1.length === 0) { group2.forEach(c => attempted.add(c)); continue; }
      if (group2.length === 0) { group1.forEach(c => attempted.add(c)); continue; }

      // Both sides present: decide per student which they answered
      const chose1 = this._groupHasMarks(rowData, group1);
      const chose2 = this._groupHasMarks(rowData, group2);

      if (chose1) group1.forEach(c => attempted.add(c));
      if (chose2) group2.forEach(c => attempted.add(c));

      // If neither side has marks (absent / all-zero), default to group1
      if (!chose1 && !chose2) group1.forEach(c => attempted.add(c));
    }

    return attempted;
  }

  /**
   * Detect if a column should be excluded (metadata, not a question column)
   * CONSERVATIVE: Only exclude columns we're CERTAIN are not marks
   */
  isMetadataColumn(columnName) {
    const lower = columnName.toLowerCase().trim();

    // Only exclude columns that are CLEARLY metadata (exact or very specific matches)
    const exactExclusions = [
      'usn', 'roll', 'roll no', 'roll number', 'enrollment',
      'name', 'student name', 'student',
      'sl', 'sl no', 'sl.no', 'sl no.', 's.no', 's no', 'sno', 'serial', 'serial no', 'serial number',
      'remarks', 'comments', 'description'
    ];

    // Check for exact matches
    if (exactExclusions.includes(lower)) {
      return true;
    }

    // Exclude only if column starts with these patterns
    const startPatterns = ['total', 'grand total', 'final total', 'sum'];
    if (startPatterns.some(pattern => lower.startsWith(pattern))) {
      return true;
    }

    // Everything else should be checked for numeric data
    return false;
  }

  /**
   * Detect if column contains numeric marks data
   * Handles "NaN" strings as missing values
   */
  async isNumericQuestionColumn(tableName, columnName, sampleRows) {
    let numericCount = 0;
    let totalCount = 0;

    for (const row of sampleRows.slice(0, Math.min(10, sampleRows.length))) {
      const value = row[columnName];

      // Skip null, undefined, empty strings, and "NaN" strings
      if (value === null || value === undefined || value === '' ||
          value === 'NaN' || value === 'nan' || value === 'NAN') {
        continue;
      }

      totalCount++;
      const num = parseFloat(value);
      if (!isNaN(num) && isFinite(num)) {
        numericCount++;
      }
    }

    // Column is numeric if > 50% of non-null values are numbers
    // Lower threshold to account for sparse data
    return totalCount > 0 && (numericCount / totalCount) > 0.5;
  }

  /**
   * Auto-detect question columns from data
   */
  async detectQuestionColumns(tableName, columns) {
    console.log(`\n🔍 AUTO-DETECTING QUESTION COLUMNS...`);
    console.log(`Total columns in file: ${columns.length}`);

    // Get sample data to check column types
    const sampleQuery = `SELECT * FROM "${tableName}" LIMIT 10`;
    const sampleResult = await pool.query(sampleQuery);
    const sampleRows = sampleResult.rows;

    const questionColumns = [];

    for (const col of columns) {
      // Skip metadata columns
      if (this.isMetadataColumn(col)) {
        console.log(`  ❌ Skipping metadata column: ${col}`);
        continue;
      }

      // Check if column has numeric data
      const isNumeric = await this.isNumericQuestionColumn(tableName, col, sampleRows);

      if (isNumeric) {
        // Calculate max marks from data (excluding NaN strings)
        const maxQuery = `
          SELECT MAX(CAST("${col}" AS DECIMAL)) as max_val
          FROM "${tableName}"
          WHERE "${col}" IS NOT NULL
            AND "${col}" != 'NaN'
            AND "${col}" != 'nan'
            AND "${col}" != 'NAN'
            AND "${col}" != ''
        `;
        const maxResult = await pool.query(maxQuery);
        const maxMarks = parseFloat(maxResult.rows[0]?.max_val) || 0;

        // Try to infer CO from column name or position
        let coNumber = null;
        const coMatch = col.match(/CO[\s_-]*(\d+)/i);
        if (coMatch) {
          coNumber = parseInt(coMatch[1]);
        }

        questionColumns.push({
          columnName: col,
          maxMarks,
          coNumber
        });

        console.log(`  ✅ Question column: ${col} (Max: ${maxMarks}, CO: ${coNumber || 'auto-detect'})`);
      } else {
        console.log(`  ⏭️  Non-numeric column: ${col}`);
      }
    }

    console.log(`\n✅ Detected ${questionColumns.length} question columns`);
    return questionColumns;
  }

  /**
   * Normalize column name to match CO mapping format (lowercase)
   */
  normalizeColumnName(name) {
    if (!name) return '';
    return name.trim().toLowerCase();
  }

  /**
   * Get valid question columns from CO mappings (PHASE 3 - FINAL QUESTION LIST)
   * Only returns questions with max_marks > 0
   */
  async getValidQuestionColumnsFromMappings(marksheetId, allColumns) {
    console.log(`\n🔍 BUILDING FINAL QUESTION LIST FROM CO MAPPINGS...`);

    // Get valid CO mappings (max_marks > 0)
    const dbMappingsQuery = await pool.query(`
      SELECT question_column, co_number, max_marks
      FROM question_co_mappings
      WHERE marksheet_id = $1 AND (max_marks IS NULL OR max_marks > 0)
    `, [marksheetId]);

    if (dbMappingsQuery.rows.length === 0) {
      console.log(`  ⚠️  No CO mappings found for marksheet ${marksheetId}`);
      return [];
    }

    console.log(`  ✅ Found ${dbMappingsQuery.rows.length} valid question mappings (max_marks > 0)`);

    // Create a map of normalized column names to mappings
    const mappingsMap = {};
    for (const row of dbMappingsQuery.rows) {
      const normalized = this.normalizeColumnName(row.question_column);
      if (!mappingsMap[normalized]) {
        mappingsMap[normalized] = [];
      }
      mappingsMap[normalized].push({
        coNumber: row.co_number,
        maxMarks: parseFloat(row.max_marks) || 10.0
      });
    }

    // Match actual columns from marksheet to mappings (case-insensitive)
    const validQuestions = [];
    const normalizedAllColumns = allColumns.map(col => ({
      original: col,
      normalized: this.normalizeColumnName(col)
    }));

    for (const { original, normalized } of normalizedAllColumns) {
      if (mappingsMap[normalized]) {
        // Found a match! Use the mapping
        for (const mapping of mappingsMap[normalized]) {
          validQuestions.push({
            columnName: original, // Keep original for querying
            normalizedColumnName: normalized, // For matching
            coNumber: mapping.coNumber,
            maxMarks: mapping.maxMarks // ALWAYS from mapping, never inferred
          });
        }
        console.log(`  ✅ ${original} → CO${mappingsMap[normalized].map(m => m.coNumber).join(',CO')} (Max: ${mappingsMap[normalized][0].maxMarks})`);
      }
    }

    console.log(`\n✅ Final valid question list: ${validQuestions.length} questions`);
    return validQuestions;
  }

  /**
   * Try to map questions to COs from database mappings or infer from column names
   * DEPRECATED: Use getValidQuestionColumnsFromMappings instead
   */
  async inferCOMappingsFromData(tableName, questionColumns, allColumns, marksheetId) {
    console.log(`\n🔍 INFERRING CO MAPPINGS...`);

    // Strategy 1: Check if explicit CO mappings exist in database
    const dbMappingsQuery = await pool.query(`
      SELECT question_column, co_number, max_marks
      FROM question_co_mappings
      WHERE marksheet_id = $1 AND (max_marks IS NULL OR max_marks > 0)
    `, [marksheetId]);

    if (dbMappingsQuery.rows.length > 0) {
      console.log(`  ✅ Found ${dbMappingsQuery.rows.length} explicit CO mappings in database`);

      const mappingsMap = {};
      for (const row of dbMappingsQuery.rows) {
        const normalized = this.normalizeColumnName(row.question_column);
        if (!mappingsMap[normalized]) {
          mappingsMap[normalized] = [];
        }
        mappingsMap[normalized].push({
          coNumber: row.co_number,
          maxMarks: parseFloat(row.max_marks) || 10.0
        });
      }

      // Apply database mappings (case-insensitive matching)
      for (const qCol of questionColumns) {
        const normalized = this.normalizeColumnName(qCol.columnName);
        if (mappingsMap[normalized]) {
          const mapping = mappingsMap[normalized][0]; // Use first match
          qCol.coNumber = mapping.coNumber;
          qCol.maxMarks = mapping.maxMarks; // Use from mapping, not inferred
          console.log(`  📌 DB Mapping: ${qCol.columnName} → CO${qCol.coNumber} (Max: ${qCol.maxMarks})`);
        }
      }
    } else {
      console.log(`  ℹ️  No explicit CO mappings found in database, using auto-detection`);
    }

    // Strategy 2: Try to extract CO from column name itself
    for (const qCol of questionColumns) {
      if (!qCol.coNumber) {
        // Look for patterns like "CO1", "CO2", "CO's mapped.1" (where .1 might mean CO1)
        const coMatch = qCol.columnName.match(/CO[\s_-]*(\d+)/i);
        if (coMatch) {
          qCol.coNumber = parseInt(coMatch[1]);
          console.log(`  📌 Extracted from name: ${qCol.columnName} → CO${qCol.coNumber}`);
        } else {
          // Try to infer from numbered suffix (e.g., "CO's mapped.1" → CO1)
          const suffixMatch = qCol.columnName.match(/\.(\d+)$/);
          if (suffixMatch) {
            qCol.coNumber = parseInt(suffixMatch[1]);
            console.log(`  📌 Inferred from suffix: ${qCol.columnName} → CO${qCol.coNumber}`);
          }
        }
      }
    }

    // Strategy 3: Look for separate CO mapping rows/columns
    // Check if first row has text values that might be CO labels
    const firstRowQuery = `SELECT * FROM "${tableName}" LIMIT 1`;
    const firstRowResult = await pool.query(firstRowQuery);

    if (firstRowResult.rows.length > 0) {
      const firstRow = firstRowResult.rows[0];

      for (const qCol of questionColumns) {
        if (!qCol.coNumber) {
          const cellValue = firstRow[qCol.columnName];
          if (cellValue && typeof cellValue === 'string') {
            const coMatch = cellValue.match(/CO[\s_-]*(\d+)/i);
            if (coMatch) {
              qCol.coNumber = parseInt(coMatch[1]);
              console.log(`  📌 Extracted from cell: ${qCol.columnName} → CO${qCol.coNumber}`);
            }
          }
        }
      }
    }

    // Strategy 4: Auto-assign sequential COs if still missing
    const unmappedColumns = questionColumns.filter(q => !q.coNumber);
    if (unmappedColumns.length > 0) {
      console.log(`  ⚠️  ${unmappedColumns.length} columns without CO mapping, auto-assigning sequentially...`);
      let autoCoNumber = 1;
      for (const qCol of unmappedColumns) {
        qCol.coNumber = autoCoNumber;
        console.log(`  🔢 Auto-assigned: ${qCol.columnName} → CO${qCol.coNumber}`);
        autoCoNumber++;
        if (autoCoNumber > 6) autoCoNumber = 1; // Cycle through CO1-CO6
      }
    }

    return questionColumns;
  }

  /**
   * Calculate vertical (per-question) analysis
   * PHASE 5: Vertical Analysis (per question)
   */
  async calculateQuestionVerticalAnalysis(courseId, marksheet, data) {
    const { id: marksheetId, table_name, columns } = marksheet;

    console.log(`\n=== VERTICAL ANALYSIS for ${marksheet.assessment_name} ===`);

    // Get all data from the marksheet table
    const dataQuery = `SELECT * FROM "${table_name}"`;
    const dataResult = await pool.query(dataQuery);
    const rows = dataResult.rows;

    console.log(`Total students in marksheet: ${rows.length}`);

    // PHASE 3-4: Get valid question list from CO mappings (only max_marks > 0)
    const validQuestions = await this.getValidQuestionColumnsFromMappings(marksheetId, columns);

    if (validQuestions.length === 0) {
      console.warn(`⚠️  No valid CO mappings found. Falling back to auto-detection...`);
      // Fallback to old method if no mappings exist
      const questionColumns = await this.detectQuestionColumns(table_name, columns);
    if (questionColumns.length === 0) {
      console.error(`❌ NO NUMERIC QUESTION COLUMNS DETECTED!`);
        throw new Error('No numeric question columns detected. Please upload CO mapping CSV first.');
    }
    const mappedQuestions = await this.inferCOMappingsFromData(table_name, questionColumns, columns, marksheetId);
      return await this.processVerticalAnalysis(courseId, marksheetId, rows, mappedQuestions);
    }

    // Use valid questions from CO mappings
    return await this.processVerticalAnalysis(courseId, marksheetId, rows, validQuestions);
  }

  /**
   * Process vertical analysis for a set of questions
   * PHASE 5: Vertical Analysis (per question)
   * UPDATED: Handles optional question pairs (3-4, 5-6, 7-8)
   */
  async processVerticalAnalysis(courseId, marksheetId, rows, questionColumns) {
    const verticalResults = [];

    console.log(`\n📋 Processing ${rows.length} students for vertical analysis`);
    console.log(`   Applying optional question logic (Q1-Q2 compulsory, Q3-4, Q5-6, Q7-8 optional pairs)`);

    // Process each valid question column
    for (const qCol of questionColumns) {
      const { columnName, maxMarks, coNumber } = qCol;

      // Max marks always comes from mapping CSV, NEVER inferred
      if (maxMarks === 0 || !maxMarks) {
        console.warn(`  ⚠️  Skipping ${columnName} (max_marks = 0 or missing)`);
        continue;
      }

      const qNum = this.extractQuestionNumber(columnName);
      const isCompulsory = this.isCompulsoryQuestion(columnName);

      // Calculate vertical metrics with optional question logic
      const validMarks = [];
      let actualAttempts = 0;

      for (const row of rows) {
        // Check if this question was actually attempted by this student
        const attemptedQuestions = this.getAttemptedQuestions(row, questionColumns);

        // Only count this question if student attempted it (or it's compulsory)
        if (isCompulsory || attemptedQuestions.has(columnName)) {
          const val = row[columnName];

          // Skip NaN strings, null, undefined, empty
          if (val === 'NaN' || val === 'nan' || val === 'NAN' || val === null || val === undefined || val === '') {
            continue;
          }

          const mark = parseFloat(val);
          if (!isNaN(mark) && mark >= 0) {
            validMarks.push(mark);
            actualAttempts++;
          }
        }
      }

      const attemptsCount = actualAttempts; // A: students who actually attempted THIS question
      const verticalSum = validMarks.reduce((sum, mark) => sum + mark, 0);
      const verticalAvg = attemptsCount > 0 ? verticalSum / attemptsCount : 0;

      // CO attainment calculation per NBA document formula:
      // threshold = max_marks * 0.65 (65% of max marks)
      // B = SUM of marks of students who scored >= threshold
      // CO_attainment = ((B / A) / max_marks) * 100
      const thresholdPct = 65.0;
      const thresholdMarks = maxMarks * (thresholdPct / 100);
      const qualifyingMarks = validMarks.filter(mark => mark >= thresholdMarks);
      const studentsAboveThreshold = qualifyingMarks.length;
      const sumMarksAboveThreshold = qualifyingMarks.reduce((s, m) => s + m, 0); // B
      // Document formula: ((B/A)/max_marks)*100
      const coAttainmentPercent = attemptsCount > 0
        ? ((sumMarksAboveThreshold / attemptsCount) / maxMarks) * 100
        : 0;

      const questionType = isCompulsory ? '[COMPULSORY]' : '[OPTIONAL]';
      console.log(`${columnName} ${questionType}: Max=${maxMarks}, A=${attemptsCount}, B_sum=${sumMarksAboveThreshold.toFixed(2)}, Above=${studentsAboveThreshold}, Attainment=${coAttainmentPercent.toFixed(2)}%`);

      verticalResults.push({
        courseId,
        marksheetId,
        questionColumn: columnName,
        coNumber,
        maxMarks,
        attemptsCount,
        verticalSum,
        verticalAvg,
        threshold60pct: thresholdMarks,   // keep field name for DB compat
        studentsAboveThreshold,
        sumMarksAboveThreshold,
        coAttainmentPercent,
        thresholdPct
      });
    }

    // Insert into database
    if (verticalResults.length > 0) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Delete existing vertical analysis for this marksheet
        await client.query('DELETE FROM question_vertical_analysis WHERE marksheet_id = $1', [marksheetId]);

        // Insert new results
      for (const result of verticalResults) {
          await client.query(`
            INSERT INTO question_vertical_analysis
            (course_id, marksheet_id, question_column, co_number, max_marks, attempts_count,
             vertical_sum, vertical_avg, threshold_60pct, students_above_threshold,
             sum_marks_above_threshold, threshold_pct, co_attainment_percent)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (marksheet_id, question_column) DO UPDATE SET
              co_number = EXCLUDED.co_number,
              max_marks = EXCLUDED.max_marks,
            attempts_count = EXCLUDED.attempts_count,
            vertical_sum = EXCLUDED.vertical_sum,
            vertical_avg = EXCLUDED.vertical_avg,
              threshold_60pct = EXCLUDED.threshold_60pct,
            students_above_threshold = EXCLUDED.students_above_threshold,
            sum_marks_above_threshold = EXCLUDED.sum_marks_above_threshold,
            threshold_pct = EXCLUDED.threshold_pct,
            co_attainment_percent = EXCLUDED.co_attainment_percent,
            calculated_at = CURRENT_TIMESTAMP
        `, [
          result.courseId,
          result.marksheetId,
          result.questionColumn,
          result.coNumber,
          result.maxMarks,
          result.attemptsCount,
          result.verticalSum,
          result.verticalAvg,
          result.threshold60pct,
          result.studentsAboveThreshold,
          result.sumMarksAboveThreshold,
          result.thresholdPct,
          result.coAttainmentPercent
        ]);
        }

        await client.query('COMMIT');
        console.log(`\n✅ Stored ${verticalResults.length} vertical analysis results`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error storing vertical analysis:', error);
        throw error;
      } finally {
        client.release();
      }
    }

    return verticalResults;
  }

  /**
   * Calculate horizontal (per-student) analysis
   * PHASE 6: Horizontal Analysis (per student)
   * Special handling: AAT/QUIZ are stored separately even if in same file
   */
  async calculateStudentHorizontalAnalysis(courseId, marksheet, questionColumns) {
    const { id: marksheetId, table_name, assessment_name, columns } = marksheet;

    console.log(`\n=== HORIZONTAL ANALYSIS for ${assessment_name} (course ${courseId}) ===`);

    // PHASE 4: If questionColumns not provided, get from valid CO mappings
    if (!questionColumns || questionColumns.length === 0) {
      console.log(`  📋 Getting valid question columns from CO mappings...`);
      questionColumns = await this.getValidQuestionColumnsFromMappings(marksheetId, columns || []);

      if (questionColumns.length === 0) {
        console.warn(`  ⚠️  No valid CO mappings found. Falling back to auto-detection for horizontal analysis...`);

        // Fallback: Auto-detect numeric columns
        const autoDetectedColumns = await this.detectQuestionColumns(table_name, columns);

        if (autoDetectedColumns.length === 0) {
          console.error(`❌ NO NUMERIC QUESTION COLUMNS DETECTED for horizontal analysis!`);
          return [];
        }

        console.log(`  ✅ Auto-detected ${autoDetectedColumns.length} numeric columns`);

        // Infer CO mappings from column names for auto-detected columns
        const mappedColumns = await this.inferCOMappingsFromData(table_name, autoDetectedColumns, columns, marksheetId);
        questionColumns = mappedColumns;
      }
    }

    // Get all data
    const dataQuery = `SELECT * FROM "${table_name}"`;
    const dataResult = await pool.query(dataQuery);
    const rows = dataResult.rows;

    const horizontalResults = [];

    // Check if this is AAT/QUIZ file (contains both AAT and QUIZ columns)
    const hasAAT = questionColumns.some(q => q.columnName.toUpperCase() === 'AAT');
    const hasQUIZ = questionColumns.some(q => q.columnName.toUpperCase() === 'QUIZ');
    const isAATQUIZFile = hasAAT && hasQUIZ;

    if (isAATQUIZFile) {
      console.log(`📋 Special handling: AAT and QUIZ in same file, processing separately`);
    }

    // Process each student
    for (const row of rows) {
      const usn = row.usn || row.USN || row.Usn;
      const studentName = row.name || row.Name || row.NAME || row.student_name || row.STUDENT_NAME;

      if (!usn) continue;

      // Get student ID from users table
      const studentQuery = await pool.query('SELECT id FROM users WHERE usn = $1', [usn]);
      if (studentQuery.rows.length === 0) continue;

      const studentId = studentQuery.rows[0].id;

      // Calculate horizontal total (sum of all questions, handle NaN strings)
      // IMPORTANT: Only sum marks from questions the student ACTUALLY ATTEMPTED
      let totalMarksRaw = 0;
      let aatMarks = 0;
      let quizMarks = 0;

      // For CIE assessments, exclude AAT and QUIZ from total
      const assessmentType = assessment_name.toUpperCase();
      const isCIE = assessmentType.includes('CIE');

      // Determine which questions this student attempted (handles optional pairs)
      const attemptedQuestions = this.getAttemptedQuestions(row, questionColumns);

      console.log(`  Student ${usn}: Attempted questions = ${Array.from(attemptedQuestions).join(', ')}`);

      for (const qCol of questionColumns) {
        const colNameUpper = qCol.columnName.toUpperCase();

        // Skip AAT/QUIZ or questions not attempted by this student
        if (colNameUpper === 'AAT' || colNameUpper === 'QUIZ') {
          // Handle AAT/QUIZ separately
          const val = row[qCol.columnName];
          if (val && val !== 'NaN' && val !== 'nan' && val !== '') {
            const mark = parseFloat(val);
            if (!isNaN(mark) && mark >= 0) {
              if (colNameUpper === 'AAT') {
                aatMarks = mark;
                if (!isCIE) totalMarksRaw += mark;
              } else if (colNameUpper === 'QUIZ') {
                quizMarks = mark;
                if (!isCIE) totalMarksRaw += mark;
              }
            }
          }
          continue;
        }

        // Only count marks from questions the student actually attempted
        if (!attemptedQuestions.has(qCol.columnName)) {
          console.log(`    Skipping ${qCol.columnName} (not attempted by this student)`);
          continue;
        }

        const val = row[qCol.columnName];

        // Skip NaN strings
        if (val === 'NaN' || val === 'nan' || val === 'NAN' || val === null || val === undefined || val === '') {
          continue;
        }

        const mark = parseFloat(val);
        if (!isNaN(mark) && mark >= 0) {
          // Regular question marks
          totalMarksRaw += mark;
        }
      }

      // Calculate max marks for this assessment
      // IMPORTANT: For CIE assessments, max is ALWAYS 50 (standard)
      let maxMarksPossible = 0;

      if (isCIE) {
        // CIE assessments are ALWAYS out of 50
        maxMarksPossible = 50;
      } else {
        // For non-CIE (AAT, QUIZ, etc.), sum up question max marks
        for (const q of questionColumns) {
          maxMarksPossible += q.maxMarks;
        }
      }

      const percentage = maxMarksPossible > 0 ? (totalMarksRaw / maxMarksPossible) * 100 : 0;

      // Scaling logic: CIE assessments scaled to 30 marks (60% weightage)
      // Formula: (marks / 50) * 30
      let scaledMarks = totalMarksRaw;
      if (isCIE) {
        scaledMarks = (totalMarksRaw / 50) * 30;
      }

      horizontalResults.push({
        courseId,
        marksheetId,
        studentId,
        usn,
        studentName,
        totalMarksRaw,
        maxMarksPossible,
        percentage,
        scaledMarks,
        aatMarks,  // Store AAT separately
        quizMarks  // Store QUIZ separately
      });
    }

    console.log(`Processed ${horizontalResults.length} students`);
    if (horizontalResults.length > 0) {
      const avgMarks = horizontalResults.reduce((sum, s) => sum + s.totalMarksRaw, 0) / horizontalResults.length;
      const avgPct = horizontalResults.reduce((sum, s) => sum + s.percentage, 0) / horizontalResults.length;
      const sample = horizontalResults[0];
      console.log(
        `  ⇒ sample usn=${sample.usn}, total=${sample.totalMarksRaw}, max=${sample.maxMarksPossible}, ` +
        `pct=${sample.percentage.toFixed(2)}, scaled=${sample.scaledMarks.toFixed(2)}`
      );
      console.log(`  Horizontal summary: Max marks possible=${sample.maxMarksPossible}, Avg marks=${avgMarks.toFixed(2)}, Avg %=${avgPct.toFixed(2)}%`);
      if (isAATQUIZFile) {
        const avgAAT = horizontalResults.reduce((sum, s) => sum + s.aatMarks, 0) / horizontalResults.length;
        const avgQUIZ = horizontalResults.reduce((sum, s) => sum + s.quizMarks, 0) / horizontalResults.length;
        console.log(`Avg AAT: ${avgAAT.toFixed(2)}/10, Avg QUIZ: ${avgQUIZ.toFixed(2)}/10`);
      }
    }

    // Insert into database
    if (horizontalResults.length > 0) {
      await pool.query('DELETE FROM student_horizontal_analysis WHERE marksheet_id = $1', [marksheetId]);

      for (const result of horizontalResults) {
        await pool.query(`
          INSERT INTO student_horizontal_analysis (
            course_id, marksheet_id, student_id, usn, student_name,
            total_marks_raw, max_marks_possible, percentage, scaled_marks
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (marksheet_id, student_id) DO UPDATE SET
            total_marks_raw = EXCLUDED.total_marks_raw,
            percentage = EXCLUDED.percentage,
            scaled_marks = EXCLUDED.scaled_marks,
            calculated_at = CURRENT_TIMESTAMP
        `, [
          result.courseId,
          result.marksheetId,
          result.studentId,
          result.usn,
          result.studentName,
          result.totalMarksRaw,
          result.maxMarksPossible,
          result.percentage,
          result.scaledMarks
        ]);
      }
    }

    return horizontalResults;
  }

  /**
   * Calculate file-level summary statistics
   */
  async calculateFileLevelSummary(courseId, marksheet, horizontalResults) {
    const { id: marksheetId, assessment_name } = marksheet;

    const totalStudents = horizontalResults.length;
    const maxMarksPossible = horizontalResults[0]?.maxMarksPossible || 0;

    const avgMarks = horizontalResults.reduce((sum, s) => sum + s.totalMarksRaw, 0) / totalStudents;
    const avgPercentage = horizontalResults.reduce((sum, s) => sum + s.percentage, 0) / totalStudents;

    // Determine assessment type and scaling
    const assessmentType = assessment_name.toUpperCase().includes('CIE1') ? 'CIE1' :
                          assessment_name.toUpperCase().includes('CIE2') ? 'CIE2' :
                          assessment_name.toUpperCase().includes('CIE3') ? 'CIE3' :
                          assessment_name.toUpperCase().includes('AAT') ? 'AAT' :
                          assessment_name.toUpperCase().includes('QUIZ') ? 'QUIZ' : 'OTHER';

    let originalMax = maxMarksPossible;
    let scaledMax = maxMarksPossible;
    let scalingFactor = 1.0;

    if (assessmentType.includes('CIE')) {
      // CIE assessments: ALWAYS out of 50, scaled to 30
      originalMax = 50;
      scaledMax = 30;
      scalingFactor = 0.6; // 30/50 = 0.6
    }

    await pool.query(`
      INSERT INTO file_level_summary (
        course_id, marksheet_id, assessment_name, assessment_type,
        total_students, max_marks_possible, avg_marks, avg_percentage,
        original_max, scaled_max, scaling_factor
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (marksheet_id) DO UPDATE SET
        total_students = EXCLUDED.total_students,
        avg_marks = EXCLUDED.avg_marks,
        avg_percentage = EXCLUDED.avg_percentage,
        calculated_at = CURRENT_TIMESTAMP
    `, [
      courseId, marksheetId, assessment_name, assessmentType,
      totalStudents, maxMarksPossible, avgMarks, avgPercentage,
      originalMax, scaledMax, scalingFactor
    ]);

    console.log(`File Summary: Type=${assessmentType}, Avg Marks=${avgMarks.toFixed(2)}, Avg %=${avgPercentage.toFixed(2)}%`);
  }

  /**
   * Calculate CO-level aggregated analysis
   * CORRECT METHODOLOGY: Aggregate from question-level vertical analysis
   * For each CO, sum up the attempts and students_above_threshold across all questions
   */
  async calculateCOLevelAnalysis(courseId, marksheet, verticalResults) {
    const { id: marksheetId, table_name } = marksheet;

    console.log(`\n=== CO-LEVEL ANALYSIS (Aggregating from Vertical Analysis) ===`);

    // Get all COs for this course
    const cosQuery = await pool.query(
      'SELECT id, co_number FROM course_outcomes WHERE course_id = $1 ORDER BY co_number',
      [courseId]
    );

    const coResults = [];

    for (const co of cosQuery.rows) {
      const coNumber = co.co_number;

      // Get all questions mapped to this CO from vertical analysis
      const coQuestions = verticalResults.filter(q => q.coNumber === coNumber);

      if (coQuestions.length === 0) {
        console.log(`  ⚠️  No questions found for CO${coNumber}`);
        continue;
      }

      // CORRECT METHODOLOGY: Aggregate from question-level vertical analysis
      // Sum up max marks across all questions for this CO
      const coMaxMarks = coQuestions.reduce((sum, q) => sum + (q.maxMarks || 0), 0);

      // Sum up total attempts across all questions for this CO
      const coAttempts = coQuestions.reduce((sum, q) => sum + (q.attemptsCount || 0), 0);

      // Sum up students who scored >= 60% on each question for this CO
      const coStudentsAboveThreshold = coQuestions.reduce((sum, q) => sum + (q.studentsAboveThreshold || 0), 0);

      // Calculate CO attainment as: (total students above threshold) / (total attempts) * 100
      // This is the AVERAGE of question-level attainments
      const coAttainmentPercent = coAttempts > 0
        ? (coStudentsAboveThreshold / coAttempts) * 100
        : 0;

      // Calculate average vertical sum for informational purposes
      let coVerticalSum = 0;
      for (const q of coQuestions) {
        coVerticalSum += (q.verticalSum || 0);
      }

      const coThreshold60pct = coMaxMarks * 0.60;

      console.log(`CO${coNumber}: Max=${coMaxMarks}, Total Attempts=${coAttempts}, Above Threshold=${coStudentsAboveThreshold}, Attainment=${coAttainmentPercent.toFixed(2)}%`);

      coResults.push({
        courseId,
        marksheetId,
        coId: co.id,
        coNumber,
        coMaxMarks,
        coVerticalSum,
        coAttempts,
        coThreshold60pct,
        coStudentsAboveThreshold,
        coAttainmentPercent
      });
    }

    // Insert into database
    if (coResults.length > 0) {
      await pool.query('DELETE FROM co_level_analysis WHERE marksheet_id = $1', [marksheetId]);

      for (const result of coResults) {
        await pool.query(`
          INSERT INTO co_level_analysis (
            course_id, marksheet_id, co_id, co_number,
            co_max_marks, co_vertical_sum, co_attempts,
            co_threshold_60pct, co_students_above_threshold, co_attainment_percent
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (marksheet_id, co_id) DO UPDATE SET
            co_max_marks = EXCLUDED.co_max_marks,
            co_vertical_sum = EXCLUDED.co_vertical_sum,
            co_attempts = EXCLUDED.co_attempts,
            co_students_above_threshold = EXCLUDED.co_students_above_threshold,
            co_attainment_percent = EXCLUDED.co_attainment_percent,
            calculated_at = CURRENT_TIMESTAMP
        `, [
          result.courseId,
          result.marksheetId,
          result.coId,
          result.coNumber,
          result.coMaxMarks,
          result.coVerticalSum,
          result.coAttempts,
          result.coThreshold60pct,
          result.coStudentsAboveThreshold,
          result.coAttainmentPercent
        ]);
      }
    }

    return coResults;
  }

  /**
   * Calculate final CIE composition (CIE1 + CIE2 + CIE3 + AAT + QUIZ)
   * Formula: Final = ((CIE1 + CIE2 + CIE3)/3) scaled to 30 + AAT(10) + QUIZ(10) = 50 max
   */
  async calculateFinalCIEComposition(courseId) {
    console.log(`\n=== FINAL CIE COMPOSITION for course ${courseId} ===`);

    // Get all students enrolled in the course
    const studentsQuery = await pool.query(`
      SELECT DISTINCT u.id, u.usn, u.name
      FROM users u
      JOIN students_courses sc ON u.id = sc.student_id
      WHERE sc.course_id = $1 AND u.role = 'student'
      ORDER BY u.usn
    `, [courseId]);

    console.log(`Found ${studentsQuery.rows.length} students enrolled in course`);

    // Get AAT/QUIZ marksheet to extract AAT and QUIZ separately
    const aatMarksheetQuery = await pool.query(`
      SELECT id, table_name
      FROM marksheets
      WHERE course_id = $1 AND (
        assessment_name ILIKE '%AAT%' OR
        assessment_name ILIKE '%QUIZ%'
      )
      LIMIT 1
    `, [courseId]);

    const aatTableName = aatMarksheetQuery.rows[0]?.table_name;
    console.log(`AAT table name: ${aatTableName || 'NOT FOUND'}`);

    const finalResults = [];

    for (const student of studentsQuery.rows) {
      const studentId = student.id;
      const usn = student.usn;
      const studentName = student.name;

      // Get scaled CIE marks (CIE1, CIE2, CIE3)
      const cieMarksQuery = await pool.query(`
        SELECT
          fls.assessment_type,
          sha.scaled_marks
        FROM student_horizontal_analysis sha
        JOIN file_level_summary fls ON sha.marksheet_id = fls.marksheet_id
        WHERE sha.course_id = $1 AND sha.student_id = $2
          AND fls.assessment_type IN ('CIE1', 'CIE2', 'CIE3')
      `, [courseId, studentId]);

      const cieMarks = {};
      for (const row of cieMarksQuery.rows) {
        cieMarks[row.assessment_type] = parseFloat(row.scaled_marks) || 0;
      }

      const scaledCIE1 = cieMarks['CIE1'] || 0;
      const scaledCIE2 = cieMarks['CIE2'] || 0;
      const scaledCIE3 = cieMarks['CIE3'] || 0;

      // Average of scaled CIE marks (each already scaled to 30)
      const avgCIEScaled = (scaledCIE1 + scaledCIE2 + scaledCIE3) / 3;

      // Get AAT and QUIZ directly from the AAT table
      let aatMarks = 0;
      let quizMarks = 0;

      if (aatTableName) {
        const aatQuizQuery = await pool.query(`
          SELECT "AAT", "QUIZ"
          FROM "${aatTableName}"
          WHERE UPPER("USN") = UPPER($1)
          LIMIT 1
        `, [usn]);

        if (aatQuizQuery.rows.length > 0) {
          const row = aatQuizQuery.rows[0];
          const aatVal = row.AAT || row.aat;
          const quizVal = row.QUIZ || row.quiz;

          if (aatVal && aatVal !== 'NaN' && aatVal !== 'nan') {
            aatMarks = Math.min(parseFloat(aatVal) || 0, 10); // Cap at 10
          }
          if (quizVal && quizVal !== 'NaN' && quizVal !== 'nan') {
            quizMarks = Math.min(parseFloat(quizVal) || 0, 10); // Cap at 10
          }
        }
      }

      // Ensure avgCIEScaled is capped at 30
      const cappedAvgCIE = Math.min(avgCIEScaled, 30);

      // Final CIE total = avg(CIE1, CIE2, CIE3) + AAT + QUIZ
      // Max = 30 (avg CIE) + 10 (AAT) + 10 (QUIZ) = 50
      const finalCIETotal = cappedAvgCIE + aatMarks + quizMarks;
      const finalCIEMax = 50;
      const finalCIEPercentage = (finalCIETotal / finalCIEMax) * 100;

      finalResults.push({
        courseId,
        studentId,
        usn,
        studentName,
        scaledCIE1: Math.min(scaledCIE1, 30), // Cap at 30
        scaledCIE2: Math.min(scaledCIE2, 30), // Cap at 30
        scaledCIE3: Math.min(scaledCIE3, 30), // Cap at 30
        avgCIEScaled: cappedAvgCIE,
        aatMarks,
        quizMarks,
        finalCIETotal,
        finalCIEPercentage,
        finalCIEMax
      });
    }

    console.log(`Prepared ${finalResults.length} final CIE results`);

    // Insert into database
    if (finalResults.length > 0) {
      console.log('Deleting old final_cie_composition data...');
      await pool.query('DELETE FROM final_cie_composition WHERE course_id = $1', [courseId]);
      console.log('Inserting new final_cie_composition data...');

      for (const result of finalResults) {
        await pool.query(`
          INSERT INTO final_cie_composition (
            course_id, student_id, usn, student_name,
            scaled_cie1, scaled_cie2, scaled_cie3, avg_cie_scaled,
            aat_marks, quiz_marks, final_cie_total, final_cie_percentage, final_cie_max
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (course_id, student_id) DO UPDATE SET
            scaled_cie1 = EXCLUDED.scaled_cie1,
            scaled_cie2 = EXCLUDED.scaled_cie2,
            scaled_cie3 = EXCLUDED.scaled_cie3,
            avg_cie_scaled = EXCLUDED.avg_cie_scaled,
            aat_marks = EXCLUDED.aat_marks,
            quiz_marks = EXCLUDED.quiz_marks,
            final_cie_total = EXCLUDED.final_cie_total,
            final_cie_percentage = EXCLUDED.final_cie_percentage,
            calculated_at = CURRENT_TIMESTAMP
        `, [
          result.courseId, result.studentId, result.usn, result.studentName,
          result.scaledCIE1, result.scaledCIE2, result.scaledCIE3, result.avgCIEScaled,
          result.aatMarks, result.quizMarks, result.finalCIETotal, result.finalCIEPercentage, result.finalCIEMax
        ]);
      }
    }

    console.log(`✅ Final CIE calculated and inserted for ${finalResults.length} students`);
    return finalResults;
  }

  /**
   * Main function: Run all calculations for a course
   */
  async runFullCalculation(courseId) {
    console.log(`\n========================================`);
    console.log(`STARTING DETAILED CALCULATIONS FOR COURSE: ${courseId}`);
    console.log(`========================================\n`);

    try {
      // Get all marksheets for this course
      const marksheetsQuery = await pool.query(
        'SELECT * FROM marksheets WHERE course_id = $1 ORDER BY created_at',
        [courseId]
      );

      const marksheets = marksheetsQuery.rows;
      console.log(`Found ${marksheets.length} marksheets to process`);

      if (marksheets.length === 0) {
        throw new Error('No marksheets found for this course. Please upload assessment marks first.');
      }

      for (const marksheet of marksheets) {
        console.log(`\n--- Processing: ${marksheet.assessment_name} ---`);

        // Step 1: Vertical Analysis (per-question)
        const verticalResults = await this.calculateQuestionVerticalAnalysis(courseId, marksheet);

        if (verticalResults.length === 0) {
          console.warn(`⚠️  No question columns detected in ${marksheet.assessment_name}, skipping...`);
          continue;
        }

        // Extract question columns for horizontal analysis
        const questionColumns = verticalResults.map(v => ({
          columnName: v.questionColumn,
          maxMarks: v.maxMarks,
          coNumber: v.coNumber
        }));

        // Step 2: Horizontal Analysis (per-student)
        const horizontalResults = await this.calculateStudentHorizontalAnalysis(courseId, marksheet, questionColumns);

        // Step 3: File-Level Summary
        await this.calculateFileLevelSummary(courseId, marksheet, horizontalResults);

        // Step 4: CO-Level Analysis
        await this.calculateCOLevelAnalysis(courseId, marksheet, verticalResults);
      }

      // Step 5: Final CIE Composition (across all assessments)
      await this.calculateFinalCIEComposition(courseId);

      // Step 6: Calculate Combined CO Attainment (across CIE1, CIE2, CIE3, AAT)
      const combinedCOAttainmentService = (await import('./combinedCOAttainment.js')).default;
      await combinedCOAttainmentService.calculateCombinedCOAttainment(courseId);

      console.log(`\n========================================`);
      console.log(`CALCULATIONS COMPLETED SUCCESSFULLY!`);
      console.log(`========================================\n`);

      return { success: true, message: 'Detailed calculations completed successfully' };
    } catch (error) {
      console.error('Error in detailed calculations:', error);
      throw error;
    }
  }
}

export default new DetailedCalculationsService();
