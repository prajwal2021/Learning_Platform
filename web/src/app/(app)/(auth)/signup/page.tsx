import type { Metadata } from "next";
import AuthScreen from "@/components/auth/AuthScreen";

export const metadata: Metadata = { title: "Create your account" };
export default function Page() {
  return <AuthScreen initial="signup" />;
}
