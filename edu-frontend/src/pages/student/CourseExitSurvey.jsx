import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ClipboardList, CheckCircle, Star, ArrowLeft, Send } from 'lucide-react';
import { cesAPI, courseAPI } from '../../services/api';
import PageLayout from '../../components/shared/PageLayout';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';

const RATING_LABELS = {
  5: 'Strongly Agree',
  4: 'Agree',
  3: 'Neutral',
  2: 'Disagree',
  1: 'Strongly Disagree',
};

export default function CourseExitSurvey() {
  const { courseId } = useParams();
  const navigate = useNavigate();

  const [course, setCourse] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [ratings, setRatings] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [courseId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [courseRes, qRes, submittedRes] = await Promise.all([
        courseAPI.getById(courseId),
        cesAPI.getQuestions(courseId),
        cesAPI.checkSubmitted(courseId),
      ]);
      setCourse(courseRes.data.data);
      setQuestions(qRes.data.data || []);
      setSubmitted(submittedRes.data.submitted);
    } catch (err) {
      toast.error('Failed to load survey');
    } finally {
      setLoading(false);
    }
  };

  const handleRate = (coId, rating) => {
    setRatings(prev => ({ ...prev, [coId]: rating }));
  };

  const allAnswered = questions.length > 0 && questions.every(q => ratings[q.co_id]);

  const handleSubmit = async () => {
    if (!allAnswered) {
      toast.error('Please rate all course outcomes before submitting.');
      return;
    }

    try {
      setSubmitting(true);
      const responses = questions.map(q => ({
        co_id: q.co_id,
        co_number: q.co_number,
        rating: ratings[q.co_id],
      }));
      await cesAPI.submitResponses(courseId, responses);
      toast.success('Survey submitted successfully!');
      setSubmitted(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PageLayout title="Course Exit Survey">
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </PageLayout>
    );
  }

  if (submitted) {
    return (
      <PageLayout title="Course Exit Survey" icon={ClipboardList}>
        <div className="max-w-lg mx-auto py-16 text-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          </motion.div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-dark-text-primary mb-2">
            Thank you!
          </h2>
          <p className="text-neutral-500 dark:text-dark-text-secondary mb-6">
            Your feedback has been recorded. Your responses help improve the course for future students.
          </p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Course
          </Button>
        </div>
      </PageLayout>
    );
  }

  if (!questions.length) {
    return (
      <PageLayout title="Course Exit Survey" icon={ClipboardList}>
        <Card className="max-w-lg mx-auto mt-8">
          <CardContent className="py-10 text-center">
            <ClipboardList className="w-10 h-10 text-neutral-400 mx-auto mb-3" />
            <p className="text-neutral-500 dark:text-dark-text-secondary">
              The survey is not active for this course yet.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
              Go Back
            </Button>
          </CardContent>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Course Exit Survey"
      subtitle={course?.name}
      icon={ClipboardList}
      breadcrumbs={[
        { label: 'Courses', href: '/student/courses' },
        { label: course?.name || 'Course', href: `/student/courses/${courseId}` },
        { label: 'Exit Survey' }
      ]}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Instructions */}
        <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-800 dark:text-blue-300">
          Rate each Course Outcome on a scale of 1 to 5 based on how well you feel you have understood and achieved it.
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(RATING_LABELS).reverse().map(([k, v]) => (
              <span key={k} className="bg-blue-100 dark:bg-blue-800/40 px-2 py-0.5 rounded text-xs">
                <strong>{k}</strong> — {v}
              </span>
            ))}
          </div>
        </div>

        {/* Questions */}
        {questions.map((q, i) => (
          <motion.div
            key={q.co_id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <Card className={ratings[q.co_id] ? 'border-primary-300 dark:border-primary-700' : ''}>
              <CardContent className="pt-5">
                <div className="flex items-start gap-3 mb-4">
                  <span className="mt-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs font-bold px-2 py-1 rounded shrink-0">
                    CO{q.co_number}
                  </span>
                  <p className="text-neutral-800 dark:text-dark-text-primary leading-relaxed">
                    {q.question_text}
                  </p>
                </div>

                {/* Rating stars */}
                <div className="flex items-center gap-2 flex-wrap">
                  {[1, 2, 3, 4, 5].map(r => (
                    <button
                      key={r}
                      onClick={() => handleRate(q.co_id, r)}
                      className={`group flex flex-col items-center gap-1 px-3 py-2 rounded-lg border transition-all ${
                        ratings[q.co_id] === r
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                          : 'border-neutral-200 dark:border-dark-border hover:border-primary-300 dark:hover:border-primary-700'
                      }`}
                    >
                      <Star
                        className={`w-5 h-5 transition-colors ${
                          ratings[q.co_id] >= r
                            ? 'text-yellow-400 fill-yellow-400'
                            : 'text-neutral-300 dark:text-neutral-600'
                        }`}
                      />
                      <span className="text-xs text-neutral-500 dark:text-dark-text-secondary">{r}</span>
                    </button>
                  ))}
                  {ratings[q.co_id] && (
                    <span className="ml-2 text-sm text-neutral-600 dark:text-dark-text-secondary italic">
                      {RATING_LABELS[ratings[q.co_id]]}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}

        {/* Progress */}
        <div className="text-sm text-neutral-500 dark:text-dark-text-secondary">
          {Object.keys(ratings).length} of {questions.length} answered
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!allAnswered || submitting}
          className="w-full"
        >
          <Send className="w-4 h-4 mr-2" />
          {submitting ? 'Submitting…' : 'Submit Survey'}
        </Button>
      </div>
    </PageLayout>
  );
}
