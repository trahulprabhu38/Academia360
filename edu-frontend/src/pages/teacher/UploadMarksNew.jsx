import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import * as XLSX from "xlsx";
import {
  CloudUpload, GraduationCap, FlaskConical,
  BookOpen, CheckCircle, Circle, ChevronDown, ChevronUp,
  FileUp, X, RefreshCw, Download, FileText,
} from "lucide-react";
import toast from "react-hot-toast";
import UploadZone from "../../components/upload/UploadZone";
import UploadSummary from "../../components/upload/UploadSummary";
import DatasetTable from "../../components/upload/DatasetTable";
import { courseAPI, marksheetAPI } from "../../services/api";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080/api";

const UPLOAD_SERVICE_URL = import.meta.env.VITE_UPLOAD_SERVICE_URL || "http://localhost:8001";

// ── Slot definitions ──────────────────────────────────────────────────────────
const THEORY_SLOTS = [
  { id: "cia1",    label: "CIA 1",      hint: "Continuous Internal Assessment 1", color: "blue",   defaultName: "CIA 1"    },
  { id: "cia2",    label: "CIA 2",      hint: "Continuous Internal Assessment 2", color: "blue",   defaultName: "CIA 2"    },
  { id: "cia3",    label: "CIA 3",      hint: "Continuous Internal Assessment 3", color: "blue",   defaultName: "CIA 3"    },
  { id: "aat",     label: "AAT / Quiz", hint: "Additional Assessment Task",        color: "purple", defaultName: "AAT Quiz" },
];
const LAB_SLOTS = [
  { id: "labcia1", label: "Lab CIA 1",  hint: "Lab Continuous Internal Exam 1",    color: "green",  defaultName: "Lab CIA 1" },
  { id: "labcia2", label: "Lab CIA 2",  hint: "Lab Continuous Internal Exam 2",    color: "green",  defaultName: "Lab CIA 2" },
  { id: "labia",   label: "Lab IA",     hint: "Lab Internal Assessment (Test)",     color: "green",  defaultName: "Lab IA"    },
];

function getSections(courseType) {
  if (courseType === "IPCC") return [
    { title: "Theory Components",       icon: BookOpen,    slots: THEORY_SLOTS },
    { title: "Lab Components (IPCC)",   icon: FlaskConical, slots: LAB_SLOTS   },
  ];
  if (courseType === "STANDALONE_LAB") return [
    { title: "Lab Components",          icon: FlaskConical, slots: LAB_SLOTS   },
  ];
  return [
    { title: "Theory Components",       icon: BookOpen,    slots: THEORY_SLOTS },
  ];
}

