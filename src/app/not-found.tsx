import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="empty">
      <span className="eyebrow">NOT FOUND</span>
      <h1>This page is no longer here.</h1>
      <p>The audit may have been deleted, or the link is incorrect.</p>
      <Link className="button primary" href="/history">
        Back to audit library
      </Link>
    </main>
  );
}
