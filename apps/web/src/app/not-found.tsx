import Link from "next/link";
import { Wordmark } from "@/components/shell/Wordmark";

export default function NotFound() {
  return (
    <div className="frame-narrow flex min-h-dvh flex-col justify-center py-20">
      <Wordmark />
      <p className="eyebrow mt-16">404</p>
      <h1 className="display mt-3 text-[clamp(2.25rem,5vw,3.5rem)]">Nothing is recorded here.</h1>
      <p className="mt-4 text-md text-ink-2">The page or record you asked for doesn&rsquo;t exist, or you don&rsquo;t have access to it.</p>
      <p className="mt-8 flex gap-6">
        <Link href="/" className="link text-teal">
          Home
        </Link>
        <Link href="/verify" className="link text-teal">
          Verify a receipt
        </Link>
      </p>
    </div>
  );
}
