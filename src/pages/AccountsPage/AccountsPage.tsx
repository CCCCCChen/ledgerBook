import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, CreditCard, Building2, Smartphone, Landmark, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ACCOUNT_TYPE_LABELS } from '@/data/finance';
import type { IAccount, AccountType } from '@/types/finance';
import { createAccount, deleteAccount, loadAccounts, updateAccount } from '@/lib/data-service';

const ACCOUNT_TYPES: { value: AccountType; label: string; icon: typeof CreditCard }[] = [
  { value: 'alipay_huabei', label: '支付宝花呗', icon: CreditCard },
  { value: 'alipay_balance', label: '支付宝余额', icon: Smartphone },
  { value: 'wechat_balance', label: '微信余额', icon: Smartphone },
  { value: 'credit_card', label: '信用卡', icon: CreditCard },
  { value: 'debit_card', label: '储蓄卡', icon: Landmark },
];

const TYPE_ICON_MAP: Record<AccountType, typeof CreditCard> = {
  alipay_huabei: CreditCard,
  alipay_balance: Smartphone,
  wechat_balance: Smartphone,
  credit_card: CreditCard,
  debit_card: Landmark,
};

const TYPE_BADGE_CLASS: Record<AccountType, string> = {
  alipay_huabei: 'bg-blue-50 text-blue-700 border-blue-200',
  alipay_balance: 'bg-blue-50 text-blue-700 border-blue-200',
  wechat_balance: 'bg-green-50 text-green-700 border-green-200',
  credit_card: 'bg-purple-50 text-purple-700 border-purple-200',
  debit_card: 'bg-amber-50 text-amber-700 border-amber-200',
};

interface AccountFormData {
  name: string;
  type: AccountType;
  billingDay: string;
  note: string;
}

const EMPTY_FORM: AccountFormData = {
  name: '',
  type: 'alipay_huabei',
  billingDay: '',
  note: '',
};

function needsBillingDay(type: AccountType): boolean {
  return type === 'alipay_huabei' || type === 'credit_card';
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<IAccount[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountFormData>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<IAccount | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    const data = await loadAccounts();
    setAccounts(data);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 打开新建 Dialog
  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  // 打开编辑 Dialog
  const openEdit = (account: IAccount) => {
    setEditingId(account.id);
    setForm({
      name: account.name,
      type: account.type,
      billingDay: account.billingDay != null ? String(account.billingDay) : '',
      note: account.note,
    });
    setDialogOpen(true);
  };

  // 提交表单
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('请输入账户名称');
      return;
    }
    if (needsBillingDay(form.type) && !form.billingDay) {
      toast.error('请设置账单日');
      return;
    }

    setSubmitting(true);
    try {
      if (editingId) {
        const updated = await updateAccount(editingId, {
          name: form.name.trim(),
          type: form.type,
          billingDay: needsBillingDay(form.type) && form.billingDay ? Number(form.billingDay) : undefined,
          note: form.note.trim(),
        });
        if (!updated) {
          toast.error('账户更新失败');
          return;
        }
        toast.success('账户已更新');
      } else {
        const created = await createAccount({
          name: form.name.trim(),
          type: form.type,
          billingDay: needsBillingDay(form.type) && form.billingDay ? Number(form.billingDay) : undefined,
          note: form.note.trim(),
        });
        if (!created) {
          toast.error('账户创建失败');
          return;
        }
        toast.success('账户已添加');
      }

      setDialogOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  // 删除账户
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const ok = await deleteAccount(deleteTarget.id);
      if (!ok) {
        toast.error('账户删除失败');
        return;
      }
      toast.success('账户已删除');
      setDeleteTarget(null);
      await refresh();
    } catch (error) {
      toast.error(`账户删除失败：${String(error)}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">账户管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理你的支付账户，设置信用卡和花呗的账单日
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="size-4" />
          添加账户
        </Button>
      </div>

      {/* 账户卡片列表 */}
      {accounts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Wallet className="size-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground text-sm">还没有添加任何账户</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
              <Plus className="size-4" />
              添加第一个账户
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => {
            const Icon = TYPE_ICON_MAP[account.type] || Wallet;
            const badgeClass = TYPE_BADGE_CLASS[account.type] || 'bg-muted text-muted-foreground border-border';
            return (
              <Card key={account.id} className="group">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="size-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{account.name}</CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-normal ${badgeClass}`}>
                            {ACCOUNT_TYPE_LABELS[account.type]}
                          </Badge>
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(account)}
                        aria-label="编辑"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(account)}
                        aria-label="删除"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {account.billingDay != null && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">账单日</span>
                      <span className="font-medium text-foreground tabular-nums">
                        每月 {account.billingDay} 日
                      </span>
                    </div>
                  )}
                  {account.note && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{account.note}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 新建/编辑 Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑账户' : '添加账户'}</DialogTitle>
            <DialogDescription>
              {editingId ? '修改账户信息' : '添加一个新的支付账户'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-4 py-2">
              {/* 账户名称 */}
              <div className="space-y-2">
                <Label htmlFor="acc-name">账户名称</Label>
                <Input
                  id="acc-name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="如：招商银行信用卡"
                />
              </div>

              {/* 账户类型 */}
              <div className="space-y-2">
                <Label>账户类型</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      type: v as AccountType,
                      billingDay: needsBillingDay(v as AccountType) ? prev.billingDay : '',
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择账户类型" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((t) => {
                      const TIcon = t.icon;
                      return (
                        <SelectItem key={t.value} value={t.value}>
                          <span className="flex items-center gap-2">
                            <TIcon className="size-4" />
                            {t.label}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* 账单日 — 仅信用卡/花呗显示 */}
              {needsBillingDay(form.type) && (
                <div className="space-y-2">
                  <Label htmlFor="acc-billing">账单日</Label>
                  <Select
                    value={form.billingDay}
                    onValueChange={(v) => setForm((prev) => ({ ...prev, billingDay: v }))}
                  >
                    <SelectTrigger id="acc-billing">
                      <SelectValue placeholder="选择账单日" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          每月 {d} 日
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* 备注 */}
              <div className="space-y-2">
                <Label htmlFor="acc-note">备注</Label>
                <Input
                  id="acc-note"
                  value={form.note}
                  onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="可选备注"
                />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? '保存中...' : editingId ? '保存修改' : '添加账户'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除账户「{deleteTarget?.name}」吗？关联的交易记录将保留，但账户字段会被清空。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
