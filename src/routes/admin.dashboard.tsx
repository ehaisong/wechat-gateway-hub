// /admin/dashboard — 管理后台仪表盘
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Activity, Globe, Link2, Server, Clock, Users } from "lucide-react";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({
    meta: [
      { title: "仪表盘 · 管理中心" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DashboardPage,
});

interface StatusData {
  uptime: number;
  memory: { rss: string; heapUsed: string; heapTotal: string };
  nodeVersion: string;
  platform: string;
  pid: number;
  config: {
    clients: number;
    shareDomains: number;
    activeDomain: string | null;
    lastUpdate: string;
  };
  env: {
    wechatAppId: boolean;
    wechatMpAppId: boolean;
    aliyunSms: boolean;
  };
  kv: {
    total: number;
    active: number;
    expired: number;
    recentEntries: { key: string; ttl?: number }[];
  };
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}天`);
  if (h > 0) parts.push(`${h}时`);
  parts.push(`${m}分`);
  return parts.join(" ");
}

function DashboardPage() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/status")
      .then((r) => {
        if (r.status === 401) {
          window.location.href = "/admin/login";
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) setStatus(data);
      })
      .catch(() => setError("加载失败"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </AdminLayout>
    );
  }

  if (error || !status) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-destructive">{error || "加载失败"}</p>
        </div>
      </AdminLayout>
    );
  }

  const statCards = [
    {
      title: "运行时间",
      value: formatUptime(status.uptime),
      icon: Clock,
      desc: `Node ${status.nodeVersion} · ${status.platform}`,
    },
    {
      title: "内存使用",
      value: status.memory.heapUsed,
      icon: Server,
      desc: `RSS ${status.memory.rss} · 堆 ${status.memory.heapTotal}`,
    },
    {
      title: "业务站点",
      value: `${status.config.clients} 个`,
      icon: Globe,
      desc: `活跃域名: ${status.config.activeDomain || "无"}`,
    },
    {
      title: "分享域名",
      value: `${status.config.shareDomains} 个`,
      icon: Link2,
      desc: `最近更新: ${new Date(status.config.lastUpdate).toLocaleString("zh-CN")}`,
    },
  ];

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">仪表盘</h1>
          <p className="text-sm text-muted-foreground mt-1">
            系统运行状态总览 · PID: {status.pid}
          </p>
        </div>

        {/* 统计卡片 */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <card.icon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{card.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Separator />

        {/* 环境状态 */}
        <div>
          <h2 className="text-lg font-semibold mb-4">服务状态</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <StatusBadge
              label="微信网站应用"
              ok={status.env.wechatAppId}
              okText="已配置"
              failText="未配置"
            />
            <StatusBadge
              label="微信公众号"
              ok={status.env.wechatMpAppId}
              okText="已配置"
              failText="未配置"
            />
            <StatusBadge
              label="阿里云短信"
              ok={status.env.aliyunSms}
              okText="已配置"
              failText="未配置"
            />
          </div>
        </div>

        <Separator />

        {/* KV 状态 */}
        <div>
          <h2 className="text-lg font-semibold mb-4">
            内存 KV 状态
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              (重启后清空)
            </span>
          </h2>
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-6 mb-4">
                <div>
                  <div className="text-2xl font-bold">{status.kv.total}</div>
                  <div className="text-xs text-muted-foreground">总计</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-emerald-500">{status.kv.active}</div>
                  <div className="text-xs text-muted-foreground">活跃</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-muted-foreground">{status.kv.expired}</div>
                  <div className="text-xs text-muted-foreground">过期</div>
                </div>
              </div>
              {status.kv.recentEntries.length > 0 && (
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-medium mb-2">最近条目:</p>
                  {status.kv.recentEntries.map((entry, i) => (
                    <div key={i} className="font-mono">
                      {entry.key} · TTL {entry.ttl}s
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}

function StatusBadge({
  label,
  ok,
  okText,
  failText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  failText: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <span className="text-sm font-medium">{label}</span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            ok
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${
              ok ? "bg-emerald-500" : "bg-destructive"
            }`}
          />
          {ok ? okText : failText}
        </span>
      </CardContent>
    </Card>
  );
}
