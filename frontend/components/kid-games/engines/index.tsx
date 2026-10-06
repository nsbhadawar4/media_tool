'use client';

import type { ComponentType } from 'react';
import type { BuildQuestion, ChoiceQuestion, EngineType, NumberQuestion, OrderQuestion, Question } from '@/lib/kid-games/types';
import { ChoiceBoard } from './ChoiceBoard';
import { DragDropEngine } from './DragDropEngine';
import { MatchingEngine } from './MatchingEngine';
import { MemoryEngine } from './MemoryEngine';
import { NumberPadEngine } from './NumberPadEngine';
import { SequenceBoard } from './SequenceBoard';
import type { EngineProps } from './engineTypes';

/*
 * The ten game mechanics. Every one of the 150 games is played by one of these; which one is
 * decided by the catalogue (lib/kid-games/catalog.ts), and what it plays comes from the content
 * files. Adding a class or a game never means adding a component.
 */

const lang = (props: EngineProps) => (props.subject === 'hindi' ? 'hi' : 'en');

export function MultipleChoiceEngine(props: EngineProps<ChoiceQuestion>) {
  return <ChoiceBoard {...props} />;
}

export function ImageChoiceEngine(props: EngineProps<ChoiceQuestion>) {
  return <ChoiceBoard {...props} layout="picture" />;
}

export function FillBlankEngine(props: EngineProps<ChoiceQuestion>) {
  return <ChoiceBoard {...props} layout="blank" />;
}

/** The quiz mixes picked and typed answers; its clock lives in the game header and never runs out. */
export function TimedQuizEngine(props: EngineProps) {
  const { question } = props;
  if (question.kind === 'number') return <NumberPadEngine {...(props as EngineProps<NumberQuestion>)} />;
  return <ChoiceBoard {...(props as EngineProps<ChoiceQuestion>)} />;
}

export function OrderingEngine(props: EngineProps<OrderQuestion>) {
  const { question } = props;
  // Long items (sentences, story steps) read best as a numbered list; short ones as tiles.
  const asList = question.items.some((item) => item.length > 12);
  return (
    <SequenceBoard
      prompt={question.prompt}
      visual={question.visual}
      tiles={question.items}
      joiner={asList ? null : ' '}
      lang={lang(props)}
      done={props.done}
      onResult={props.onResult}
      onRetry={props.onRetry}
      onStep={props.onStep}
    />
  );
}

export function WordBuilderEngine(props: EngineProps<BuildQuestion>) {
  const { question } = props;
  return (
    <SequenceBoard
      prompt={question.prompt}
      visual={question.visual}
      tiles={question.tiles}
      extra={question.extra}
      joiner={question.joiner ?? ''}
      lang={lang(props)}
      done={props.done}
      onResult={props.onResult}
      onRetry={props.onRetry}
      onStep={props.onStep}
    />
  );
}

export { DragDropEngine, MatchingEngine, MemoryEngine, NumberPadEngine };

export const ENGINES: Record<EngineType, ComponentType<EngineProps<never>>> = {
  'multiple-choice': MultipleChoiceEngine,
  'image-choice': ImageChoiceEngine,
  'fill-blank': FillBlankEngine,
  'timed-quiz': TimedQuizEngine,
  matching: MatchingEngine,
  memory: MemoryEngine,
  ordering: OrderingEngine,
  'word-builder': WordBuilderEngine,
  'drag-drop': DragDropEngine,
  'number-pad': NumberPadEngine,
};

/** Renders the engine for a game type with a question it can play (the content tests guarantee the pairing). */
export function EngineView({ engine, ...props }: EngineProps<Question> & { engine: EngineType }) {
  const Engine = ENGINES[engine] as ComponentType<EngineProps<Question>>;
  return <Engine {...props} />;
}
