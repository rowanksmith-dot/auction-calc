"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.className = next ? "dark" : "";
    localStorage.setItem("auction-calc-theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      className={cn(
        "p-2 rounded-lg transition-colors",
        "hover:bg-secondary text-muted-foreground hover:text-foreground",
      )}
      aria-label="Toggle dark mode"
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
