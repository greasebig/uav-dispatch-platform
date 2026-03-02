import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { 
  Dialog, DialogContent, DialogDescription, DialogFooter, 
  DialogHeader, DialogTitle, DialogTrigger 
} from "@/components/ui/dialog";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { toast } from "sonner";
import { Search, UserPlus, Shield, ShieldOff, MoreVertical } from "lucide-react";

export function UserManagementPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  const queryClient = useQueryClient();

  // 获取用户列表
  const { data: users, isLoading, refetch } = trpc.admin.getUsers.useQuery({
    search: searchTerm,
    role: roleFilter === "all" ? undefined : roleFilter,
    page: 1,
    pageSize: 50,
  });

  // 更新用户状态
  const updateUserStatus = trpc.admin.updateUserStatus.useMutation({
    onSuccess: () => {
      toast.success("用户状态已更新");
      refetch();
    },
    onError: (error) => {
      toast.error(`更新失败: ${error.message}`);
    },
  });

  // 更新用户角色
  const updateUserRole = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success("用户角色已更新");
      refetch();
      setIsEditDialogOpen(false);
    },
    onError: (error) => {
      toast.error(`更新失败: ${error.message}`);
    },
  });

  const handleBanUser = (userId: number, banned: boolean) => {
    updateUserStatus.mutate({ userId, banned });
  };

  const handleRoleChange = (userId: number, role: string) => {
    updateUserRole.mutate({ userId, role });
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin": return "bg-purple-500";
      case "pilot": return "bg-blue-500";
      case "customer": return "bg-green-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">用户管理</h1>
          <p className="text-gray-500 mt-1">管理客户、飞手和管理员账户</p>
        </div>
        <Button>
          <UserPlus className="w-4 h-4 mr-2" />
          添加用户
        </Button>
      </div>

      {/* 搜索和筛选 */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="搜索用户..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="筛选角色" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部用户</SelectItem>
                <SelectItem value="customer">客户</SelectItem>
                <SelectItem value="pilot">飞手</SelectItem>
                <SelectItem value="admin">管理员</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => refetch()}>
              刷新
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 用户列表 */}
      <Card>
        <CardHeader>
          <CardTitle>用户列表</CardTitle>
          <CardDescription>
            共 {users?.length || 0} 个用户
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">加载中...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>用户名</TableHead>
                  <TableHead>手机号</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>注册时间</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((user: any) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.id}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                          {user.name?.[0] || user.email?.[0] || "?"}
                        </div>
                        <div>
                          <div>{user.name || "未设置"}</div>
                          <div className="text-xs text-gray-500">{user.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{user.phone || "-"}</TableCell>
                    <TableCell>
                      <Badge className={getRoleBadgeColor(user.role)}>
                        {user.role === "customer" ? "客户" : 
                         user.role === "pilot" ? "飞手" : "管理员"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.banned ? (
                        <Badge variant="destructive">已禁用</Badge>
                      ) : (
                        <Badge variant="outline">正常</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user);
                            setIsEditDialogOpen(true);
                          }}
                        >
                          编辑
                        </Button>
                        <Button
                          variant={user.banned ? "default" : "destructive"}
                          size="sm"
                          onClick={() => handleBanUser(user.id, !user.banned)}
                        >
                          {user.banned ? (
                            <><Shield className="w-4 h-4 mr-1" /> 解封</>
                          ) : (
                            <><ShieldOff className="w-4 h-4 mr-1" /> 禁用</>
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 编辑用户对话框 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑用户</DialogTitle>
            <DialogDescription>
              修改用户角色和基本信息
            </DialogDescription>
          </DialogHeader>
          
          {selectedUser && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">用户名</label>
                <Input value={selectedUser.name || ""} disabled />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">邮箱</label>
                <Input value={selectedUser.email || ""} disabled />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">手机号</label>
                <Input value={selectedUser.phone || ""} disabled />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">角色</label>
                <Select 
                  value={selectedUser.role} 
                  onValueChange={(value) => handleRoleChange(selectedUser.id, value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">客户</SelectItem>
                    <SelectItem value="pilot">飞手</SelectItem>
                    <SelectItem value="admin">管理员</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
