'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="empty"><h1>Something interrupted this view.</h1><p>Your saved audits are still in the workspace. Try loading the page again.</p><button className="button primary" onClick={reset}>Try again</button></main>;}
