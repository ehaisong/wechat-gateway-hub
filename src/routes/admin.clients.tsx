// /admin/clients — 客户端站点管理
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Copy, Check } from "lucide-react";

export const Route = createFileRoute("/admin/clients")({
  head: () => ({
    meta: [
      { title: "站点管理 · 管理中心" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ClientsPage,
});

interface ClientItem {
  origin: string;
  done_path: string;
  client_secret: string;
}

interface ClientsData {
  clients: Record<string, ClientItem>;
  count: number;
  updatedAt: string;
}

function generateSecret(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function ClientsPage() {
  const [data, setData] = useState<ClientsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 编辑弹窗
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editOrigin, setEditOrigin] = useState("");
  const [editDonePath, setEditDonePath] = useState("/login/wechat-done");
  const [editSecret, setEditSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState("");

  // 删除确认
  const [deleteName, setDeleteName] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 复制反馈
  const [copiedName, setCopiedName] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/clients");
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const json = await res.json();
      if (json.ok !== false) setData(json);
      else setError(json.message || "加载失败");
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openAdd() {
    setEditName("");
    setEditOrigin("");
    setEditDonePath("/login/wechat-done");
    setEditSecret(generateSecret());
    setDialogError("");
    setDialogOpen(true);
  }

  function openEdit(name: string, client: ClientItem) {
    setEditName(name);
    setEditOrigin(client.origin);
    setEditDonePath(client.done_path);
    setEditSecret(client.client_secret);
    setDialogError("");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!editName.trim()) {
      setDialogError("请输入客户端名称");
      return;
    }
    if (!editOrigin.trim()) {
      setDialogError("请输入 origin URL");
      return;
    }
    if (!editSecret.trim() || editSecret.length < 16) {
      setDialogError("client_secret 至少 16 个字符");
      return;
    }
    setSaving(true);
    setDialogError("");
    try {
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          origin: editOrigin.trim(),
          done_path: editDonePath.trim() || "/login/wechat-done",
          client_secret: editSecret.trim(),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setDialogOpen(false);
        loadData();
      } else {
        setDialogError(json.message || "保存失败");
      }
    } catch {
      setDialogError("网络错误");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteName) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/clients?name=${encodeURIComponent(deleteName)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.ok) {
        setDeleteName(null);
        loadData();
      }
    } catch {
      /* ignore */
    } finally {
      setDeleting(false);
    }
  }

  function copyToClipboard(text: string, name: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedName(name);
      setTimeout(() => setCopiedName(null), 2000);
    });
  }

  const clients = data?.clients ?? {};

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">站点管理</h1>
            <p className="text-sm text-muted-foreground mt-1">
              管理接入微信中转站的业务站点白名单
            </p>
          </div>
          <Button onClick={openAdd} size="sm">
            <Plus className="size-4 mr-1.5" />
            添加站点
          </Button>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-center py-12">加载中...</p>
        ) : error ? (
          <p className="text-destructive text-center py-12">{error}</p>
        ) : Object.keys(clients).length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <GlobeIcon className="size-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">暂无接入站点</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={openAdd}>
                添加第一个站点
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>客户端名称</TableHead>
                  <TableHead>Origin</TableHead>
                  <TableHead>回调路径</TableHead>
                  <TableHead>Secret</TableHead>
                  <TableHead className="w-[100px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(clients).map(([name, client]) => (
                  <TableRow key={name}>
                    <TableCell className="font-mono font-medium text-sm">
                      {name}
                    </TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground">
                      {client.origin}
                    </TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground">
                      {client.done_path}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <code className="text-xs bg-muted rounded px-1.5 py-0.5 max-w-[120px] truncate">
                          {client.client_secret.substring(0, 8)}...
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => copyToClipboard(client.client_secret, name)}
                        >
                          {copiedName === name ? (
                            <Check className="size-3 text-emerald-500" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => openEdit(name, client)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteName(name)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* 编辑/新增弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editName ? "编辑站点" : "添加站点"}</DialogTitle>
            <DialogDescription>
              配置业务站点的基本信息。client_secret 仅业务后端持有。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">客户端名称</label>
              <Input
                placeholder="如 wordpro"
                value={editName}
                onChange={(e) => setEditName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                disabled={!!editName && data?.clients?.[editName] !== undefined}
              />
              <p className="text-xs text-muted-foreground">小写字母、数字、-、_</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Origin URL</label>
              <Input
                placeholder="https://example.com"
                value={editOrigin}
                onChange={(e) => setEditOrigin(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">回调路径 (done_path)</label>
              <Input
                placeholder="/login/wechat-done"
                value={editDonePath}
                onChange={(e) => setEditDonePath(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Client Secret</label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-auto py-0"
                  onClick={() => setEditSecret(generateSecret())}
                >
                  重新生成
                </Button>
              </div>
              <Input
                value={editSecret}
                onChange={(e) => setEditSecret(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">至少 16 个字符，仅由业务后端持有</p>
            </div>
            {dialogError && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {dialogError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={!!deleteName} onOpenChange={() => setDeleteName(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除站点 <code className="font-mono bg-muted px-1 rounded">{deleteName}</code> 吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteName(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}
