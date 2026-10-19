import { redirect } from "next/navigation";

/** The old access-code gate. Codes still work, on the sign-in page's Invite code tab. */
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  redirect(`/login?mode=code${next ? `&next=${encodeURIComponent(next)}` : ""}`);
}
