const steps = ["Meeting", "AI Minutes", "AI Ticket Candidates", "Human Review", "Ticket"];

export default function HomePage() {
  return (
    <main>
      <h1>AIプロジェクトマネージャー</h1>
      <p>会議の内容を整理し、人の確認を経てチケットへつなげます。</p>
      <ol aria-label="会議からチケットまでの流れ">
        {steps.map((step, index) => (
          <li key={step}>
            {index > 0 && <span className="arrow" aria-hidden="true">↓</span>}
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p>現在準備中です。</p>
    </main>
  );
}
