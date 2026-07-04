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
    <button disabled={pending} className={className}>
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