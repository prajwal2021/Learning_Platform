export type Me = {
  id: string; name: string; email: string | null; avatar_url: string | null;
  methods: string[]; joined: string;
};
export type Overview = {
  user: Me;
  path: { done: number; total: number; next: null | { unit: string; unit_name: string; step: string; text: string; kind: string; href: string | null; link: string | null };
    units: { num: string; name: string; status: string; done: number; total: number }[] };
  labs: { done: number; total: number; items: { id: string; kicker: string; name: string; time: string; blurb: string; done: number; total: number }[] };
  challenges: { total: number; completed: number; in_progress: ChallengeLite[]; today: ChallengeLite | null };
  interview: { topics: number; questions: number; known: number; review: number;
    categories: { name: string; topics: number; questions: number; known: number }[];
    recent: { slug: string; name: string; category: string; known: number; review: number; total: number }[] };
  workbooks: { total: number; visited: number; last: WorkbookLite | null; items: WorkbookLite[] };
  lessons: { slug: string; stage: number; title: string; slides: number; at: number; done: boolean }[];
  guides: number;
  activity: { days: Record<string, number>; streak: number; best_streak: number; active_days: number; today: string };
};
export type ChallengeLite = { slug: string; title: string; difficulty: string; est_minutes: number; tags: string[]; scenario: string;
  steps_total: number; steps_done: number; status: "new" | "in_progress" | "completed" };
export type WorkbookLite = { slug: string; stage: number; title: string; companion: boolean; visited: string | null; saved: number };
export type SearchHit = { type: string; title: string; subtitle: string; href: string };
