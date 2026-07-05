"use client";

import { useFormStatus } from "react-dom";
import Spinner from "@/components/spinner";

export default function FormSubmitButton({
  children,
  pendingText = "処理中...",
  className,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      disabled={pending}
      aria-busy={pending}
      className={`${className} inline-flex items-center justify-center transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <span className="flex items-center justify-center gap-2">
        {pending ? (
          <>
            <Spinner />
            {pendingText}
          </>
        ) : (
          children
        )}
      </span>
    </button>
  );
}
