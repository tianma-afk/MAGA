import { BookOpen, Check, X } from 'lucide-react';
import { scoreRecord } from './quiz';
import type { QuizRecord } from './types';

export default function QuizReview({ record, onPage }: {
  record: QuizRecord;
  onPage: (page: number) => void;
}) {
  const score = scoreRecord(record);
  return <section className="quiz-review" aria-label={`第 ${record.slide} 页自测结果`}>
    <div className="quiz-score" aria-live="polite">
      <strong>{score} / {record.questions.length}</strong>
      <span>{score === record.questions.length ? '全部正确' : '回顾错题，再试一次'}</span>
    </div>
    <ol className="quiz-review-list">
      {record.questions.map((question, index) => {
        const answer = record.answers[index];
        const correct = answer === question.correctIndex;
        return <li key={index} className={correct ? 'correct' : 'wrong'}>
          <div className="quiz-review-head">
            {correct ? <Check size={15} /> : <X size={15} />}
            <strong>{question.question}</strong>
          </div>
          {!correct && <p className="quiz-your-answer">你的答案：{question.options[answer] ?? '未作答'}</p>}
          <p className="quiz-correct-answer">正确答案：{question.options[question.correctIndex]}</p>
          <p>{question.explanation}</p>
          <div className="quiz-citations">
            {question.citations.map((citation, citationIndex) => <button
              key={`${citation.slide}-${citationIndex}`} onClick={() => onPage(citation.slide)}>
              <BookOpen size={12} />第 {citation.slide} 页 · {citation.title}
            </button>)}
          </div>
        </li>;
      })}
    </ol>
  </section>;
}
