import { Suspense } from "react";
import { TalkStudio } from "@/components/console/TalkStudio";

export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">Loading talk…</p>}>
      <TalkStudio />
    </Suspense>
  );
}
