import React, { useState } from 'react';
import { CURRICULUM_LEVELS } from '../../data/lessonsData';
import { Lesson, CurriculumLevel } from '../../types/curriculum';
import { AppSettings } from '../../types/chess';
import { LessonPlayer } from './LessonPlayer';
import { QuizModal } from './QuizModal';
import {
  GraduationCap,
  CheckCircle2,
  Lock,
  ChevronRight,
  Award,
  Sparkles,
} from 'lucide-react';

interface LearnViewProps {
  settings: AppSettings;
  completedLessonIds: string[];
  passedQuizLevelIds: number[];
  onCompleteLesson: (lessonId: string) => void;
  onPassQuiz: (levelId: number) => void;
}

export const LearnView: React.FC<LearnViewProps> = ({
  settings,
  completedLessonIds,
  passedQuizLevelIds,
  onCompleteLesson,
  onPassQuiz,
}) => {
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [activeQuizLevel, setActiveQuizLevel] = useState<CurriculumLevel | null>(null);

  if (selectedLesson) {
    return (
      <LessonPlayer
        lesson={selectedLesson}
        settings={settings}
        onBack={() => setSelectedLesson(null)}
        onComplete={(id) => {
          onCompleteLesson(id);
          setSelectedLesson(null);
        }}
      />
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto px-3 py-3 space-y-5">
      {/* Overview Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400 flex items-center justify-center">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100">Curriculum & Academy</h1>
            <p className="text-xs text-slate-400">
              From piece movements to grandmaster strategy. All levels are completely free.
            </p>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <span>{completedLessonIds.length} lessons mastered</span>
          <span className="font-medium text-amber-400">{passedQuizLevelIds.length} quizes passed</span>
        </div>
      </div>

      {/* Levels Accordion / List */}
      <div className="space-y-4">
        {CURRICULUM_LEVELS.map((lvl) => {
          const isPassed = passedQuizLevelIds.includes(lvl.id);
          const completedInLevel = lvl.lessons.filter((l) => completedLessonIds.includes(l.id)).length;
          const isFinishedAll = lvl.lessons.length > 0 && completedInLevel === lvl.lessons.length;

          return (
            <div
              key={lvl.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md space-y-3"
            >
              {/* Level Header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                      {lvl.badge}
                    </span>
                    {isPassed && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                        <Award className="w-3.5 h-3.5" />
                        <span>Mastered</span>
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-slate-100 mt-1">{lvl.title}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{lvl.subtitle}</p>
                </div>

                {lvl.lessons.length > 0 && (
                  <span className="text-xs font-mono text-slate-400 shrink-0">
                    {completedInLevel}/{lvl.lessons.length}
                  </span>
                )}
              </div>

              {/* Lesson Items */}
              {lvl.lessons.length > 0 ? (
                <div className="space-y-1.5 pt-1">
                  {lvl.lessons.map((lesson, idx) => {
                    const isCompleted = completedLessonIds.includes(lesson.id);

                    return (
                      <button
                        key={lesson.id}
                        onClick={() => setSelectedLesson(lesson)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                          isCompleted
                            ? 'bg-slate-950/30 border-slate-800/80 text-slate-300 hover:border-slate-700'
                            : 'bg-slate-950/60 border-slate-800 text-slate-200 hover:border-amber-500/50 hover:bg-slate-950'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate pr-2">
                          {isCompleted ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <span className="w-4 h-4 rounded-full border border-slate-700 text-[10px] font-mono text-slate-500 flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                          )}
                          <div className="truncate">
                            <span className="font-semibold block truncate">{lesson.title}</span>
                            <span className="text-[11px] text-slate-500 block truncate">
                              {lesson.subtitle}
                            </span>
                          </div>
                        </div>

                        <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                      </button>
                    );
                  })}

                  {/* Level Quiz Button */}
                  {lvl.quiz.length > 0 && (
                    <div className="pt-2">
                      <button
                        onClick={() => setActiveQuizLevel(lvl)}
                        className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border ${
                          isPassed
                            ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                            : 'bg-amber-500/15 border-amber-500 text-amber-300 hover:bg-amber-500/25'
                        }`}
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>{isPassed ? 'Retake Level Quiz' : 'Take Level Mastery Quiz'}</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-3 px-3 bg-slate-950/40 rounded-xl border border-slate-800 text-xs text-slate-500 flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Curriculum syllabus active. Advanced interactive drills expand in subsequent modules.</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quiz Modal */}
      {activeQuizLevel && (
        <QuizModal
          levelTitle={activeQuizLevel.title}
          levelId={activeQuizLevel.id}
          questions={activeQuizLevel.quiz}
          isOpen={true}
          onClose={() => setActiveQuizLevel(null)}
          onPass={(id) => onPassQuiz(id)}
        />
      )}
    </div>
  );
};
