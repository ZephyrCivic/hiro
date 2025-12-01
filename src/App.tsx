import { Button } from "./components/ui/button";

function App() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold">
              GTFS可視化・配布時刻表スタジオ（試作）
            </h1>
            <p className="text-xs text-slate-500">
              広電＋他社ダイヤを 1 画面で確認するための PoC UI
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button>配布時刻表プレビュー</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 px-4 py-4 md:flex-row">
        <section className="flex-1 rounded-md border bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold">地図（バス停の全可視化）</h2>
          <p className="text-xs text-slate-500">
            フェーズ1で、ここに GTFS から読み込んだ停留所を地図上に表示します。
          </p>
        </section>
        <section className="flex-1 rounded-md border bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold">
            選択停留所の統合時刻表（広電＋その他）
          </h2>
          <p className="text-xs text-slate-500">
            フェーズ1では、停留所をクリックすると広電とその他事業者の便を時刻順に一覧表示します。
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;

