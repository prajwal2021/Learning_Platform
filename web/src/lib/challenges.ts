export type Concept = { key: string; name: string; summary: string; used_here?: string }; // used_here arrives once the step is solved
export type Option = { id: string; text: string };
export type StepView = {
  index: number; title: string; question: string; concept_keys: string[]; options: Option[]; wrong: string[];
  hints?: Record<string, string>;      // current step: hints for the wrong picks so far
  correct?: string;                    // answered steps only
  explanation?: string;                // answered steps only
  attempts?: number;
};
export type Challenge = {
  slug: string; title: string; difficulty: "easy" | "medium" | "hard"; est_minutes: number; tags: string[]; scenario: string; goal: string;
  concepts: Concept[]; steps_total: number; current: number; steps: StepView[]; takeaway: string | null; completed: boolean;
};
export type ChallengeCard = {
  slug: string; title: string; difficulty: string; est_minutes: number; tags: string[]; scenario: string;
  steps_total: number; steps_done: number; status: "new" | "in_progress" | "completed";
};
export type AnswerResult =
  | { correct: false; hint: string; attempts: number }
  | { correct: true; correct_option: string; explanation: string; attempts: number; finished: boolean; takeaway: string | null };
