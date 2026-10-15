import { logger } from '../../utils/logger';
import { TemplateCurriculumGenerator } from './templateGenerator';
import type { ClassBrief, CurriculumGenerator, GeneratedChapter, SubjectRequest, SubjectSuggestion } from './types';

export * from './types';

/**
 * Where curriculum generation comes from.
 *
 *   CurriculumGenerator
 *     ├── TemplateCurriculumGenerator   (default: offline, free, deterministic)
 *     └── OptionalAICurriculumGenerator (only when an AI provider has been registered)
 *
 * No AI provider ships with the app and none is needed: the template generator does the whole job.
 * To add one later, implement AiCurriculumProvider (calling whichever service you choose, with its
 * own configuration) and call registerAiCurriculumProvider() at startup. Anything the provider
 * can't answer — or any error it throws — falls back to the template generator.
 */

export interface AiCurriculumProvider {
  readonly name: string;
  /** Return null to let the template generator answer. */
  suggestSubjects?(brief: ClassBrief): Promise<SubjectSuggestion[] | null>;
  buildChapters?(brief: ClassBrief, subject: SubjectRequest): Promise<GeneratedChapter[] | null>;
}

export class OptionalAICurriculumGenerator implements CurriculumGenerator {
  readonly name: string;
  constructor(
    private readonly provider: AiCurriculumProvider,
    private readonly fallback: CurriculumGenerator = new TemplateCurriculumGenerator(),
  ) {
    this.name = `ai:${provider.name}`;
  }

  private async attempt<T>(what: string, run: (() => Promise<T | null>) | undefined, otherwise: () => Promise<T>): Promise<T> {
    if (run) {
      try {
        const result = await run();
        if (result && (!Array.isArray(result) || result.length)) return result;
      } catch (err) {
        logger.warn(`curriculum: ${this.provider.name} could not ${what}, using the template generator: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return otherwise();
  }

  suggestSubjects(brief: ClassBrief) {
    return this.attempt('suggest subjects', this.provider.suggestSubjects && (() => this.provider.suggestSubjects!(brief)), () => this.fallback.suggestSubjects(brief));
  }

  buildChapters(brief: ClassBrief, subject: SubjectRequest) {
    return this.attempt('build chapters', this.provider.buildChapters && (() => this.provider.buildChapters!(brief, subject)), () => this.fallback.buildChapters(brief, subject));
  }
}

let provider: AiCurriculumProvider | null = null;
let cached: CurriculumGenerator | null = null;

/** Plugs in an AI provider (none by default). */
export function registerAiCurriculumProvider(next: AiCurriculumProvider | null): void {
  provider = next;
  cached = null;
}

/** The generator in use: the template generator unless an AI provider was registered. */
export function getCurriculumGenerator(): CurriculumGenerator {
  if (!cached) cached = provider ? new OptionalAICurriculumGenerator(provider) : new TemplateCurriculumGenerator();
  return cached;
}
