import React, { useState } from 'react';
import {
  CloudUpload,
  Download,
  CheckCircle,
  AlertCircle,
  Info,
  Trash2,
  RefreshCw
} from 'lucide-react';
import axios from 'axios';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Alert } from '../ui/alert';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

/**
 * CO Mapping Upload Component
 * Allows teachers to upload CSV files mapping questions to COs for each assessment
 */
const COMappingUpload = ({ courseId, marksheet }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [error, setError] = useState(null);
  const [existingMappings, setExistingMappings] = useState([]);
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load existing mappings on mount and when marksheet changes
  React.useEffect(() => {
    if (marksheet?.id) {
      loadExistingMappings();
    }
  }, [marksheet?.id]);

  const loadExistingMappings = async () => {
    if (!marksheet?.id) return;

    try {
      setLoadingMappings(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/co-mapping/marksheet/${marksheet.id}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      const mappings = response.data.data || [];
      setExistingMappings(mappings);
      console.log(`✅ Loaded ${mappings.length} existing CO mappings for ${marksheet.assessment_name}`);
    } catch (err) {
      console.log('No existing mappings found:', err.response?.data?.message || err.message);
      setExistingMappings([]);
    } finally {
      setLoadingMappings(false);
    }
  };

  const handleDeleteMappings = async () => {
    if (!window.confirm(`Are you sure you want to delete all CO mappings for ${marksheet.assessment_name}?`)) {
      return;
    }

    try {
      setDeleting(true);
      setError(null);
      const token = localStorage.getItem('token');
      await axios.delete(
        `${API_URL}/co-mapping/marksheet/${marksheet.id}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      setExistingMappings([]);
      setUploadStatus({
        success: true,
        message: 'CO mappings deleted successfully'
      });

      // Clear status after 3 seconds
      setTimeout(() => setUploadStatus(null), 3000);
    } catch (err) {
      console.error('❌ Error deleting CO mappings:', err);
      setError(err.response?.data?.details || err.message || 'Failed to delete CO mappings');
    } finally {
      setDeleting(false);
    }
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      setError('Please upload a CSV or Excel (.xlsx / .xls) file');
      return;
    }

    setUploading(true);
    setError(null);
    setUploadStatus(null);

    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('courseId', courseId);
      formData.append('marksheetId', marksheet.id);

      console.log(`📤 Uploading CO mapping for ${marksheet.assessment_name}...`);

      const response = await axios.post(
        `${API_URL}/co-mapping/upload`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      console.log('✅ CO mapping uploaded:', response.data);

      setUploadStatus({
        success: true,
        message: `Successfully uploaded ${response.data.data.mappingsCount} CO mappings`,
        count: response.data.data.mappingsCount
      });

      // Reload mappings to show updated list
      await loadExistingMappings();

      // Reset file input
      event.target.value = '';
    } catch (err) {
      console.error('❌ CO mapping upload error:', err);
      setError(err.response?.data?.details || err.message || 'Failed to upload CO mapping');
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = async (type = 'aat') => {
    try {
      const isAAT = type === 'aat';
      const response = await axios.get(`${API_URL}/co-mapping/template?type=${type}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', isAAT ? 'aat-quiz-co-mapping-template.xlsx' : 'cie-co-mapping-template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Error downloading template:', err);
      setError('Failed to download template');
    }
  };

  return (
    <Card className="mb-4 border-2 border-neutral-200 dark:border-dark-border">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-lg font-bold text-neutral-800 dark:text-dark-text-primary">
            CO Mapping for {marksheet.assessment_name}
          </h3>
          <Badge variant="outline" className="border-primary-500 text-primary-600 dark:border-dark-green-500 dark:text-dark-green-500">
            <Info className="w-3 h-3 mr-1" />
            Upload CSV to map questions to COs
          </Badge>
        </div>

        {/* Upload Progress */}
        {uploading && (
          <div className="mb-4">
            <div className="w-full h-2 bg-neutral-200 dark:bg-dark-bg-tertiary rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary-500 to-secondary-500 animate-pulse" style={{ width: '100%' }} />
            </div>
            <p className="text-xs text-neutral-600 dark:text-dark-text-secondary mt-2">
              Uploading CO mapping...
            </p>
          </div>
        )}

        {/* Success Message */}
        {uploadStatus?.success && (
          <Alert
            variant="success"
            onClose={() => setUploadStatus(null)}
            className="mb-4"
          >
            <CheckCircle className="w-4 h-4" />
            {uploadStatus.message}
          </Alert>
        )}

        {/* Error Message */}
        {error && (
          <Alert
            variant="error"
            onClose={() => setError(null)}
            className="mb-4"
          >
            <AlertCircle className="w-4 h-4" />
            {error}
          </Alert>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 mb-4">
          <Button
            variant="default"
            className="bg-gradient-to-r from-primary-500 to-secondary-500"
            disabled={uploading || deleting}
            asChild
          >
            <label className="cursor-pointer">
              <CloudUpload className="w-4 h-4 mr-2" />
              {existingMappings.length > 0 ? 'Re-upload CO Mapping' : 'Upload CO Mapping'}
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileSelect}
              />
            </label>
          </Button>

          {/aat|quiz/i.test(marksheet.assessment_name) ? (
            <Button
              variant="outline"
              onClick={() => downloadTemplate('aat')}
              disabled={uploading || deleting}
            >
              <Download className="w-4 h-4 mr-2" />
              Download AAT/Quiz Template
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => downloadTemplate('cie')}
              disabled={uploading || deleting}
            >
              <Download className="w-4 h-4 mr-2" />
              Download CIE Template
            </Button>
          )}

          {existingMappings.length > 0 && (
            <>
              <Button
                variant="outline"
                onClick={handleDeleteMappings}
                disabled={uploading || deleting}
                className="border-error-500 text-error-600 hover:bg-error-50 dark:border-error-500 dark:text-error-500 dark:hover:bg-error-900/20"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {deleting ? 'Deleting...' : 'Delete Mappings'}
              </Button>
              {/* <Button
                variant="outline"
                onClick={loadExistingMappings}
                disabled={uploading || deleting || loadingMappings}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button> */}
            </>
          )}
        </div>

        {/* Loading State */}
        {loadingMappings && (
          <div className="mt-4">
            <div className="w-full h-2 bg-neutral-200 dark:bg-dark-bg-tertiary rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary-500 to-secondary-500 animate-pulse" style={{ width: '100%' }} />
            </div>
            <p className="text-xs text-neutral-600 dark:text-dark-text-secondary mt-2">
              Loading existing mappings...
            </p>
          </div>
        )}

        {/* Existing Mappings Display
        {!loadingMappings && existingMappings.length > 0 && (
          <div className="mt-4 p-4 bg-success-50 dark:bg-success-900/20 border-2 border-success-200 dark:border-success-800 rounded-xl">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h4 className="text-sm font-bold text-success-700 dark:text-success-500">
                ✅ CO Mapping Uploaded ({existingMappings.length} questions)
              </h4>
              <Badge variant="success">Active</Badge>
            </div>
            <p className="text-xs text-neutral-600 dark:text-dark-text-secondary mb-2">
              <strong>Mapped Questions:</strong> {existingMappings.slice(0, 5).map(m =>
                `${m.question_column}→CO${m.co_number}${m.max_marks ? ` (${m.max_marks} marks)` : ''}`
              ).join(', ')}
              {existingMappings.length > 5 && ` +${existingMappings.length - 5} more`}
            </p>
            <p className="text-[0.65rem] text-neutral-500 dark:text-dark-text-muted">
              Last updated: {new Date().toLocaleString()}
            </p>
          </div>
        )} */}

        {/* No Mappings State */}
        {!loadingMappings && existingMappings.length === 0 && (
          <div className="mt-4 p-4 bg-warning-50 dark:bg-warning-900/20 border-2 border-warning-200 dark:border-warning-800 rounded-xl">
            <p className="text-xs font-semibold text-warning-700 dark:text-warning-400 mb-1">
              No CO mapping uploaded yet
            </p>
            <p className="text-xs text-neutral-600 dark:text-dark-text-secondary">
              Upload a CSV to map each question column to a Course Outcome.
            </p>
          </div>
        )}

        {/* Format hint */}
        <div className="mt-4 p-4 bg-neutral-50 dark:bg-dark-bg-tertiary border border-neutral-200 dark:border-dark-border rounded-xl space-y-3">
          <p className="text-xs font-semibold text-neutral-700 dark:text-dark-text-primary">
            Accepted file formats: <span className="font-mono font-normal">.csv, .xlsx, .xls</span>
          </p>

          <div className="space-y-2 text-xs text-neutral-600 dark:text-dark-text-secondary">

            {/* Option 1 */}
            <div>
              <p className="font-semibold text-neutral-700 dark:text-dark-text-primary mb-0.5">
                Option 1 — Dedicated mapping file <span className="font-normal text-neutral-400">(recommended)</span>
              </p>
              <code className="block font-mono bg-neutral-100 dark:bg-dark-bg-secondary px-2 py-1.5 rounded text-[0.65rem] whitespace-pre leading-relaxed">
{`Column,Max Marks,CO
q1a,6,co1
q1b,4,co1
q2a,10,co3
q3a,5,co2
q3b,5,co2`}
              </code>
              <p className="mt-0.5 text-[0.65rem] text-neutral-400">
                CO values accept <strong>CO1</strong>, <strong>co1</strong>, or plain <strong>1</strong>. Max Marks column is optional (defaults to 10).
              </p>
            </div>

            {/* Option 2 */}
            <div>
              <p className="font-semibold text-neutral-700 dark:text-dark-text-primary mb-0.5">
                Option 2 — Same CIE marks file you already uploaded
              </p>
              <p className="text-[0.65rem] text-neutral-400">
                The parser automatically extracts CO mappings from the multi-row header
                (the rows that list CO1, CO2… above the Q1A, Q1B… question names).
                Just upload the same file you used for marks — no separate mapping file needed.
              </p>
            </div>

            {/* Option 3 */}
            <div>
              <p className="font-semibold text-neutral-700 dark:text-dark-text-primary mb-0.5">
                Option 3 — Transposed format <span className="font-normal text-neutral-400">(for AAT / Quiz)</span>
              </p>
              <code className="block font-mono bg-neutral-100 dark:bg-dark-bg-secondary px-2 py-1.5 rounded text-[0.65rem] whitespace-pre leading-relaxed">
{`AAT,QUIZ
CO,CO
CO1,CO2,CO3,CO4,CO1,CO2,CO3,CO4`}
              </code>
              <p className="mt-0.5 text-[0.65rem] text-neutral-400">
                Headers = question names (AAT, QUIZ). Row 2 = "CO" label. Row 3 = comma-separated CO numbers mapped to each column. Download the AAT/Quiz template (.xlsx) for the exact format.
              </p>
            </div>
          </div>

          <p className="text-[0.65rem] text-neutral-500 dark:text-dark-text-muted border-t border-neutral-200 dark:border-dark-border pt-2">
            Q1 &amp; Q2 are always compulsory. Q3/Q4, Q5/Q6, Q7/Q8 are optional pairs — sub-parts are grouped automatically.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default COMappingUpload;
