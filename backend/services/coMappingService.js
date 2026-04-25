import pool from '../config/db.js';
import crypto from 'crypto';

/**
 * CO MAPPING SERVICE
 * Handles upload and parsing of CO mapping CSV files
 */

class COMappingService {
  /**
   * Normalize column name to standard format (e.g., Q1A → q1a, Q2B → q2b)
   */
  normalizeColumnName(name) {
    if (!name) return '';
    return name.trim().toLowerCase();
  }

  /**
   * Parse CO mapping from CSV/text content.
   *
   * Supports THREE formats automatically:
   *
   * FORMAT A – dedicated mapping file (Column, Max Marks, CO):
   *   Column,Max Marks,CO
   *   q1a,6,co1
   *   q1b,4,co1
   *   q2a,10,co3
   *
   * FORMAT B – dedicated mapping file without max marks (Question, CO):
   *   Question,CO
   *   Q1A,CO1
   *   Q1B,CO1
   *   Q2A,CO3
   *
   * FORMAT C – the CIE marks CSV itself (multi-row header, same file
   *   uploaded for marks). The parser finds the row where values look
   *   like CO numbers and the row where values look like Q-column names,
   *   then pairs them by column position:
   *   Sl No.,USN,STUDENT NAME,CO1,CO1,CO4,...
   *   Sl No.,USN,STUDENT NAME,Q1A,Q1B,Q2A,...
   *   1,1DS23AI001,...,7,4,...
   *
   * CO values accept: "CO1", "co1", "1", "2" (plain integers also work).
   * Questions with max_marks = 0 are skipped; missing max_marks defaults to 10.
   */
  parseCoMappingCSV(csvContent) {
    // Normalise line endings (Windows \r\n → \n)
    const lines = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');

    if (lines.length < 2) {
      throw new Error('CO mapping file must have at least 2 rows');
    }

    // ── Try Format C first: marks-CSV multi-row header ────────────────────────
    const marksFormatResult = this._tryParseMarksCsvFormat(lines);
    if (marksFormatResult !== null) {
      console.log(`📋 Detected marks-CSV format (multi-row header). Found ${marksFormatResult.length} mappings.`);
      if (marksFormatResult.length === 0) {
        throw new Error('No valid CO mappings found in CSV. Could not pair question columns with CO numbers.');
      }
      return marksFormatResult;
    }

    // ── Formats A & B: single-header mapping file ─────────────────────────────
    const header = this.parseCSVLine(lines[0]).map(h => h.toLowerCase());

    // Detect column index for question name
    const columnColIndex = header.findIndex(h =>
      h === 'column' || h === 'question' || h === 'question_name' ||
      h === 'q' || h === 'q_column' || h.includes('column') || h.includes('question')
    );

    // Detect column index for max marks (optional)
    const maxMarksColIndex = header.findIndex(h =>
      h === 'max marks' || h === 'max_marks' || h === 'maxmarks' ||
      h === 'marks' || h === 'max' || h.includes('max')
    );

    // Detect column index for CO value
    const coColIndex = header.findIndex(h =>
      h === 'co' || h === 'cos' || h === 'co_number' ||
      h === 'course outcome' || h === 'co number' || h === 'co_numbers'
    );

    if (columnColIndex === -1 || coColIndex === -1) {
      // ── Format D: transposed — headers ARE the question names ────────────────
      // Example (AAT/Quiz):
      //   aat,quiz
      //   co2,co5
      //   10,10        ← optional max marks row
      //
      // Detection: every header cell looks like a question / assessment name
      // (not a meta-label like "column" or "co").
      const transposedResult = this._tryParseTransposedFormat(lines, header);
      if (transposedResult !== null && transposedResult.length > 0) {
        console.log(`📋 Detected transposed format (headers = question names). Found ${transposedResult.length} mappings.`);
        return transposedResult;
      }

      throw new Error(
        `Could not find required columns in the CSV header. ` +
        `Header found: [${header.join(', ')}]. ` +
        `Expected columns: "Column" (or "Question") and "CO" (and optionally "Max Marks"). ` +
        `Alternatively, you can upload the same CIE marks CSV — the parser will extract CO mappings from its header rows automatically.`
      );
    }

    if (maxMarksColIndex === -1) {
      console.warn('⚠️  "Max Marks" column not found — defaulting to 10 for all questions.');
    }

    console.log(`📋 Parsing CO mapping (Format ${maxMarksColIndex !== -1 ? 'A' : 'B'}): ${lines.length - 1} data rows`);

    const mappings = [];
    let skippedZero = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cells = this.parseCSVLine(line);
      if (cells.length < 2) continue;

      const questionName = cells[columnColIndex]?.trim();
      const rawMaxMarks  = maxMarksColIndex !== -1 ? cells[maxMarksColIndex]?.trim() : '10';
      const coValue      = cells[coColIndex]?.trim();

      if (!questionName || !coValue) continue;

      const normalizedCol = this.normalizeColumnName(questionName);
      const maxMarks      = parseFloat(rawMaxMarks);

      // Skip rows where max_marks is explicitly 0 (sub-question placeholders)
      if (!isNaN(maxMarks) && maxMarks <= 0) {
        skippedZero++;
        console.log(`  ⏭️  Skipping ${questionName} (max_marks = 0)`);
        continue;
      }

      // If max_marks is missing/NaN use 10
      const resolvedMaxMarks = isNaN(maxMarks) ? 10 : maxMarks;

      const coNumbers = this.extractCONumbers(coValue);
      if (coNumbers.length === 0) {
        console.warn(`  ⚠️  Could not parse CO number from "${coValue}" for ${questionName} — skipping`);
        continue;
      }

      for (const coNumber of coNumbers) {
        mappings.push({ questionColumn: normalizedCol, originalColumnName: questionName, maxMarks: resolvedMaxMarks, coNumber });
      }
      console.log(`  ✅ ${normalizedCol} → CO${coNumbers.join(',CO')} (Max: ${resolvedMaxMarks})`);
    }

