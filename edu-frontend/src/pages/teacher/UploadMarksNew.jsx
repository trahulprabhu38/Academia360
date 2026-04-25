import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import * as XLSX from "xlsx";
import { useDropzone } from "react-dropzone";
import {
  CloudUpload, GraduationCap, FlaskConical,
  BookOpen, CheckCircle, Circle, RefreshCw,
  Download, FileText, Users, Hash, BarChart2,
  FileSpreadsheet, X, AlertCircle, Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import { courseAPI, marksheetAPI } from "../../services/api";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080/api";
const UPLOAD_SERVICE_URL = import.meta.env.VITE_UPLOAD_SERVICE_URL || "http://localhost:8001";

// ── Slot definitions ──────────────────────────────────────────────────────────
const THEORY_SLOTS = [
  { id: "cia1",  label: "CIA 1",      hint: "Continuous Internal Assessment 1", color: "blue",   defaultName: "CIA 1"    },
  { id: "cia2",  label: "CIA 2",      hint: "Continuous Internal Assessment 2", color: "blue",   defaultName: "CIA 2"    },
  { id: "cia3",  label: "CIA 3",      hint: "Continuous Internal Assessment 3", color: "blue",   defaultName: "CIA 3"    },
  { id: "aat",   label: "AAT / Quiz", hint: "Additional Assessment Task",        color: "purple", defaultName: "AAT Quiz" },
];
const ALL_SLOTS = [...THEORY_SLOTS];

// CIA slots (no AAT) — used when a low-credit theory course declares it has CIEs
const CIA_SLOTS = THEORY_SLOTS.filter(s => s.id.startsWith("cia"));

// Returns upload sections based on course type, credits, and CIE configuration.
// cieConfig only applies to low-credit non-lab courses; ignored otherwise.
function getSections(courseType, credits, cieConfig = null) {
  if (credits <= 2) {
    if (cieConfig?.hasCIE && cieConfig?.count) {
      return [{
        title: "Internal Assessments (CIE)",
        icon: BookOpen,
        slots: CIA_SLOTS.slice(0, cieConfig.count),
      }];
    }
    return [];
  }
  return [{ title: "Theory Components", icon: BookOpen, slots: THEORY_SLOTS }];
}

// ── Slot detection: exact normalized match ────────────────────────────────────
// Normalize: lowercase, strip spaces/dashes, treat cia≡cie
const norm = (s) =>
  s.toLowerCase().replace(/[\s_\-]+/g, "").replace(/\bcie\b/g, "cia");

function buildUploadedSlotIds(assessmentNames) {
  const ids = new Set();
  for (const name of assessmentNames) {
    const nNorm = norm(name);
    for (const slot of ALL_SLOTS) {
      if (nNorm === norm(slot.defaultName)) {
        ids.add(slot.id);
        break;
      }
    }
  }
  return ids;
}

// ── CIE template download ─────────────────────────────────────────────────────
function downloadCIETemplate() {
  const header = [
    "USN", "STUDENT NAME",
    "Q1A","Q1B","Q2A","Q2B","Q3A","Q3B",
    "Q4A","Q4B","Q5A","Q5B","Q6A","Q6B","Q7A","Q7B","Q8A","Q8B",
  ];
  const samples = [
    ["1DS23AI001","STUDENT ONE", 6,4, 5,5, 7,3, "","", "","", 6,4, "","", "",""],
    ["1DS23AI002","STUDENT TWO", 4,3, 8,2, "","", 5,5, "","", "","", 7,3, "",""],
  ];
  const ws = XLSX.utils.aoa_to_sheet([header, ...samples]);
  ws["!cols"] = header.map((_, i) => ({ wch: i < 2 ? 18 : 6 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "CIE Marks Template");
  XLSX.writeFile(wb, "CIE_Marks_Template.xlsx");
}

// ── Compact drop zone ─────────────────────────────────────────────────────────
function DropZone({ onFile, file, uploading }) {
  const onDrop = useCallback(
    (accepted) => { if (accepted[0]) onFile(accepted[0]); },
    [onFile]
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
      "text/csv": [".csv"],
    },
    multiple: false,
    disabled: uploading,
  });

  return (
    <div
      {...getRootProps()}
      className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center cursor-pointer transition-all duration-200
        ${uploading ? "opacity-50 cursor-not-allowed" : ""}
        ${isDragActive
          ? "border-primary-500 bg-primary-50 dark:border-dark-green-500 dark:bg-dark-green-500/10"
          : file
          ? "border-green-400 bg-green-50 dark:border-green-600 dark:bg-green-900/10"
          : "border-neutral-300 dark:border-dark-border hover:border-primary-400 dark:hover:border-dark-green-500 hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary/30"
        }`}
    >
      <input {...getInputProps()} />
      {file ? (
        <>
          <FileSpreadsheet className="w-7 h-7 text-green-500" />
          <p className="text-sm font-medium text-green-700 dark:text-green-400 truncate max-w-full px-2">{file.name}</p>
          <p className="text-xs text-neutral-400">{(file.size / 1024).toFixed(1)} KB — click to change</p>
        </>
      ) : (
        <>
          <CloudUpload className={`w-7 h-7 ${isDragActive ? "text-primary-500" : "text-neutral-400"}`} />
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
            {isDragActive ? "Drop file here" : "Drop file or click to browse"}
          </p>
          <div className="flex gap-1.5">
            {[".CSV", ".XLSX", ".XLS"].map(ext => (
              <span key={ext} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-dark-bg-tertiary text-neutral-500 dark:text-neutral-400">{ext}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Stat chip ─────────────────────────────────────────────────────────────────
function StatChip({ icon: Icon, label, value, color = "green" }) {
  const colors = {
    green:  "bg-green-50  dark:bg-green-900/20  text-green-700  dark:text-green-400  border-green-200  dark:border-green-800",
    blue:   "bg-blue-50   dark:bg-blue-900/20   text-blue-700   dark:text-blue-400   border-blue-200   dark:border-blue-800",
    purple: "bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800",
    amber:  "bg-amber-50  dark:bg-amber-900/20  text-amber-700  dark:text-amber-400  border-amber-200  dark:border-amber-800",
  };
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${colors[color]}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] font-medium opacity-70 leading-none mb-0.5">{label}</p>
        <p className="text-sm font-bold leading-none truncate">{value ?? "—"}</p>
      </div>
    </div>
  );
}

// ── Upload slot card ──────────────────────────────────────────────────────────
function UploadSlot({ slot, courseId, uploadedSlotIds, onUploaded }) {
  const [file, setFile]                 = useState(null);
  const [assessmentName, setName]       = useState(slot.defaultName);
  const [uploading, setUploading]       = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  const isUploaded = uploadResult !== null || uploadedSlotIds.has(slot.id);

  const colorRing = {
    blue:   isUploaded ? "border-green-400 dark:border-green-600" : "border-blue-200 dark:border-blue-800",
    green:  isUploaded ? "border-green-400 dark:border-green-600" : "border-green-200 dark:border-green-800",
    purple: isUploaded ? "border-green-400 dark:border-green-600" : "border-purple-200 dark:border-purple-800",
  }[slot.color] ?? "border-neutral-200 dark:border-dark-border";

  const headerBg = {
    blue:   "bg-blue-50   dark:bg-blue-950/40",
    green:  "bg-green-50  dark:bg-green-950/40",
    purple: "bg-purple-50 dark:bg-purple-950/40",
  }[slot.color] ?? "bg-neutral-50 dark:bg-dark-bg-secondary";

  const handleUpload = async () => {
    if (!file)                  { toast.error("Please select a file");             return; }
    if (!assessmentName.trim()) { toast.error("Please enter an assessment name");  return; }
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("courseId", courseId);
      fd.append("assessmentName", assessmentName.trim());
      const token = localStorage.getItem("token");
      const resp = await axios.post(`${UPLOAD_SERVICE_URL}/upload`, fd, {
        headers: {
          "Content-Type": "multipart/form-data",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      setUploadResult(resp.data);
      toast.success(`${slot.label} uploaded successfully!`);
      onUploaded?.(assessmentName.trim());
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.div
      layout
      className={`rounded-2xl border-2 overflow-hidden transition-colors duration-300 bg-white dark:bg-dark-bg-secondary ${colorRing}`}
    >
      {/* Card header */}
      <div className={`flex items-center gap-3 px-4 py-3 ${headerBg}`}>
        {isUploaded
          ? <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
          : <Circle className="w-5 h-5 text-neutral-300 dark:text-neutral-600 shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm ${isUploaded ? "text-green-700 dark:text-green-400" : "text-neutral-800 dark:text-dark-text-primary"}`}>
            {slot.label}
          </p>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 truncate">{slot.hint}</p>
        </div>
        {isUploaded && (
          <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
            Uploaded
          </span>
        )}
      </div>

      {/* Card body */}
      <AnimatePresence mode="wait">
        {isUploaded ? (
          /* ── Success state ─────────────────────────────── */
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="p-4 space-y-3"
          >
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm font-medium">
                {uploadResult
                  ? `${uploadResult.file_name || file?.name || "File"} processed`
                  : `${slot.label} data is loaded`}
              </span>
            </div>

            {uploadResult && (
              <div className="grid grid-cols-2 gap-2">
                <StatChip
                  icon={Users}
                  label="Students enrolled"
                  value={uploadResult.enrollment?.enrolled ?? uploadResult.row_count}
                  color="green"
                />
                <StatChip
                  icon={Hash}
                  label="Scores processed"
                  value={uploadResult.scores_processed ?? "—"}
                  color="blue"
                />
                <StatChip
                  icon={FileSpreadsheet}
                  label="Rows in file"
                  value={uploadResult.row_count ?? "—"}
                  color="purple"
                />
                <StatChip
                  icon={BarChart2}
                  label="New accounts"
                  value={uploadResult.enrollment?.created ?? "—"}
                  color="amber"
                />
              </div>
            )}

            {/* Re-upload link */}
            <button
              className="text-xs text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 underline underline-offset-2 transition-colors"
              onClick={() => { setUploadResult(null); setFile(null); setName(slot.defaultName); }}
            >
              Replace / re-upload
            </button>
          </motion.div>
        ) : (
          /* ── Upload form ───────────────────────────────── */
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="p-4 space-y-3"
          >
            {/* Format hint */}
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/50 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              <span className="font-semibold">Format: </span>
              Columns <strong>Q1A, Q1B … Q8A, Q8B</strong> (sub-questions) or <strong>Q1 … Q8</strong> (single).
              Each main question = 10 marks.{" "}
              <button
                type="button"
                onClick={downloadCIETemplate}
                className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-200 ml-1"
              >
                <Download className="w-3 h-3" /> Template
              </button>
            </div>

            {/* Assessment name */}
            <div>
              <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                Assessment Name
              </label>
              <input
                type="text"
                value={assessmentName}
                onChange={e => setName(e.target.value)}
                disabled={uploading}
                className="w-full px-3 py-2 bg-white dark:bg-dark-bg-tertiary border border-neutral-200 dark:border-dark-border rounded-lg text-sm text-neutral-800 dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-primary-400 dark:focus:ring-dark-green-500 disabled:opacity-50"
              />
            </div>

            {/* Drop zone */}
            <DropZone onFile={setFile} file={file} uploading={uploading} />

            {/* Actions */}
            <div className="flex items-center gap-2 justify-end">
              {file && !uploading && (
                <button
                  onClick={() => setFile(null)}
                  className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Clear
                </button>
              )}
              <Button
                size="sm"
                onClick={handleUpload}
                disabled={!file || uploading}
                className="ml-auto"
              >
                {uploading
                  ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Uploading…</>
                  : <><CloudUpload className="w-4 h-4 mr-1.5" />Upload {slot.label}</>}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}



// ── SEE Upload Slot ───────────────────────────────────────────────────────────
function SEEUploadSlot({ courseId, hasSEEUploaded, onUploaded }) {
  const [file, setFile]           = useState(null);
  const [uploading, setUploading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [result, setResult]       = useState(null);
  const fileRef = useRef(null);

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { USN: "1MS22CS001", SEE_Marks: 75 },
      { USN: "1MS22CS002", SEE_Marks: 82 },
      { USN: "1MS22CS003", SEE_Marks: 68 },
    ]);
    ws["!cols"] = [{ wch: 15 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SEE Marks Template");
    XLSX.writeFile(wb, "SEE_Marks_Template.xlsx");
  };

  const handleUpload = async () => {
    if (!file) { toast.error("Please select a file"); return; }
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);
      const marksData = rows
        .map(r => ({
          usn: (r.USN || r.usn || "").toString().trim(),
          see_marks: parseFloat(r.SEE_Marks ?? r.see_marks ?? r.Marks ?? r.marks ?? NaN),
        }))
        .filter(r => r.usn && !isNaN(r.see_marks));

      if (marksData.length === 0) {
        toast.error("No valid rows found. Ensure columns USN and SEE_Marks exist.");
        return;
      }
      const token = localStorage.getItem("token");
      const resp = await axios.post(
        `${API_BASE}/see-marks/courses/${courseId}/upload`,
        { marksData },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = resp.data.data || resp.data;
      setResult(data);
      toast.success(`SEE: ${data.uploaded ?? 0} uploaded, ${data.updated ?? 0} updated`);
      onUploaded?.();

      // Auto-recalculate final grades + SGPA for all students in this course
      setRecalculating(true);
      try {
        await axios.post(
          `${API_BASE}/grades/courses/${courseId}/calculate`,
          {},
          { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
        );
        toast.success("Grades & SGPA recalculated automatically");
      } catch {
        toast("Grades not recalculated — click Recalculate on Student Progression if needed", { icon: "⚠️" });
      } finally {
        setRecalculating(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "SEE upload failed");
    } finally {
      setUploading(false);
    }
  };

  const isUploaded = result !== null || hasSEEUploaded;

  return (
    <motion.div
      layout
      className={`rounded-2xl border-2 overflow-hidden bg-white dark:bg-dark-bg-secondary transition-colors duration-300
        ${isUploaded ? "border-green-400 dark:border-green-600" : "border-red-200 dark:border-red-900"}`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-950/30">
        {isUploaded
          ? <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
          : <Circle className="w-5 h-5 text-neutral-300 dark:text-neutral-600 shrink-0" />}
        <div className="flex-1">
          <p className={`font-semibold text-sm ${isUploaded ? "text-green-700 dark:text-green-400" : "text-neutral-800 dark:text-dark-text-primary"}`}>
            SEE Marks
          </p>
          <p className="text-[11px] text-neutral-400">Semester End Examination (out of 100)</p>
        </div>
        {isUploaded && (
          <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
            Uploaded
          </span>
        )}
      </div>

      <AnimatePresence mode="wait">
        {isUploaded ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 space-y-3"
          >
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm font-medium">SEE marks loaded</span>
              {recalculating && (
                <span className="flex items-center gap-1 text-xs text-neutral-400 ml-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> Recalculating grades…
                </span>
              )}
            </div>
            {result && (
              <div className="grid grid-cols-3 gap-2">
                <StatChip icon={Users}  label="Uploaded"  value={result.uploaded}  color="green"  />
                <StatChip icon={RefreshCw} label="Updated" value={result.updated}  color="blue"   />
                <StatChip icon={AlertCircle} label="Failed"  value={result.failed}   color="amber"  />
              </div>
            )}
            <button
              className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 underline underline-offset-2"
              onClick={() => { setResult(null); setFile(null); }}
            >
              Re-upload
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 space-y-3"
          >
            <p className="text-xs text-red-700 dark:text-red-300">
              Upload an Excel/CSV with columns <strong>USN</strong> and <strong>SEE_Marks</strong> (0–100).
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="w-3.5 h-3.5 mr-1" /> Template
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="text-red-600 border-red-300"
              >
                <FileText className="w-3.5 h-3.5 mr-1" />
                {file ? file.name : "Choose File"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => { if (e.target.files[0]) setFile(e.target.files[0]); e.target.value = ""; }}
              />
              {file && !uploading && (
                <button onClick={() => setFile(null)} className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {file && (
              <Button size="sm" onClick={handleUpload} disabled={uploading || recalculating}>
                {uploading
                  ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Uploading…</>
                  : <><CloudUpload className="w-4 h-4 mr-1.5" />Upload SEE</>}
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Section progress bar ──────────────────────────────────────────────────────
function SectionProgress({ slots, uploadedSlotIds, localUploaded }) {
  const done = slots.filter(s => uploadedSlotIds.has(s.id) || localUploaded.has(s.id)).length;
  const pct  = Math.round((done / slots.length) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 rounded-full bg-neutral-200 dark:bg-dark-border overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-green-400 dark:bg-green-500"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500 shrink-0">
        {done}/{slots.length}
      </span>
    </div>
  );
}

// ── Main hub ──────────────────────────────────────────────────────────────────
const UploadMarksNew = () => {
  const [courses, setCourses]             = useState([]);
  const [selectedSemester, setSelectedSemester] = useState("");
  const [selectedCourse, setSelected]     = useState("");
  const [selectedCourseObj, setCourseObj] = useState(null);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [uploadedSlotIds, setUploadedSlotIds] = useState(new Set());
  const [localUploaded, setLocalUploaded] = useState(new Set());   // uploaded this session
  const [hasSEEUploaded, setSEEUploaded]  = useState(false);
  const [refreshing, setRefreshing]       = useState(false);
  // CIE configuration for low-credit non-lab courses
  const [lowCreditHasCIE, setLowCreditHasCIE]     = useState(null); // null | true | false
  const [lowCreditCIECount, setLowCreditCIECount]  = useState(null); // null | 1 | 2 | 3

  useEffect(() => { loadCourses(); }, []);

  const loadCourses = async () => {
    try {
      setLoadingCourses(true);
      const res = await courseAPI.getAll();
      setCourses(res.data.data || []);
    } catch {
      toast.error("Failed to load courses");
    } finally {
      setLoadingCourses(false);
    }
  };

  const availableSemesters = [...new Set(courses.map(c => parseInt(c.semester)))].sort((a, b) => a - b);
  const semesterCourses = selectedSemester
    ? courses.filter(c => String(c.semester) === String(selectedSemester))
    : [];

  const handleSemesterChange = (sem) => {
    setSelectedSemester(sem);
    setSelected("");
    setCourseObj(null);
    setUploadedSlotIds(new Set());
    setLocalUploaded(new Set());
    setSEEUploaded(false);
    setLowCreditHasCIE(null);
    setLowCreditCIECount(null);
  };

  const loadMarksheets = useCallback(async (courseId) => {
    if (!courseId) return;
    try {
      const res = await marksheetAPI.getByCourse(courseId);
      const sheets = res.data.data || [];
      const names  = sheets.map(s => s.assessment_name || "");
      setUploadedSlotIds(buildUploadedSlotIds(names));
    } catch { /* ignore */ }
    try {
      const token  = localStorage.getItem("token");
      const seeRes = await axios.get(`${API_BASE}/see-marks/courses/${courseId}/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSEEUploaded((seeRes.data.data?.totalUploaded ?? 0) > 0);
    } catch { /* ignore */ }
  }, []);

  const handleCourseChange = async (courseId) => {
    setSelected(courseId);
    setUploadedSlotIds(new Set());
    setLocalUploaded(new Set());
    setSEEUploaded(false);
    setLowCreditHasCIE(null);
    setLowCreditCIECount(null);
    if (!courseId) { setCourseObj(null); return; }
    try {
      const res = await courseAPI.getById(courseId);
      setCourseObj(res.data.data || res.data);
    } catch {
      setCourseObj(courses.find(c => c.id === courseId) || null);
    }
    await loadMarksheets(courseId);
  };

  const handleRefresh = async () => {
    if (!selectedCourse) return;
    setRefreshing(true);
    try {
      const [courseRes] = await Promise.all([
        courseAPI.getById(selectedCourse),
        loadMarksheets(selectedCourse),
      ]);
      setCourseObj(courseRes.data.data || courseRes.data);
      setLocalUploaded(new Set());
      toast.success("Refreshed");
    } catch {
      toast.error("Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  // When a slot is uploaded this session, record it so the progress bar updates
  const handleSlotUploaded = (slotId) => {
    setLocalUploaded(prev => new Set([...prev, slotId]));
  };

  const isLowCreditNonLab = selectedCourseObj &&
    parseInt(selectedCourseObj.credits) <= 2 &&
    selectedCourseObj.course_type !== 'STANDALONE_LAB';

  const cieConfig = { hasCIE: lowCreditHasCIE, count: lowCreditCIECount };
  const sections = selectedCourseObj
    ? getSections(selectedCourseObj.course_type, selectedCourseObj.credits ?? 3, isLowCreditNonLab ? cieConfig : null)
    : [];

  const courseTypeBadge = {
    IPCC:             "bg-blue-100  text-blue-700  dark:bg-blue-900/30  dark:text-blue-300",
    STANDALONE_LAB:   "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    STANDALONE_THEORY:"bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  }[selectedCourseObj?.course_type] ?? "bg-neutral-100 text-neutral-700";

  const courseTypeLabel = {
    IPCC:             "IPCC — Theory + Lab",
    STANDALONE_LAB:   "Standalone Lab",
    STANDALONE_THEORY:"Theory",
  }[selectedCourseObj?.course_type] ?? "Theory";

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-dark-bg-primary dark:to-dark-bg-secondary py-12">
      <div className="container mx-auto px-4 md:px-6 max-w-5xl">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="bg-gradient-to-r from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
            <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/10" />
            <div className="relative z-10">
              <h1 className="text-4xl md:text-5xl font-bold mb-2">Assessment Upload Hub</h1>
              <p className="text-lg opacity-90">Select a course and upload all its assessment components</p>
            </div>
          </div>
        </motion.div>

        {/* Step 1 — Semester selector */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-4">
          <Card className={`transition-all duration-300 ${selectedSemester ? "border-2 border-primary-500 dark:border-dark-green-500 shadow-md" : "border-2"}`}>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <BookOpen className="w-6 h-6 text-primary-600 dark:text-dark-green-500" />
                <h2 className="text-xl font-bold text-neutral-800 dark:text-dark-text-primary">
                  Step 1 — Select Semester
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {loadingCourses ? (
                  <p className="text-sm text-neutral-400">Loading semesters…</p>
                ) : availableSemesters.length === 0 ? (
                  <p className="text-sm text-neutral-400">No courses found.</p>
                ) : (
                  availableSemesters.map(sem => (
                    <button
                      key={sem}
                      onClick={() => handleSemesterChange(String(sem))}
                      className={`px-5 py-2.5 rounded-xl font-semibold text-sm border-2 transition-all duration-200
                        ${String(selectedSemester) === String(sem)
                          ? "border-primary-500 bg-primary-500 text-white dark:border-dark-green-500 dark:bg-dark-green-500 shadow"
                          : "border-neutral-300 dark:border-dark-border text-neutral-700 dark:text-neutral-300 hover:border-primary-400 dark:hover:border-dark-green-500 hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary"
                        }`}
                    >
                      Semester {sem}
                      <span className="ml-2 text-xs opacity-70">
                        ({courses.filter(c => String(c.semester) === String(sem)).length})
                      </span>
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Step 2 — Course selector (only shown after semester selected) */}
        <AnimatePresence>
        {selectedSemester && (
          <motion.div
            key={`course-sel-${selectedSemester}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="mb-8"
          >
            <Card className={`transition-all duration-300 ${selectedCourse ? "border-2 border-primary-500 dark:border-dark-green-500 shadow-lg" : "border-2"}`}>
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <GraduationCap className="w-6 h-6 text-primary-600 dark:text-dark-green-500" />
                  <h2 className="text-xl font-bold text-neutral-800 dark:text-dark-text-primary">
                    Step 2 — Select Course
                    <span className="ml-2 text-sm font-normal text-neutral-500">
                      (Semester {selectedSemester} · {semesterCourses.length} courses)
                    </span>
                  </h2>
                  {selectedCourse && (
                    <button
                      onClick={handleRefresh}
                      disabled={refreshing}
                      className="ml-auto p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary transition-colors"
                      title="Refresh"
                    >
                      <RefreshCw className={`w-4 h-4 text-neutral-500 ${refreshing ? "animate-spin" : ""}`} />
                    </button>
                  )}
                </div>
                <select
                  value={selectedCourse}
                  onChange={e => handleCourseChange(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-dark-bg-secondary border-2 border-neutral-300 dark:border-dark-border rounded-xl text-neutral-800 dark:text-dark-text-primary font-medium focus:outline-none focus:border-primary-500 dark:focus:border-dark-green-500"
                >
                  <option value="">-- Select a course --</option>
                  {semesterCourses.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}  ({c.course_type || "THEORY"} · {c.credits ?? 3} cr · {c.year})
                    </option>
                  ))}
                </select>
              </CardContent>
            </Card>
          </motion.div>
        )}
        </AnimatePresence>

        {/* Upload hub */}
        <AnimatePresence>
          {selectedCourseObj && (
            <motion.div
              key={selectedCourse}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              {/* Course banner */}
              <div className="flex flex-wrap items-center gap-3 px-5 py-4 rounded-2xl bg-white dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border shadow">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-neutral-800 dark:text-dark-text-primary text-lg truncate">
                    {selectedCourseObj.code} — {selectedCourseObj.name}
                  </p>
                  <p className="text-sm text-neutral-500 dark:text-dark-text-muted">
                    Semester {selectedCourseObj.semester} · {selectedCourseObj.year} · {selectedCourseObj.credits || 3} credits
                  </p>
                </div>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${courseTypeBadge}`}>
                  {courseTypeLabel}
                </span>
              </div>

              {/* IPCC banner */}
              {selectedCourseObj.course_type === "IPCC" && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300">
                  <FlaskConical className="w-4 h-4 mt-0.5 shrink-0" />
                  <span><strong>IPCC Course</strong> — Upload theory CIA marks and lab CIA marks separately.</span>
                </div>
              )}

              {/* CIE Configuration — only for 1-2 credit non-lab courses */}
              {isLowCreditNonLab && (
                <AnimatePresence>
                  <motion.div
                    key="cie-config"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Card className={`border-2 transition-all duration-300 ${lowCreditHasCIE !== null ? 'border-primary-500 dark:border-dark-green-500 shadow-md' : 'border-amber-300 dark:border-amber-700'}`}>
                      <CardContent className="p-6">
                        <div className="flex items-center gap-2 mb-3">
                          <BookOpen className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                          <h3 className="text-base font-bold text-neutral-800 dark:text-dark-text-primary">
                            CIE Configuration
                          </h3>
                          <span className="ml-1 text-xs text-neutral-400">
                            ({selectedCourseObj.credits} credit course)
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 dark:text-dark-text-secondary mb-4">
                          Does this course have internal assessments (CIEs)?
                        </p>
                        <div className="flex gap-3 flex-wrap mb-4">
                          <button
                            onClick={() => { setLowCreditHasCIE(true); setLowCreditCIECount(null); }}
                            className={`px-5 py-2.5 rounded-xl font-semibold text-sm border-2 transition-all duration-200
                              ${lowCreditHasCIE === true
                                ? 'border-primary-500 bg-primary-500 text-white dark:border-dark-green-500 dark:bg-dark-green-500 shadow'
                                : 'border-neutral-300 dark:border-dark-border text-neutral-700 dark:text-neutral-300 hover:border-primary-400 dark:hover:border-dark-green-500 hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary'}`}
                          >
                            Yes — has CIEs
                          </button>
                          <button
                            onClick={() => { setLowCreditHasCIE(false); setLowCreditCIECount(null); }}
                            className={`px-5 py-2.5 rounded-xl font-semibold text-sm border-2 transition-all duration-200
                              ${lowCreditHasCIE === false
                                ? 'border-primary-500 bg-primary-500 text-white dark:border-dark-green-500 dark:bg-dark-green-500 shadow'
                                : 'border-neutral-300 dark:border-dark-border text-neutral-700 dark:text-neutral-300 hover:border-primary-400 dark:hover:border-dark-green-500 hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary'}`}
                          >
                            No — final marks only
                          </button>
                        </div>

                        <AnimatePresence>
                          {lowCreditHasCIE === true && (
                            <motion.div
                              key="cie-count"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <p className="text-sm text-neutral-600 dark:text-dark-text-secondary mb-3">
                                How many CIEs does this course have?
                              </p>
                              <div className="flex gap-3">
                                {[1, 2, 3].map(n => (
                                  <button
                                    key={n}
                                    onClick={() => setLowCreditCIECount(n)}
                                    className={`w-16 py-2.5 rounded-xl font-bold text-sm border-2 transition-all duration-200
                                      ${lowCreditCIECount === n
                                        ? 'border-primary-500 bg-primary-500 text-white dark:border-dark-green-500 dark:bg-dark-green-500 shadow'
                                        : 'border-neutral-300 dark:border-dark-border text-neutral-700 dark:text-neutral-300 hover:border-primary-400 dark:hover:border-dark-green-500 hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary'}`}
                                  >
                                    {n}
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                          {lowCreditHasCIE === false && (
                            <motion.p
                              key="no-cie-note"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="text-xs text-neutral-400 dark:text-neutral-500"
                            >
                              Final grade = uploaded SEE marks × 2 (normalised to 100)
                            </motion.p>
                          )}
                        </AnimatePresence>
                      </CardContent>
                    </Card>
                  </motion.div>
                </AnimatePresence>
              )}

              {/* Sections */}
              {sections.map((section, si) => (
                <motion.div
                  key={section.title}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: si * 0.07 }}
                >
                  {/* Section header */}
                  <div className="flex items-center gap-2 mb-2">
                    <section.icon className="w-4 h-4 text-neutral-500 dark:text-dark-text-muted" />
                    <h3 className="text-sm font-bold text-neutral-500 dark:text-dark-text-muted uppercase tracking-wider">
                      {section.title}
                    </h3>
                    <div className="flex-1 h-px bg-neutral-200 dark:bg-dark-border" />
                  </div>

                  {/* Section progress */}
                  <div className="mb-4">
                    <SectionProgress
                      slots={section.slots}
                      uploadedSlotIds={uploadedSlotIds}
                      localUploaded={localUploaded}
                    />
                  </div>

                  {/* Slot grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {section.slots.map(slot => (
                      <UploadSlot
                        key={slot.id}
                        slot={slot}
                        courseId={selectedCourse}
                        uploadedSlotIds={uploadedSlotIds}
                        onUploaded={(name) => {
                          // Update exact-match detection from server-side names
                          setUploadedSlotIds(prev => new Set([...prev, slot.id]));
                          handleSlotUploaded(slot.id);
                        }}
                      />
                    ))}
                  </div>
                </motion.div>
              ))}

              {/* SEE Section */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: sections.length * 0.07 }}
              >
                <div className="flex items-center gap-2 mb-2 mt-6">
                  <FileText className="w-4 h-4 text-neutral-500 dark:text-dark-text-muted" />
                  <h3 className="text-sm font-bold text-neutral-500 dark:text-dark-text-muted uppercase tracking-wider">
                    Semester End Exam (SEE)
                  </h3>
                  <div className="flex-1 h-px bg-neutral-200 dark:bg-dark-border" />
                </div>
                <SEEUploadSlot
                  courseId={selectedCourse}
                  hasSEEUploaded={hasSEEUploaded}
                  onUploaded={() => setSEEUploaded(true)}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default UploadMarksNew;
