"use client";

import { motion, useAnimation } from "framer-motion";
import { useEffect } from "react";

export default function Template({ children }: { children: React.ReactNode }) {
  const controls = useAnimation();

  // Entry: animate in when template mounts (i.e. on each navigation)
  useEffect(() => {
    controls.start({
      opacity: 1,
      y: 0,
      transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
    });
  }, [controls]);

  // Exit: listen for locale-exit event dispatched by LocaleToggle
  useEffect(() => {
    function handleLocaleExit() {
      controls.start({
        opacity: 0,
        y: -24,
        transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] },
      });
    }
    window.addEventListener("locale-exit", handleLocaleExit);
    return () => window.removeEventListener("locale-exit", handleLocaleExit);
  }, [controls]);

  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={controls}>
      {children}
    </motion.div>
  );
}
