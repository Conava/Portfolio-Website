"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

export default function Template({ children }: { children: React.ReactNode }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    function handleLocaleExit() {
      setExiting(true);
    }
    window.addEventListener("locale-exit", handleLocaleExit);
    return () => window.removeEventListener("locale-exit", handleLocaleExit);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={exiting ? { opacity: 0, y: -24 } : { opacity: 1, y: 0 }}
      transition={{ duration: exiting ? 0.26 : 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