    if (skippedZero > 0) console.log(`   ⏭️  Skipped ${skippedZero} rows with max_marks = 0`);
    console.log(`\n✅ Parsed ${mappings.length} valid CO mappings`);

    if (mappings.length === 0) {
      throw new Error(
        'No valid CO mappings found in CSV. ' +
        'Check that: (1) CO values are like "CO1" or just "1", ' +
        '(2) Max Marks are > 0 (or omit the column to default to 10), ' +
        '(3) Column names are not empty.'
      );
    }

    return mappings;
  }

  /**
   * Try to parse the CIE marks CSV multi-row header format.
   * Returns an array of mappings if detected, or null if not this format.
   *
   * Looks for two rows among the first 5 where:
   *   - One row has values matching CO pattern (CO1, CO2, …)
   *   - One row has values matching Q-column pattern (Q1A, Q1B, Q2, …)
   * Pairs them by column position to produce mappings.
   * Max marks default to 10 per main question (inferred by grouping sub-questions).
   */
  _tryParseMarksCsvFormat(lines) {
    const Q_PATTERN  = /^[Qq]\d+[a-zA-Z]?$/;
    const CO_PATTERN = /^CO?\s*\d+$/i;

    let coRow    = null;  // array of cell values
    let qRow     = null;  // array of cell values
    const checkRows = Math.min(6, lines.length);

    for (let i = 0; i < checkRows; i++) {
      const cells = this.parseCSVLine(lines[i]);
      const coMatches = cells.filter(c => CO_PATTERN.test(c.trim())).length;
      const qMatches  = cells.filter(c => Q_PATTERN.test(c.trim())).length;

      // A row is a "CO row" if ≥ 4 cells match the CO pattern
      if (coMatches >= 4 && coRow === null) { coRow = cells; }
      // A row is a "Q row" if ≥ 4 cells match the Q pattern
      if (qMatches  >= 4 && qRow  === null) { qRow  = cells; }
    }

    if (!coRow || !qRow || coRow.length !== qRow.length) return null;

    // Pair: for each column index, if qRow[i] looks like a Q-column and coRow[i] looks like CO
    // Group sub-questions (q1a, q1b) under their parent question number to assign max marks.
    const qCoMap = {};  // { normalizedQCol: coNumber }
    const qGroupCount = {};  // { mainQNum: subQCount }

    for (let i = 0; i < qRow.length; i++) {
      const qVal  = qRow[i].trim();
      const coVal = coRow[i].trim();
      if (!Q_PATTERN.test(qVal) || !CO_PATTERN.test(coVal)) continue;

      const coNumbers = this.extractCONumbers(coVal);
      if (coNumbers.length === 0) continue;

      const normQ = this.normalizeColumnName(qVal);
      // Track group count for max_marks distribution
      const groupMatch = qVal.match(/\d+/);
      if (groupMatch) {
        const gNum = groupMatch[0];
        qGroupCount[gNum] = (qGroupCount[gNum] || 0) + 1;
      }
      qCoMap[normQ] = { coNumbers, rawQ: qVal };
    }

    if (Object.keys(qCoMap).length === 0) return null;

    // Build mappings. Each main question = 10 marks. Split equally among sub-questions.
    const mappings = [];
    for (const [normQ, { coNumbers, rawQ }] of Object.entries(qCoMap)) {
      const groupMatch = rawQ.match(/\d+/);
      const subCount   = groupMatch ? (qGroupCount[groupMatch[0]] || 1) : 1;
      const maxMarks   = Math.round((10 / subCount) * 100) / 100;

      for (const coNumber of coNumbers) {
        mappings.push({ questionColumn: normQ, originalColumnName: rawQ, maxMarks, coNumber });
      }
      console.log(`  ✅ ${normQ} → CO${coNumbers.join(',CO')} (Max: ${maxMarks})`);
    }

    return mappings;
  }

  /**
   * Try to parse Format D: transposed layout where the header row contains
   * question/column names and subsequent rows contain CO values and optionally
   * max marks.
   *
   * Supported variants:
   *
   *   aat,quiz          aat,quiz          aat,quiz
   *   co2,co5           10,10             co2,co5
   *                     co2,co5           10,10
   *
   * Returns an array of mappings or null if the format is not recognised.
   */
  _tryParseTransposedFormat(lines, header) {
    const CO_PATTERN  = /^CO?\s*\d+$/i;
    const NUM_PATTERN = /^\d+(\.\d+)?$/;

    const META_LABELS = new Set([
      'column', 'question', 'q', 'co', 'cos', 'co_number', 'co number',
      'max marks', 'max_marks', 'maxmarks', 'marks', 'max'
    ]);

    // Strip trailing empty cells from the header (XLSX→CSV often pads with commas)
    const cleanHeader = header.filter(h => h.trim().length > 0);
    if (cleanHeader.length === 0) return null;

    // Every non-empty header cell must look like a question/column name
    const isQuestionName = h => !META_LABELS.has(h);
    if (!cleanHeader.every(isQuestionName)) return null;

    // Scan first few data rows for a CO row and an optional max-marks row
    let coRow  = null;
    let maxRow = null;

    for (let i = 1; i < Math.min(lines.length, 8); i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cells = this.parseCSVLine(line);
      const nonEmpty = cells.filter(c => c.trim());
      if (nonEmpty.length === 0) continue;

      // Also accept cells with comma-separated COs like "CO1,CO2,CO3,CO4"
      const hasCORef   = c => CO_PATTERN.test(c.trim()) || /CO\s*\d+/i.test(c.trim());
      const coMatches  = nonEmpty.filter(c => hasCORef(c)).length;
      const numMatches = nonEmpty.filter(c => NUM_PATTERN.test(c.trim()) && !hasCORef(c)).length;

      if (!coRow && coMatches > 0 && coMatches >= nonEmpty.length * 0.5) {
        coRow = cells;
      } else if (!maxRow && numMatches > 0 && numMatches >= nonEmpty.length * 0.5) {
        maxRow = cells;
      }
    }

    if (!coRow) return null;

    const mappings = [];
    for (let i = 0; i < cleanHeader.length; i++) {
      const questionName = cleanHeader[i].trim();
      if (!questionName) continue;

      // Find the original position of this header in the full header array
      // (needed so coRow/maxRow indices align correctly)
      const origIdx = header.indexOf(cleanHeader[i]);
      const coValue  = ((origIdx >= 0 ? coRow[origIdx] : coRow[i]) || '').trim();
      const maxValue = maxRow ? ((origIdx >= 0 ? maxRow[origIdx] : maxRow[i]) || '').trim() : '';

      const coNumbers = this.extractCONumbers(coValue);
      if (coNumbers.length === 0) {
        console.warn(`  ⚠️  No CO found for "${questionName}" in "${coValue}" — skipping`);
        continue;
      }

      const maxMarks = NUM_PATTERN.test(maxValue) ? parseFloat(maxValue) : 10;

      for (const coNumber of coNumbers) {
        mappings.push({
          questionColumn:     this.normalizeColumnName(questionName),
          originalColumnName: questionName,
          maxMarks,
          coNumber
        });
      }
      console.log(`  ✅ ${questionName} → CO${coNumbers.join(',CO')} (Max: ${maxMarks})`);
    }

    return mappings;
  }

  /**
   * Parse a single CSV line handling quoted values
   */
  parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  /**
   * Extract CO numbers from a string.
   * Accepts: "CO1", "co1", "CO 1", "1", "2", "CO1,CO2", "1,2".
   */
  extractCONumbers(coString) {
    if (!coString) return [];
    const s = coString.trim();

    // Try "CO<n>" pattern (handles "CO1", "CO 1", "co1", etc.)
    const coMatches = s.match(/CO[\s_-]*(\d+)/gi);
    if (coMatches && coMatches.length > 0) {
      return coMatches.map(m => {
        const n = m.match(/\d+/);
        return n ? parseInt(n[0]) : null;
      }).filter(n => n !== null);
    }

    // Fallback: plain integer(s) separated by commas/spaces (e.g. "1" or "1,2")
    const nums = s.split(/[,\s]+/).map(p => parseInt(p.trim())).filter(n => !isNaN(n) && n > 0);
    return nums;
  }

  /**
   * Upload and store CO mappings for a marksheet
   */
  async uploadCOMappings(courseId, marksheetId, fileName, csvContent, uploadedBy) {
    console.log(`\n========================================`);
    console.log(`UPLOADING CO MAPPINGS FOR MARKSHEET: ${marksheetId}`);
    console.log(`========================================\n`);

    // Parse the CSV
    const mappings = this.parseCoMappingCSV(csvContent);

    if (mappings.length === 0) {
      throw new Error('No valid CO mappings found in CSV');
    }

    // Calculate file hash
    const fileHash = crypto.createHash('sha256').update(csvContent).digest('hex');

    // Get course outcomes for this course
    const cosQuery = await pool.query(
      'SELECT id, co_number FROM course_outcomes WHERE course_id = $1',
      [courseId]
    );

    const coMap = {};
    for (const co of cosQuery.rows) {
      coMap[co.co_number] = co.id;
    }

    // Auto-create any missing course_outcomes entries so mappings are never silently dropped.
    // This happens when the teacher uploads CO mappings before explicitly adding Course Outcomes.
    const missingCONumbers = [...new Set(mappings.map(m => m.coNumber))].filter(n => !coMap[n]);
    if (missingCONumbers.length > 0) {
      console.log(`Auto-creating ${missingCONumbers.length} missing CO entries: CO${missingCONumbers.join(', CO')}`);
      for (const coNum of missingCONumbers) {
        const res = await pool.query(`
          INSERT INTO course_outcomes (course_id, co_number, description, bloom_level, is_ai_generated)
          VALUES ($1, $2, $3, 'Remember', FALSE)
          ON CONFLICT (course_id, co_number) DO NOTHING
          RETURNING id, co_number
        `, [courseId, coNum, `CO${coNum}`]);
        if (res.rows.length > 0) {
          coMap[coNum] = res.rows[0].id;
          console.log(`  ✓ Created CO${coNum} with id ${res.rows[0].id}`);
        } else {
          // Already exists after conflict — fetch it
          const existing = await pool.query(
            'SELECT id FROM course_outcomes WHERE course_id = $1 AND co_number = $2',
            [courseId, coNum]
          );
          if (existing.rows.length > 0) coMap[coNum] = existing.rows[0].id;
        }
      }
    }

    // Begin transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete existing mappings for this marksheet
      await client.query('DELETE FROM question_co_mappings WHERE marksheet_id = $1', [marksheetId]);

      // Insert new mappings (only valid ones with max_marks > 0 are in the array)
      for (const mapping of mappings) {
        const coId = coMap[mapping.coNumber];

        if (!coId) {
          console.warn(`⚠️  CO${mapping.coNumber} still not found after auto-create, skipping ${mapping.questionColumn}`);
          continue;
        }

        // Check if max_marks column exists, if not use default value
        await client.query(`
          INSERT INTO question_co_mappings (
            course_id, marksheet_id, question_column, co_number, co_id, max_marks, uploaded_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (marksheet_id, question_column, co_number) DO UPDATE SET
            co_id = EXCLUDED.co_id,
            max_marks = EXCLUDED.max_marks,
            uploaded_by = EXCLUDED.uploaded_by,
            updated_at = CURRENT_TIMESTAMP
        `, [courseId, marksheetId, mapping.questionColumn, mapping.coNumber, coId, mapping.maxMarks, uploadedBy]);
      }

      // Store file metadata
      await client.query(`
        INSERT INTO co_mapping_files (
          course_id, marksheet_id, file_name, file_hash, mappings_count, uploaded_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (marksheet_id) DO UPDATE SET
          file_name = EXCLUDED.file_name,
          file_hash = EXCLUDED.file_hash,
          mappings_count = EXCLUDED.mappings_count,
          uploaded_by = EXCLUDED.uploaded_by,
          created_at = CURRENT_TIMESTAMP
      `, [courseId, marksheetId, fileName, fileHash, mappings.length, uploadedBy]);

      await client.query('COMMIT');

      console.log(`\n✅ Successfully stored ${mappings.length} CO mappings`);

      return {
        success: true,
        mappingsCount: mappings.length,
        fileHash
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error storing CO mappings:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get CO mappings for a marksheet
   * Returns only valid questions (max_marks > 0)
   */
  async getCOMappings(marksheetId) {
    const result = await pool.query(`
      SELECT question_column, co_number, co_id, max_marks
      FROM question_co_mappings
      WHERE marksheet_id = $1 AND (max_marks IS NULL OR max_marks > 0)
      ORDER BY question_column
    `, [marksheetId]);

    return result.rows;
  }

  /**
   * Get valid question columns for a marksheet (only questions with max_marks > 0)
   * This is the FINAL QUESTION LIST used in all calculations
   */
  async getValidQuestionColumns(marksheetId) {
    const result = await pool.query(`
      SELECT question_column, co_number, co_id, max_marks
      FROM question_co_mappings
      WHERE marksheet_id = $1 AND (max_marks IS NULL OR max_marks > 0)
      ORDER BY question_column
    `, [marksheetId]);

    return result.rows;
  }

  /**
   * Get CO mappings for all marksheets in a course
   * Returns only valid questions (max_marks > 0)
   */
  async getCourseCOMappings(courseId) {
    const result = await pool.query(`
      SELECT m.assessment_name, qcm.question_column, qcm.co_number, qcm.max_marks
      FROM question_co_mappings qcm
      JOIN marksheets m ON qcm.marksheet_id = m.id
      WHERE qcm.course_id = $1 AND (qcm.max_marks IS NULL OR qcm.max_marks > 0)
      ORDER BY m.assessment_name, qcm.question_column
    `, [courseId]);

    return result.rows;
  }

  /**
   * Delete CO mappings for a marksheet
   */
  async deleteCOMappings(marksheetId) {
    await pool.query('DELETE FROM question_co_mappings WHERE marksheet_id = $1', [marksheetId]);
    await pool.query('DELETE FROM co_mapping_files WHERE marksheet_id = $1', [marksheetId]);

    return { success: true, message: 'CO mappings deleted' };
  }
}

export default new COMappingService();
