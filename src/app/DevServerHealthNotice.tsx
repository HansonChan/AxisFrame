import { useEffect, useState } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

type Health = "checking" | "online" | "offline";

export function DevServerHealthNotice({ lang }: { lang: "zh" | "en" }) {
  const [health, setHealth] = useState<Health>("checking");

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let failures = 0;
    let cancelled = false;
    const check = async () => {
      try {
        const response = await fetch(`/@vite/client?health=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        failures = 0;
        if (!cancelled) setHealth("online");
      } catch {
        failures += 1;
        if (!cancelled && failures >= 2) setHealth("offline");
      }
    };
    void check();
    const interval = window.setInterval(check, 6_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (!import.meta.env.DEV || health !== "offline") return null;
  return (
    <aside className="dev-health-notice" role="alert">
      <TriangleAlert size={18} />
      <div>
        <strong>{lang === "zh" ? "本地服务连接已中断" : "LOCAL SERVER DISCONNECTED"}</strong>
        <span>{lang === "zh" ? "页面可能来自缓存。请运行 npm run dev，然后重新连接。" : "THIS PAGE MAY BE CACHED. RUN NPM RUN DEV, THEN RECONNECT."}</span>
      </div>
      <button type="button" onClick={() => window.location.reload()}><RefreshCw size={14} />{lang === "zh" ? "重试" : "RETRY"}</button>
    </aside>
  );
}