const COLOR_MAP = {
  blue:   { bg: "bg-blue-50 dark:bg-blue-950/30",   border: "border-blue-300 dark:border-blue-700",   text: "text-blue-700 dark:text-blue-300",   badge: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"   },
  green:  { bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-300 dark:border-green-700", text: "text-green-700 dark:text-green-300", badge: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300" },
  purple: { bg: "bg-purple-50 dark:bg-purple-950/30", border: "border-purple-300 dark:border-purple-700", text: "text-purple-700 dark:text-purple-300", badge: "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300" },
};

// ── Single upload slot ────────────────────────────────────────────────────────
function UploadSlot({ slot, courseId, uploadedNames, onUploaded }) {
  const [expanded, setExpanded] = useState(false);
  const [file, setFile] = useState(null);
  const [assessmentName, setAssessmentName] = useState(slot.defaultName);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const tableRef = useRef(null);

  // Check if this slot already has data uploaded
  const isUploaded = result !== null || uploadedNames.some(n => {
    const slotKey = slot.id.replace(/\d+$/, "").toLowerCase();   // e.g. "labcia" from "labcia1"
    const labelKey = slot.label.toLowerCase().replace(/\s+/g, ""); // e.g. "labcia1"
    return n.includes(slotKey) || n.includes(labelKey) || n.includes(slot.defaultName.toLowerCase().replace(/\s+/g,""));
  });

  const c = COLOR_MAP[slot.color] || COLOR_MAP.blue;

  const handleUpload = async () => {
    if (!file) { toast.error("Please select a file"); return; }
    if (!assessmentName.trim()) { toast.error("Please enter an assessment name"); return; }
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("courseId", courseId);
      fd.append("assessmentName", assessmentName.trim());
      const token = localStorage.getItem("token");
      const resp = await axios.post(`${UPLOAD_SERVICE_URL}/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      setResult(resp.data);
      toast.success(`${slot.label} uploaded successfully!`);
      onUploaded?.(assessmentName.trim());
      setTimeout(() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 600);
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition-all duration-200 ${isUploaded ? "border-green-400 dark:border-green-600" : "border-neutral-200 dark:border-dark-border"}`}>
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-neutral-50 dark:hover:bg-dark-bg-secondary transition-colors"
        onClick={() => setExpanded(p => !p)}
      >
        <div className="flex items-center gap-3">
          {isUploaded
            ? <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
            : <Circle className="w-5 h-5 text-neutral-300 dark:text-neutral-600 shrink-0" />}
          <div className="text-left">
            <p className={`font-semibold ${isUploaded ? "text-green-700 dark:text-green-400" : "text-neutral-800 dark:text-dark-text-primary"}`}>
              {slot.label}
            </p>
            <p className="text-xs text-neutral-500 dark:text-dark-text-muted">{slot.hint}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isUploaded && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.badge}`}>Uploaded</span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className={`p-4 border-t ${c.border} ${c.bg}`}>
              <div className="mb-3">
                <label className="block text-sm font-semibold text-neutral-700 dark:text-dark-text-primary mb-1">
                  Assessment Name *
                </label>
                <input
                  type="text"
                  value={assessmentName}
                  onChange={e => setAssessmentName(e.target.value)}
                  placeholder={`e.g., ${slot.defaultName}`}
                  disabled={uploading}
                  className="w-full px-3 py-2 bg-white dark:bg-dark-bg-secondary border-2 border-neutral-300 dark:border-dark-border rounded-xl text-sm text-neutral-800 dark:text-dark-text-primary focus:outline-none focus:border-primary-500 dark:focus:border-dark-green-500 disabled:opacity-50"
                />
              </div>
              <UploadZone onFileSelect={setFile} selectedFile={file} uploading={uploading} />
              {file && !result && (
                <div className="mt-3 flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => { setFile(null); }}>
                    <X className="w-4 h-4 mr-1" /> Clear
                  </Button>
                  <Button size="sm" onClick={handleUpload} disabled={uploading}>
                    {uploading
                      ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Uploading…</>
                      : <><CloudUpload className="w-4 h-4 mr-2" />Upload {slot.label}</>}
                  </Button>
                </div>
              )}
              {result && (
                <div className="mt-4">
                  <UploadSummary result={result} onViewTable={() => tableRef.current?.scrollIntoView({ behavior: "smooth" })} onExport={() => {}} />
                  {result.preview && (
                    <div ref={tableRef} className="mt-4">
                      <DatasetTable data={result.preview} columns={result.columns} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── SEE Upload Slot ───────────────────────────────────────────────────────────
function SEEUploadSlot({ courseId, hasSEEUploaded, onUploaded }) {
  const [expanded, setExpanded] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const downloadTemplate = () => {
    const template = [
      { USN: "1MS22CS001", SEE_Marks: 75 },
      { USN: "1MS22CS002", SEE_Marks: 82 },
      { USN: "1MS22CS003", SEE_Marks: 68 },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    ws["!cols"] = [{ wch: 15 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SEE Marks Template");
    XLSX.writeFile(wb, "SEE_Marks_Template.xlsx");
  };

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) setFile(f);
    e.target.value = "";
  };

  const handleUpload = async () => {
    if (!file) { toast.error("Please select a file"); return; }
    setUploading(true);
    try {
      // Parse the Excel / CSV file
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);

      const marksData = rows
        .map((r) => ({
          usn: (r.USN || r.usn || "").toString().trim(),
          see_marks: parseFloat(r.SEE_Marks ?? r.see_marks ?? r.Marks ?? r.marks ?? NaN),
        }))
        .filter((r) => r.usn && !isNaN(r.see_marks));

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
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "SEE upload failed");
    } finally {
      setUploading(false);
    }
  };

  const isUploaded = result !== null || hasSEEUploaded;
  const cRed = {
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-300 dark:border-red-700",
    text: "text-red-700 dark:text-red-300",
    badge: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
  };

  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition-all duration-200 ${isUploaded ? "border-green-400 dark:border-green-600" : "border-neutral-200 dark:border-dark-border"}`}>
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-neutral-50 dark:hover:bg-dark-bg-secondary transition-colors"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex items-center gap-3">
          {isUploaded
            ? <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
            : <Circle className="w-5 h-5 text-neutral-300 dark:text-neutral-600 shrink-0" />}
          <div className="text-left">
            <p className={`font-semibold ${isUploaded ? "text-green-700 dark:text-green-400" : "text-neutral-800 dark:text-dark-text-primary"}`}>
              SEE Marks
            </p>
            <p className="text-xs text-neutral-500 dark:text-dark-text-muted">
              Semester End Examination total marks (out of 100)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isUploaded && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cRed.badge}`}>Uploaded</span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className={`p-4 border-t ${cRed.border} ${cRed.bg} space-y-3`}>
              {/* Info */}
              <p className="text-xs text-red-700 dark:text-red-300">
                Upload an Excel/CSV with columns <strong>USN</strong> and <strong>SEE_Marks</strong> (0–100).
                Marks are stored in the SEE attainment pipeline immediately.
              </p>

              {/* Template + file actions */}
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download className="w-4 h-4 mr-1" /> Download Template
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className={`${cRed.text} border-red-300`}
                >
                  <FileText className="w-4 h-4 mr-1" />
                  {file ? file.name : "Choose File"}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {file && !result && (
                  <>
                    <Button size="sm" onClick={handleUpload} disabled={uploading}>
                      {uploading
                        ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Uploading…</>
                        : <><CloudUpload className="w-4 h-4 mr-2" />Upload SEE</>}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setFile(null)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>

              {/* Result */}
              {result && (
                <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-sm text-green-800 dark:text-green-300">
                  <CheckCircle className="w-4 h-4 inline mr-1" />
                  <strong>Upload complete:</strong> {result.uploaded ?? 0} uploaded,{" "}
                  {result.updated ?? 0} updated, {result.failed ?? 0} failed.
                  {result.failed > 0 && (
                    <p className="mt-1 text-xs text-red-600">
                      {result.errors?.slice(0, 3).map((e) => `${e.usn}: ${e.error}`).join(" | ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main hub ──────────────────────────────────────────────────────────────────
const UploadMarksNew = () => {
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [selectedCourseObj, setSelectedCourseObj] = useState(null);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [uploadedNames, setUploadedNames] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [hasSEEUploaded, setHasSEEUploaded] = useState(false);

  useEffect(() => { loadCourses(); }, []);

  const loadCourses = async () => {
    try {
      setLoadingCourses(true);
      const response = await courseAPI.getAll();
      setCourses(response.data.data || []);
    } catch {
      toast.error("Failed to load courses");
    } finally {
      setLoadingCourses(false);
    }
  };

  const loadMarksheets = useCallback(async (courseId) => {
    if (!courseId) return;
    try {
      const res = await marksheetAPI.getByCourse(courseId);
      const sheets = res.data.data || [];
      setUploadedNames(sheets.map(s => (s.assessment_name || "").toLowerCase()));
    } catch {/* ignore */}
    try {
      const token = localStorage.getItem("token");
      const seeRes = await axios.get(`${API_BASE}/see-marks/courses/${courseId}/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setHasSEEUploaded((seeRes.data.data?.totalUploaded ?? 0) > 0);
    } catch {/* ignore */}
  }, []);

  const handleCourseChange = async (courseId) => {
    setSelectedCourse(courseId);
    setUploadedNames([]);
    setHasSEEUploaded(false);
    if (!courseId) { setSelectedCourseObj(null); return; }

    // Always re-fetch the course from server for up-to-date course_type
    try {
      const res = await courseAPI.getById(courseId);
      setSelectedCourseObj(res.data.data || res.data);
    } catch {
      setSelectedCourseObj(courses.find(c => c.id === courseId) || null);
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
      setSelectedCourseObj(courseRes.data.data || courseRes.data);
      toast.success("Refreshed");
    } catch {
      toast.error("Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const sections = selectedCourseObj ? getSections(selectedCourseObj.course_type) : [];

  const courseTypeLabel = {
    IPCC: "IPCC — Theory + Lab",
    STANDALONE_LAB: "Standalone Lab",
    STANDALONE_THEORY: "Theory",
  }[selectedCourseObj?.course_type] || "Theory";

  const courseTypeBadge = {
    IPCC: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    STANDALONE_LAB: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    STANDALONE_THEORY: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  }[selectedCourseObj?.course_type] || "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300";

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-dark-bg-primary dark:to-dark-bg-secondary py-12">
      <div className="container mx-auto px-4 md:px-6 max-w-5xl">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="bg-gradient-to-r from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
            <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/10" />
            <div className="relative z-10">
              <h1 className="text-4xl md:text-5xl font-bold mb-2">Assessment Upload Hub</h1>
              <p className="text-lg opacity-90">Select a course to see and upload all its components</p>
            </div>
          </div>
        </motion.div>

        {/* Course selector */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
          <Card className={`transition-all duration-300 ${selectedCourse ? "border-2 border-primary-500 dark:border-dark-green-500 shadow-lg" : "border-2"}`}>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <GraduationCap className="w-6 h-6 text-primary-600 dark:text-dark-green-500" />
                <h2 className="text-xl font-bold text-neutral-800 dark:text-dark-text-primary">Select Course</h2>
                {selectedCourse && (
                  <button onClick={handleRefresh} disabled={refreshing} className="ml-auto p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary transition-colors" title="Refresh course type">
                    <RefreshCw className={`w-4 h-4 text-neutral-500 ${refreshing ? "animate-spin" : ""}`} />
                  </button>
                )}
              </div>
              <select
                value={selectedCourse}
                onChange={e => handleCourseChange(e.target.value)}
                disabled={loadingCourses}
                className="w-full px-4 py-3 bg-white dark:bg-dark-bg-secondary border-2 border-neutral-300 dark:border-dark-border rounded-xl text-neutral-800 dark:text-dark-text-primary font-medium focus:outline-none focus:border-primary-500 dark:focus:border-dark-green-500 disabled:opacity-50"
              >
                <option value="">-- Select a course --</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}  ({c.course_type || "THEORY"} · Sem {c.semester} · {c.year})
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>
        </motion.div>

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
                    {uploadedNames.length > 0 && (
                      <span className="ml-2 text-green-600 dark:text-green-400">· {uploadedNames.length} file{uploadedNames.length !== 1 ? "s" : ""} uploaded</span>
                    )}
                  </p>
                </div>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${courseTypeBadge}`}>
                  {courseTypeLabel}
                </span>
              </div>

              {/* IPCC info banner */}
              {selectedCourseObj.course_type === "IPCC" && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300">
                  <FlaskConical className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold">IPCC Course</span> — Upload theory CIA marks and lab CIA marks separately.
                    Lab marks (CO5 &amp; CO6) will be included in attainment calculations automatically.
                  </div>
                </div>
              )}

              {sections.length === 0 && (
                <div className="text-center py-12 text-neutral-400 dark:text-neutral-500">
                  <p className="text-sm">No upload slots configured for this course type.</p>
                  <p className="text-xs mt-1">Try refreshing — the course type may have been updated.</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={handleRefresh}>
                    <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                  </Button>
                </div>
              )}

              {sections.map((section, si) => (
                <motion.div key={section.title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: si * 0.07 }}>
                  <div className="flex items-center gap-2 mb-3">
                    <section.icon className="w-4 h-4 text-neutral-500 dark:text-dark-text-muted" />
                    <h3 className="text-sm font-bold text-neutral-500 dark:text-dark-text-muted uppercase tracking-wider">
                      {section.title}
                    </h3>
                    <div className="flex-1 h-px bg-neutral-200 dark:bg-dark-border" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {section.slots.map(slot => (
                      <UploadSlot
                        key={slot.id}
                        slot={slot}
                        courseId={selectedCourse}
                        uploadedNames={uploadedNames}
                        onUploaded={(name) => setUploadedNames(prev => [...prev, name.toLowerCase()])}
                      />
                    ))}
                  </div>
                </motion.div>
              ))}

              {/* SEE Section — always shown regardless of course type */}
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (sections.length) * 0.07 }}>
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-neutral-500 dark:text-dark-text-muted" />
                  <h3 className="text-sm font-bold text-neutral-500 dark:text-dark-text-muted uppercase tracking-wider">
                    Semester End Exam (SEE)
                  </h3>
                  <div className="flex-1 h-px bg-neutral-200 dark:bg-dark-border" />
                </div>
                <SEEUploadSlot
                  courseId={selectedCourse}
                  hasSEEUploaded={hasSEEUploaded}
                  onUploaded={() => setHasSEEUploaded(true)}
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
