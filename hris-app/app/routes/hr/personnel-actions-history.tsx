import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { History, Search, Download, Award, UserX, UserCheck, TrendingUp, ArrowRightLeft, UserCog, CheckCircle2, XCircle, Clock, Eye, RefreshCw } from "lucide-react";
import { Card, CardContent } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { EmployeeAvatar } from "~/components/atoms/EmployeeAvatar";
import { Input } from "~/components/atoms/Input";
import { Select } from "~/components/atoms/Select";
import { useHRTicketQueues } from "~/lib/hooks/useRequests";
import type { Request, RequestType, RequestStatus } from "~/services/requests.service";



const PAN_TYPES: RequestType[] = ["PROMOTION", "TRANSFER", "TERMINATION", "REGULARIZATION", "RESIGNATION", "SALARY_CHANGE"];

const STATUS_CONFIG: Record<string, { color: string; icon: typeof CheckCircle2 }> = {
  COMPLETED: { color: "success", icon: CheckCircle2 },
  APPROVED: { color: "success", icon: CheckCircle2 },
  REJECTED: { color: "destructive", icon: XCircle },
  CANCELLED: { color: "secondary", icon: XCircle },
  PENDING: { color: "warning", icon: Clock },
  IN_PROGRESS: { color: "info", icon: Clock },
};

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Award }> = {
  PROMOTION: { label: "Promotion", icon: TrendingUp },
  TRANSFER: { label: "Transfer", icon: ArrowRightLeft },
  TERMINATION: { label: "Termination", icon: UserX },
  REGULARIZATION: { label: "Regularization", icon: UserCheck },
  RESIGNATION: { label: "Resignation", icon: UserCog },
  SALARY_CHANGE: { label: "Salary Change", icon: Award },
};

