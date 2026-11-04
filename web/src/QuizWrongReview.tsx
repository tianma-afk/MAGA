import { BookOpen } from 'lucide-react';
import { chapterWrongAnswers } from './quiz';
import type { QuizStore } from './types';

export default function QuizWrongReview({ store, onPage }: {
  store: QuizStore;
  onPage: (page: number) => void;
}) {
  const wrong = chapterWrongAnswers(store);
  return <section className="quiz-wrong" aria-label="本章错题回顾">
    <h3>本章错题回顾</h3>
    {wrong.length === 0 ? <p className="quiz-empty-text">暂无错题。</p> : <ul>
      {wrong.map(item => <li key={`${item.recordId}-${item.index}`}>
        <p className="quiz-wrong-meta">第 {item.slide} 页</p>
        <strong>{item.question.question}</strong>
        <p>你选：{item.question.options[item.answer] ?? '未作答'}；正确：{item.question.options[item.question.correctIndex]}</p>
        <p>{item.question.explanation}</p>
        <div className="quiz-citations">
          {item.question.citations.map((citation, citationIndex) => <button
            key={`${citation.slide}-${citationIndex}`} onClick={() => onPage(citation.slide)}>
            <BookOpen size={12} />第 {citation.slide} 页 · {citation.title}
          </button>)}
        </div>
      </li>)}
    </ul>}
  </section>;
}
