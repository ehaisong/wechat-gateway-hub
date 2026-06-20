// /admin/domains — 分享域名池管理
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Star, Globe, Save } from "lucide-react";

export const Route = createFileRoute("/admin/domains")({
  head: () => ({
    meta: [
      { title: "域名池 · 管理中心" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DomainsPage,
});

interface DomainItem {
  domain: string;
  enabled: boolean;
  isPrimary: boolean;
}

interface DomainsData {
  domains: DomainItem[];
  active: string | null;
  count: number;
}

function DomainsPage() {
  const [data, setData] = useState<DomainsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // 编辑中的域名列表（本地状态）
  const [editDomains, setEditDomains] = useState<DomainItem[]>([]);

  // 新增域名弹窗
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/domains");
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const json = await res.json();
      if (json.ok !== false) {
        setData(json);
        setEditDomains(json.domains || []);
      } else {
        setError(json.message || "加载失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function toggleEnabled(index: number) {
    const updated = [...editDomains];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    setEditDomains(updated);
  }

  function togglePrimary(index: number) {
    const updated = editDomains.map((d, i) => ({
      ...d,
      isPrimary: i === index,
    }));
    setEditDomains(updated);
  }

  function removeDomain(index: number) {
    setEditDomains(editDomains.filter((_, i) => i !== index));
  }

  function addDomain() {
    const domain = newDomain.trim().toLowerCase();
    if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return;

    // 检查重复
    if (editDomains.some((d) => d.domain === domain)) return;

    const isFirst = editDomains.length === 0;
    setEditDomains([...editDomains, { domain, enabled: true, isPrimary: isFirst }]);
    setNewDomain("");
    setAddDialogOpen(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains: editDomains }),
      });
      const json = await res.json();
      if (json.ok) {
        loadData();
      }
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  }

  const hasChanges = JSON.stringify(editDomains) !== JSON.stringify(data?.domains || []);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">域名池管理</h1>
            <p className="text-sm text-muted-foreground mt-1">
              管理分享链接跳转的域名池。主域名优先使用，可随时切换。
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(true)}>
              <Plus className="size-4 mr-1.5" />
              添加域名
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !hasChanges}>
              <Save className="size-4 mr-1.5" />
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </div>

        {/* 当前活跃域名 */}
        {data?.active && (
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="flex items-center gap-3 py-4">
              <Globe className="size-4 text-emerald-500" />
              <span className="text-sm text-muted-foreground">当前活跃域名:</span>
              <code className="text-sm font-bold text-emerald-600">{data.active}</code>
              <Badge variant="outline" className="ml-auto border-emerald-500/30 text-emerald-600 text-xs">
                生效中
              </Badge>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <p className="text-muted-foreground text-center py-12">加载中...</p>
        ) : error ? (
          <p className="text-destructive text-center py-12">{error}</p>
        ) : editDomains.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Globe className="size-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">暂无域名</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setAddDialogOpen(true)}>
                添加域名
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">域名列表</CardTitle>
              <CardDescription>
                选择主域名作为默认跳转目标，未启用的域名不会被使用。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {editDomains.map((domain, index) => (
                <div
                  key={domain.domain}
                  className="flex items-center gap-4 rounded-lg border border-border p-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono font-medium truncate">
                        {domain.domain}
                      </code>
                      {domain.isPrimary && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          <Star className="size-2.5 mr-1 fill-current" />
                          主域名
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={domain.enabled}
                        onCheckedChange={() => toggleEnabled(index)}
                      />
                      <span className="text-xs text-muted-foreground w-8">
                        {domain.enabled ? "启用" : "禁用"}
                      </span>
                    </div>
                    <Button
                      variant={domain.isPrimary ? "default" : "outline"}
                      size="sm"
                      className="text-xs h-8"
                      disabled={domain.isPrimary || !domain.enabled}
                      onClick={() => togglePrimary(index)}
                    >
                      设为主域
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      onClick={() => removeDomain(index)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* 添加域名弹窗 */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加域名</DialogTitle>
            <DialogDescription>
              输入要添加到域名池的域名（不含协议和路径）
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">域名</label>
            <Input
              placeholder="example.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addDomain()}
            />
            <p className="text-xs text-muted-foreground">例如: wordpro.cn</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={addDomain}>添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