const getMetadataField = (request: Request | null | undefined, field: string): unknown => {
  if (!request || !request.metadata || typeof request.metadata !== "object") return null;
  return request.metadata[field] ?? null;
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const getEmployeeName = (request: Request): string => {
  const target = request.targetEmployee;
  if (target?.person?.personalInfo) {
    const { firstName, lastName } = target.person.personalInfo;
    if (firstName || lastName) return `${firstName} ${lastName}`;
  }
  if (request.requester?.person?.personalInfo) {
    const { firstName, lastName } = request.requester.person.personalInfo;
    if (firstName || lastName) return `${firstName} ${lastName}`;
  }
  return "Unknown";
};

const getEmployeeId = (request: Request): string => {
  return request.targetEmployee?.employeeId || request.requester?.employeeId || "N/A";
};

const getPanSubType = (request: Request): string => {
  const val = getMetadataField(request, "panSubType");
  return String(val && val !== request.type ? val : request.type || "");
};

const getRequestStatus = (request: Request): RequestStatus => {
  return (request.currentWorkflowStateKey as RequestStatus) || "PENDING";
};

const getCompletedDate = (request: Request): string => {
  return request.lastCompletedStepExecution?.completedAt || request.updatedAt || request.createdAt || "";
};

const getTicketQueueBucket = (
  data: { ticketQueues?: Array<{ queueKey: string; requests: Request[] }> } | undefined,
  key: string
) => {
  return data?.ticketQueues?.find((q) => q.queueKey === key);
};

export default function PersonnelActionsHistory() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data, isLoading, refetch, isFetching } = useHRTicketQueues({
    limit: 100,
    queueLimit: 100,
    sort: "lastCompletedStepExecution.completedAt",
    order: "desc",
    fields: [
      "id", "code", "type", "metadata", "currentWorkflowStateKey", "createdAt", "updatedAt",
      "requester.id", "requester.employeeId", "requester.person.personalInfo", "requester.department.name",
      "targetEmployee.id", "targetEmployee.employeeId", "targetEmployee.person.personalInfo",
      "targetEmployee.department.name", "targetEmployee.position.title", "lastCompletedStepExecution.completedAt",
    ].join(","),
  });

  const allRequests = useMemo(() => {
    const recentBucket = getTicketQueueBucket(data, "recent");
    return recentBucket?.requests || [];
  }, [data]);

  const panRequests = useMemo(() => {
    return allRequests.filter((req) => PAN_TYPES.includes(req.type as RequestType));
  }, [allRequests]);

  const stats = useMemo(() => {
    const total = panRequests.length;
    const completed = panRequests.filter((r) => getRequestStatus(r) === "COMPLETED").length;
    const pending = panRequests.filter((r) => !["COMPLETED", "REJECTED", "CANCELLED"].includes(getRequestStatus(r))).length;
    const rejected = panRequests.filter((r) => ["REJECTED", "CANCELLED"].includes(getRequestStatus(r))).length;
    return { total, completed, pending, rejected };
  }, [panRequests]);

  const typeBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const req of panRequests) {
      const type = getPanSubType(req);
      counts[type] = (counts[type] || 0) + 1;
    }
    return Object.entries(counts)
      .filter(([type]) => TYPE_CONFIG[type])
      .map(([type, count]) => ({ type, count, config: TYPE_CONFIG[type] }))
      .sort((a, b) => b.count - a.count);
  }, [panRequests]);

  const filtered = useMemo(() => {
    return panRequests.filter((req) => {
      if (search) {
        const searchLower = search.toLowerCase();
        const name = getEmployeeName(req).toLowerCase();
        const empId = getEmployeeId(req).toLowerCase();
        const code = (req.code || "").toLowerCase();
        if (!name.includes(searchLower) && !empId.includes(searchLower) && !code.includes(searchLower)) return false;
      }
      if (typeFilter && getPanSubType(req) !== typeFilter) return false;
      if (statusFilter && getRequestStatus(req) !== statusFilter) return false;
      if (dateFrom || dateTo) {
        const completed = getCompletedDate(req);
        if (completed) {
          const completedDate = new Date(completed);
          if (dateFrom && completedDate < new Date(dateFrom)) return false;
          if (dateTo && completedDate > new Date(dateTo + "T23:59:59")) return false;
        }
      }
      return true;
    });
  }, [panRequests, search, typeFilter, statusFilter, dateFrom, dateTo]);

  const handleExport = () => {
    const headers = ["Code", "Employee", "Employee ID", "Type", "Status", "Completed Date", "Department", "Position"];
    const rows = filtered.map((req) => [
      req.code || "", getEmployeeName(req), getEmployeeId(req),
      TYPE_CONFIG[getPanSubType(req)]?.label || getPanSubType(req),
      getRequestStatus(req), formatDate(getCompletedDate(req)),
      req.targetEmployee?.department?.name || "", req.targetEmployee?.position?.title || "",
    ]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `personnel-actions-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };


  const columns: Column<Request>[] = [
    { header: "Code", accessorKey: "code", cell: ({ row }) => <span className="font-mono text-sm">{row.code || "N/A"}</span> },
    { header: "Employee", accessorKey: "employee", cell: ({ row }) => {
      const name = getEmployeeName(row);
      return <div className="flex items-center gap-2"><EmployeeAvatar name={name} className="h-8 w-8 text-xs" /><div><p className="font-medium">{name}</p><p className="text-xs text-muted-foreground">{getEmployeeId(row)}</p></div></div>;
    }},
    { header: "Type", accessorKey: "type", cell: ({ row }) => {
      const type = getPanSubType(row);
      const config = TYPE_CONFIG[type];
      if (!config) return <Badge variant="outline">{type}</Badge>;
      const Icon = config.icon;
      return <Badge variant="outline" className="gap-1.5"><Icon className="h-3.5 w-3.5" />{config.label}</Badge>;
    }},
    { header: "Status", accessorKey: "status", cell: ({ row }) => {
      const status = getRequestStatus(row);
      const config = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
      const Icon = config.icon;
      return <Badge variant={config.color as any} className="gap-1.5"><Icon className="h-3.5 w-3.5" />{status.replace(/_/g, " ")}</Badge>;
    }},
    { header: "Completed Date", accessorKey: "completedAt", cell: ({ row }) => <span className="text-sm">{formatDate(getCompletedDate(row))}</span> },
    { header: "Department", accessorKey: "department", cell: ({ row }) => <span className="text-sm">{row.targetEmployee?.department?.name || "-"}</span> },
    { header: "Actions", accessorKey: "actions", cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate(`/hr/requests/tickets?requestId=${row.id}`)}><Eye className="h-4 w-4" /></Button>
      </div>
    )},
  ];

  const typeOptions = [{ value: "", label: "All Types" }, ...Object.entries(TYPE_CONFIG).map(([value, config]) => ({ value, label: config.label }))];
  const statusOptions = [{ value: "", label: "All Statuses" }, { value: "COMPLETED", label: "Completed" }, { value: "APPROVED", label: "Approved" }, { value: "REJECTED", label: "Rejected" }, { value: "CANCELLED", label: "Cancelled" }, { value: "PENDING", label: "Pending" }, { value: "IN_PROGRESS", label: "In Progress" }];


  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg"><History className="h-6 w-6 text-primary" /></div>
          <div><h1 className="text-2xl font-bold tracking-tight">Personnel Action History</h1><p className="text-sm text-muted-foreground">View all completed personnel actions (transfers, promotions, terminations, etc.)</p></div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />Refresh</Button>
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><div className="flex items-center gap-2"><div className="p-2 bg-blue-100 rounded-lg"><Award className="h-4 w-4 text-blue-600" /></div><div><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold">{stats.total}</p></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2"><div className="p-2 bg-green-100 rounded-lg"><CheckCircle2 className="h-4 w-4 text-green-600" /></div><div><p className="text-xs text-muted-foreground">Completed</p><p className="text-xl font-bold">{stats.completed}</p></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2"><div className="p-2 bg-yellow-100 rounded-lg"><Clock className="h-4 w-4 text-yellow-600" /></div><div><p className="text-xs text-muted-foreground">Pending</p><p className="text-xl font-bold">{stats.pending}</p></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2"><div className="p-2 bg-red-100 rounded-lg"><XCircle className="h-4 w-4 text-red-600" /></div><div><p className="text-xs text-muted-foreground">Rejected</p><p className="text-xl font-bold">{stats.rejected}</p></div></div></CardContent></Card>
      </div>

      {typeBreakdown.length > 0 && (
        <Card><CardContent className="p-4"><div className="flex flex-wrap gap-2">{typeBreakdown.map(({ type, count, config }) => {
          const Icon = config.icon;
          return <Badge key={type} variant="outline" className="gap-1.5 px-3 py-1"><Icon className="h-3.5 w-3.5" />{config.label}<span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold">{count}</span></Badge>;
        })}</div></CardContent></Card>
      )}

      <Card><CardContent className="p-4"><div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search by name, ID, or code..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
        <div className="w-40"><Select options={typeOptions} value={typeFilter} onChange={setTypeFilter} placeholder="Type" /></div>
        <div className="w-40"><Select options={statusOptions} value={statusFilter} onChange={setStatusFilter} placeholder="Status" /></div>
        <div className="flex items-center gap-2"><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" /><span className="text-muted-foreground">to</span><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" /></div>
        {(search || typeFilter || statusFilter || dateFrom || dateTo) && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setTypeFilter(""); setStatusFilter(""); setDateFrom(""); setDateTo(""); }}>Clear Filters</Button>}
      </div></CardContent></Card>

      <Card><CardContent className="p-0"><DataTable<Request> title="" data={filtered} columns={columns} isLoading={isLoading} emptyMessage="No personnel actions found" emptyDescription="Completed personnel actions will appear here." showPagination itemsPerPage={20} /></CardContent></Card>
    </div>
  );
}