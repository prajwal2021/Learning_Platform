"use client";
import { motion } from "motion/react";

/** Each page enters with a short rise and fade. (No filter: it would trap position:fixed children, such as full screen.) */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}
