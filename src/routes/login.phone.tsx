// 中转站托管的手机号登录页 /login/phone?sid=...
// 全部走 /api/sms/send 与 /api/sms/verify (同源)。

import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";


export const Route = createFileRoute("/login/phone")({
  head: () => ({
    meta: [
      { title: "手机号登录" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    sid: typeof s.sid === "string" ? s.sid : "",
  }),
  component: PhoneLoginPage,
});

function PhoneLoginPage() {
  const { sid } = useSearch({ from: "/login/phone" });
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    timerRef.current = window.setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [cooldown]);

  if (!sid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold">登录会话无效</h1>
          <p className="mt-2 text-sm text-muted-foreground">请回到原站点重新点击「手机号登录」。</p>
        </div>
      </div>
    );
  }

  async function send() {
    setErr(null);
    if (!/^1[3-9]\d{9}$/.test(phone.replace(/^(\+86|0086)/, ""))) {
      setErr("请输入正确的手机号");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sid, phone }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (data.error === "rate_limited") {
          setCooldown(data.retry_after ?? 60);
          setErr(`请 ${data.retry_after ?? 60}s 后重试`);
        } else if (data.error === "invalid_phone") {
          setErr("请输入正确的手机号");
        } else if (data.error === "session_expired") {
          setErr("登录会话已过期，请回到原站点重新发起登录");
        } else {
          setErr(data.message || "发送失败，请稍后重试");
        }
        return;
      }
      setCooldown(data.cooldown ?? 60);
      setStep("code");
    } catch (e) {
      setErr("网络错误，请重试");
    } finally {
      setBusy(false);
    }
  }

  async function verify(finalCode: string) {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/sms/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sid, phone, code: finalCode }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (data.error === "bad_code") setErr("验证码错误");
        else if (data.error === "expired") setErr("验证码已过期，请重新获取");
        else if (data.error === "too_many_attempts") setErr("尝试次数过多，请重新获取验证码");
        else setErr("校验失败");
        setCode("");
        return;
      }
      window.location.replace(data.redirect);
    } catch {
      setErr("网络错误，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
      <div className="w-full max-w-md space-y-3">
        <Input
          inputMode="tel"
          autoComplete="tel"
          placeholder="请输入账号/手机号"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={busy}
          className="h-12"
        />
        <div className="flex gap-2">
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="请输入验证码"
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(v);
              if (v.length === 6 && !busy) verify(v);
            }}
            disabled={busy}
            className="h-12 flex-1"
          />
          <Button
            onClick={send}
            disabled={busy || cooldown > 0}
            className="h-12 shrink-0"
          >
            {busy && step === "phone"
              ? "发送中…"
              : cooldown > 0
                ? `${cooldown}s`
                : "获取验证码"}
          </Button>
        </div>

        {err && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive text-center">
            {err}
          </div>
        )}
      </div>
    </div>
  );
}
