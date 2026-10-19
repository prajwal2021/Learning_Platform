export const LEVELS = ["basic", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABEL: Record<Level, string> = { basic: "Basic", intermediate: "Intermediate", advanced: "Advanced" };

export type TopicCard = { slug: string; name: string; category: string; counts: Record<Level, number>; known: number };
export type Question = {
  id: string; level: Level; question: string; answer: string; real_world: string; code_lang: string; code: string; follow_up: string;
};
export type Mark = "known" | "review";
export type TopicDetail = { slug: string; name: string; category: string; questions: Question[]; marks: Record<string, Mark> };
