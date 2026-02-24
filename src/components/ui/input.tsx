import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-stone-400 dark:placeholder:text-stone-600 selection:bg-primary selection:text-primary-foreground bg-white dark:bg-stone-800 border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 h-9 w-full min-w-0 rounded-lg border px-3 py-1 text-base transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-blue-600 dark:focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-600/10 dark:focus-visible:ring-blue-500/20",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
