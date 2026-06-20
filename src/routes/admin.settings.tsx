// /admin/settings — 系统设置页面
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Settings,
  Key,
  MessageSquare,
  Globe,
  Shield,
  History,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  LogIn,
  Activity,
  AlertCircle,
} from "lucide-react";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [
      { title: "系统设置 · 管理中心" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SettingsPage,
});

interface MaskedSettings {
  wechatAppId: string;
  wechatAppSecret: string;
  wechatMpAppId: string;
  wechatMpAppSecret: string;
  aliyunSmsAccessKeyId: string;
  aliyunSmsAccessKeySecret: string;
  aliyunSmsSignName: string;
  aliyunSmsTemplateCode: string;
  relayBaseUrl: string;
  passwordSet: boolean;
  updatedAt: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  type: string;
  ip: string;
  action: string;
  detail?: string;
  success: boolean;
}

interface LogStats {
  total: number;
  byType: Record<string, number>;
  todayLogins: number;
  todayCalls: number;
  lastActivity: string | null;
}

function SettingsPage() {
  // 设置
  const [settings, setSettings] = useState<MaskedSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // 编辑状态
  const [form, setForm] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // 日志
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logType, setLogType] = useState<string>("");
  const [logSearch, setLogSearch] = useState("");
  const [logPage, setLogPage] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logStats, setLogStats] = useState<LogStats | null>(null);
  const [recentCalls, setRecentCalls] = useState<LogEntry[]>([]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings");
      if (res.status === 401) { window.location.href = "/admin/login"; return; }
      const json = await res.json();
      if (json.ok) {
        setSettings(json.settings);
        // 初始化表单
        const f: Record<string, string> = {};
        for (const [k, v] of Object.entries(json.settings)) {
          if (k !== "password" && k !== "passwordSet" && k !== "updatedAt") {
            f[k] = (v as string) || "";
          }
        }
        f.password = "";
        setForm(f);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  const loadLogs = useCallback(async (type: string, search: string, page: number) => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("action", "logs");
      params.set("limit", "50");
      params.set("offset", String(page * 50));
      if (type) params.set("type", type);
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/settings?${params.toString()}`);
      if (res.status === 401) { window.location.href = "/admin/login"; return; }
      const json = await res.json();
      if (json.ok) {
        setLogs(json.entries || []);
        setLogTotal(json.total || 0);
      }
    } catch { /* ignore */ }
    finally { setLogsLoading(false); }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings?action=stats");
      const json = await res.json();
      if (json.ok) {
        setLogStats(json.stats);
        setRecentCalls(json.recentCalls || []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadSettings();
    loadLogs("", "", 0);
    loadStats();
  }, [loadSettings, loadLogs, loadStats]);

  // 保存设置
  async function handleSave() {
    setSaving(true);
    setSaveMsg("");
    try {
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(form)) {
        if (v !== undefined) payload[k] = v;
      }
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.ok) {
        setSaveMsg("✅ 设置已保存，已立即生效");
        loadSettings();
      } else {
        setSaveMsg(`❌ ${json.message || "保存失败"}`);
      }
    } catch {
      setSaveMsg("❌ 网络错误");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 4000);
    }
  }

  function toggleShow(key: string) {
    setShowSecrets((p) => ({ ...p, [key]: !p[key] }));
  }

  const secretFields = ["wechatAppSecret", "wechatMpAppSecret", "aliyunSmsAccessKeySecret"];

  // 日志类型标签
  const typeLabels: Record<string, string> = {
    admin_login: "登录",
    admin_logout: "登出",
    admin_action: "操作",
    client_call: "业务调用",
  };
  const typeColors: Record<string, string> = {
    admin_login: "bg-blue-500/10 text-blue-600",
    admin_logout: "bg-slate-500/10 text-slate-600",
    admin_action: "bg-emerald-500/10 text-emerald-600",
    client_call: "bg-purple-500/10 text-purple-600",
  };

  const totalPages = Math.ceil(logTotal / 50);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">系统设置</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理微信登录参数、短信配置、密码和查看日志
          </p>
        </div>

        <Tabs defaultValue="params">
          <TabsList>
            <TabsTrigger value="params" className="gap-1.5">
              <Settings className="size-3.5" />
              参数配置
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-1.5">
              <History className="size-3.5" />
              活动日志
            </TabsTrigger>
          </TabsList>

          {/* 参数配置 */}
          <TabsContent value="params" className="space-y-6 mt-4">
            {/* 微信网站应用 */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Globe className="size-4 text-blue-500" />
                  <CardTitle className="text-base">微信网站应用（PC扫码登录）</CardTitle>
                </div>
                <CardDescription>open.weixin.qq.com 创建的网站应用凭据</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <FieldRow label="AppID" value={form.wechatAppId} onChange={(v) => setForm((p) => ({ ...p, wechatAppId: v }))} placeholder="wx..." />
                <SecretFieldRow
                  label="AppSecret"
                  value={form.wechatAppSecret}
                  onChange={(v) => setForm((p) => ({ ...p, wechatAppSecret: v }))}
                  show={showSecrets.wechatAppSecret}
                  onToggle={() => toggleShow("wechatAppSecret")}
                  placeholder="32位密钥"
                />
              </CardContent>
            </Card>

            {/* 微信公众号 */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <MessageSquare className="size-4 text-green-500" />
                  <CardTitle className="text-base">微信公众号（微信内网页授权）</CardTitle>
                </div>
                <CardDescription>认证服务号的 AppID 和 AppSecret</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <FieldRow label="AppID" value={form.wechatMpAppId} onChange={(v) => setForm((p) => ({ ...p, wechatMpAppId: v }))} placeholder="wx..." />
                <SecretFieldRow
                  label="AppSecret"
                  value={form.wechatMpAppSecret}
                  onChange={(v) => setForm((p) => ({ ...p, wechatMpAppSecret: v }))}
                  show={showSecrets.wechatMpAppSecret}
                  onToggle={() => toggleShow("wechatMpAppSecret")}
                  placeholder="32位密钥"
                />
              </CardContent>
            </Card>

            {/* 阿里云短信 */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Key className="size-4 text-orange-500" />
                  <CardTitle className="text-base">阿里云短信服务</CardTitle>
                </div>
                <CardDescription>RAM 子账号 AccessKey + 短信签名/模板</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <FieldRow label="AccessKey ID" value={form.aliyunSmsAccessKeyId} onChange={(v) => setForm((p) => ({ ...p, aliyunSmsAccessKeyId: v }))} placeholder="LTAI..." />
                <SecretFieldRow
                  label="AccessKey Secret"
                  value={form.aliyunSmsAccessKeySecret}
                  onChange={(v) => setForm((p) => ({ ...p, aliyunSmsAccessKeySecret: v }))}
                  show={showSecrets.aliyunSmsAccessKeySecret}
                  onToggle={() => toggleShow("aliyunSmsAccessKeySecret")}
                  placeholder="AccessKey Secret"
                />
                <FieldRow label="短信签名" value={form.aliyunSmsSignName} onChange={(v) => setForm((p) => ({ ...p, aliyunSmsSignName: v }))} placeholder="如：轻爪科技" />
                <FieldRow label="短信模板 Code" value={form.aliyunSmsTemplateCode} onChange={(v) => setForm((p) => ({ ...p, aliyunSmsTemplateCode: v }))} placeholder="SMS_..." />
              </CardContent>
            </Card>

            {/* 基础配置 */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Settings className="size-4 text-slate-500" />
                  <CardTitle className="text-base">基础配置</CardTitle>
                </div>
                <CardDescription>中转站基础URL和管理密码</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <FieldRow label="中转站基础 URL" value={form.relayBaseUrl} onChange={(v) => setForm((p) => ({ ...p, relayBaseUrl: v }))} placeholder="https://wx.example.com" />
                <SecretFieldRow
                  label="管理密码"
                  value={form.password}
                  onChange={(v) => setForm((p) => ({ ...p, password: v }))}
                  show={showSecrets.password}
                  onToggle={() => toggleShow("password")}
                  placeholder={settings?.passwordSet ? "留空则不修改" : "请设置管理密码"}
                />
                <p className="text-xs text-muted-foreground">
                  {settings?.passwordSet ? "密码已设置，留空表示不修改" : "密码未设置，请立即设置"}
                </p>
              </CardContent>
            </Card>

            {/* 保存按钮 */}
            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}
                {saving ? "保存中..." : "保存设置"}
              </Button>
              {saveMsg && (
                <span className={`text-sm ${saveMsg.startsWith("✅") ? "text-emerald-600" : "text-destructive"}`}>
                  {saveMsg}
                </span>
              )}
            </div>
          </TabsContent>

          {/* 活动日志 */}
          <TabsContent value="logs" className="space-y-6 mt-4">
            {/* 统计概览 */}
            {logStats && (
              <div className="grid gap-4 md:grid-cols-4">
                <StatCard icon={Activity} label="总日志" value={logStats.total} />
                <StatCard icon={LogIn} label="今日登录" value={logStats.todayLogins} />
                <StatCard icon={Globe} label="今日业务调用" value={logStats.todayCalls} />
                <StatCard icon={AlertCircle} label="最近活动" value={logStats.lastActivity ? new Date(logStats.lastActivity).toLocaleString("zh-CN") : "无"} />
              </div>
            )}

            {/* 最近业务调用 */}
            {recentCalls.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">最近业务站点调用</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {recentCalls.slice(0, 10).map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between text-xs text-muted-foreground py-1 border-b border-border/50 last:border-0">
                        <span className="font-mono">{entry.action}</span>
                        <span>{new Date(entry.timestamp).toLocaleString("zh-CN")}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 日志筛选 */}
            <div className="flex items-center gap-3 flex-wrap">
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={logType}
                onChange={(e) => { setLogType(e.target.value); setLogPage(0); loadLogs(e.target.value, logSearch, 0); }}
              >
                <option value="">全部类型</option>
                <option value="admin_login">管理员登录</option>
                <option value="admin_logout">管理员登出</option>
                <option value="admin_action">管理员操作</option>
                <option value="client_call">业务站点调用</option>
              </select>
              <Input
                placeholder="搜索..."
                className="max-w-[200px] h-9"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { setLogPage(0); loadLogs(logType, logSearch, 0); } }}
              />
              <Button variant="outline" size="sm" onClick={() => { setLogPage(0); loadLogs(logType, logSearch, 0); }}>
                搜索
              </Button>
            </div>

            {/* 日志表格 */}
            <Card>
              {logsLoading ? (
                <CardContent className="py-12 text-center text-muted-foreground">加载中...</CardContent>
              ) : logs.length === 0 ? (
                <CardContent className="py-12 text-center text-muted-foreground">暂无日志记录</CardContent>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[160px]">时间</TableHead>
                        <TableHead className="w-[80px]">类型</TableHead>
                        <TableHead>操作</TableHead>
                        <TableHead className="w-[120px]">IP</TableHead>
                        <TableHead className="w-[60px]">结果</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {new Date(entry.timestamp).toLocaleString("zh-CN")}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${typeColors[entry.type] || ""}`}>
                              {typeLabels[entry.type] || entry.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            <div>{entry.action}</div>
                            {entry.detail && (
                              <div className="text-xs text-muted-foreground mt-0.5">{entry.detail}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{entry.ip}</TableCell>
                          <TableCell>
                            <span className={`inline-flex size-2 rounded-full ${entry.success ? "bg-emerald-500" : "bg-destructive"}`} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {/* 分页 */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t">
                      <span className="text-xs text-muted-foreground">共 {logTotal} 条</span>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" disabled={logPage === 0} onClick={() => { const p = logPage - 1; setLogPage(p); loadLogs(logType, logSearch, p); }}>
                          上一页
                        </Button>
                        <span className="text-xs px-2">{logPage + 1} / {totalPages}</span>
                        <Button variant="outline" size="sm" disabled={logPage >= totalPages - 1} onClick={() => { const p = logPage + 1; setLogPage(p); loadLogs(logType, logSearch, p); }}>
                          下一页
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

// ─── 表单字段组件 ───

function FieldRow({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9 font-mono text-sm" />
    </div>
  );
}

function SecretFieldRow({ label, value, onChange, show, onToggle, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="h-9 font-mono text-sm pr-10"
          />
        </div>
        <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={onToggle}>
          {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="size-4 text-primary" />
        </div>
        <div>
          <div className="text-lg font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
