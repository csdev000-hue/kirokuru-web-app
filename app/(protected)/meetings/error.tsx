"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main><h1>表示できませんでした</h1><p role="alert">時間をおいて再試行してください。</p><button onClick={reset}>再試行</button></main>; }
