import type { QuizQuestion } from './types';

interface Props {
  question: QuizQuestion;
  index: number;
  selected?: number;
  disabled?: boolean;
  onChange: (index: number) => void;
}

export default function QuizQuestionCard({ question, index, selected, disabled, onChange }: Props) {
  return <fieldset className="quiz-question">
    <legend><span className="quiz-question-index">{index + 1}</span>{question.question}</legend>
    <div className="quiz-options">
      {question.options.map((option, optionIndex) => <label key={optionIndex}
        className={`quiz-option ${selected === optionIndex ? 'selected' : ''}`}>
        <input type="radio" name={`quiz-${index}`} value={optionIndex}
          checked={selected === optionIndex} disabled={disabled}
          onChange={() => onChange(optionIndex)} />
        <span>{option}</span>
      </label>)}
    </div>
  </fieldset>;
}
