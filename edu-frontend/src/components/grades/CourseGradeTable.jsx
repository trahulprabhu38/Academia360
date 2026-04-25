import React from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import GradeBadge from './GradeBadge';

/**
 * CourseGradeTable Component
 * Displays detailed course-wise grades for a semester
 */
const CourseGradeTable = ({ courses, showSummary = true }) => {
  if (!courses || courses.length === 0) {
    return (
      <Card className="p-8 text-center bg-neutral-50 dark:bg-dark-bg-secondary">
        <p className="text-sm text-neutral-600 dark:text-dark-text-secondary">
          No course data available
        </p>
      </Card>
    );
  }

  const totalCredits = courses.reduce((sum, c) => sum + (c.credits || 0), 0);
  const earnedCredits = courses.reduce((sum, c) => sum + (c.passed ? (c.credits || 0) : 0), 0);
  const passedCount = courses.filter(c => c.passed).length;
  const failedCount = courses.filter(c => !c.passed).length;

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="border-2 border-neutral-200 dark:border-dark-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-neutral-100 dark:bg-dark-bg-secondary">
                <th className="px-4 py-3 text-left text-xs font-bold text-neutral-700 dark:text-dark-text-primary uppercase tracking-wider">
                  Code
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-neutral-700 dark:text-dark-text-primary uppercase tracking-wider">
                  Course Name
                </th>
                <th className="px-4 py-3 text-center text-xs font-bold text-neutral-700 dark:text-dark-text-primary uppercase tracking-wider">
                  Credits
                </th>
                <th className="px-4 py-3 text-center text-xs font-bold text-neutral-700 dark:text-dark-text-primary uppercase tracking-wider">
                  CIE
                </th>
                <th className="px-4 py-3 text-center text-xs font-bold text-neutral-700 dark:text-dark-text-primary uppercase tracking-wider">
                  SEE
                </th>
                <th className="px-4 py-3 text-center text-xs font-bold text-neutral-700 dark:text-dark-text-primary uppercase tracking-wider">
                  Final
                </th>
                <th className="px-4 py-3 text-center text-xs font-bold text-neutral-700 dark:text-dark-text-primary uppercase tracking-wider">
                  %
                </th>
                <th className="px-4 py-3 text-center text-xs font-bold text-neutral-700 dark:text-dark-text-primary uppercase tracking-wider">
                  Grade
                </th>
                <th className="px-4 py-3 text-center text-xs font-bold text-neutral-700 dark:text-dark-text-primary uppercase tracking-wider">
                  GP
                </th>
                <th className="px-4 py-3 text-center text-xs font-bold text-neutral-700 dark:text-dark-text-primary uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-dark-border">
              {courses.map((course, index) => (
                <tr
                  key={index}
                  className={`
                    hover:bg-neutral-50 dark:hover:bg-dark-bg-secondary transition-colors
                    ${!course.passed ? 'bg-error-50 dark:bg-error-900/10' : 'bg-white dark:bg-dark-bg-primary'}
                  `}
                >
                  <td className="px-4 py-3">
                    <span className="text-sm font-semibold text-neutral-800 dark:text-dark-text-primary">
                      {course.code || 'N/A'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-neutral-700 dark:text-dark-text-secondary">
                      {course.name || 'Unnamed Course'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge className="bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-dark-green-500 font-bold">
                      {course.credits || 3}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm text-neutral-700 dark:text-dark-text-secondary">
                      {course.cieMarks !== null && course.cieMarks !== undefined ? course.cieMarks.toFixed(1) : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm text-neutral-700 dark:text-dark-text-secondary">
                      {course.seeMarks !== null && course.seeMarks !== undefined ? course.seeMarks.toFixed(1) : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-semibold text-neutral-800 dark:text-dark-text-primary">
                      {course.finalMarks !== null && course.finalMarks !== undefined ? course.finalMarks.toFixed(1) : '--'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm text-neutral-700 dark:text-dark-text-secondary">
                      {course.percentage !== null && course.percentage !== undefined ? `${course.percentage.toFixed(1)}%` : '--'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <GradeBadge grade={course.grade} size="small" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-bold text-neutral-800 dark:text-dark-text-primary">
                      {course.gradePoints !== null && course.gradePoints !== undefined ? course.gradePoints.toFixed(1) : '--'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {course.passed ? (
                      <CheckCircle className="w-5 h-5 text-success-600 dark:text-success-500 inline-block" />
                    ) : (
                      <XCircle className="w-5 h-5 text-error-600 dark:text-error-500 inline-block" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      {showSummary && (
        <Card className="bg-neutral-50 dark:bg-dark-bg-secondary">
          <CardContent className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <p className="text-xs text-neutral-600 dark:text-dark-text-secondary mb-1">
                  Total Courses
                </p>
                <p className="text-2xl font-bold text-neutral-800 dark:text-dark-text-primary">
                  {courses.length}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-neutral-600 dark:text-dark-text-secondary mb-1">
                  Credits
                </p>
                <p className="text-2xl font-bold text-primary-600 dark:text-dark-green-500">
                  {earnedCredits}/{totalCredits}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-neutral-600 dark:text-dark-text-secondary mb-1">
                  Passed
                </p>
                <p className="text-2xl font-bold text-success-600 dark:text-success-500">
                  {passedCount}
                </p>
              </div>
              {failedCount > 0 && (
                <div className="text-center">
                  <p className="text-xs text-neutral-600 dark:text-dark-text-secondary mb-1">
                    Failed
                  </p>
                  <p className="text-2xl font-bold text-error-600 dark:text-error-500">
                    {failedCount}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CourseGradeTable;
