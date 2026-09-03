import { useState, useMemo, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  Search, Trash2, ChevronUp, ChevronDown, ChevronsUpDown,
  X, Check, UserPlus, Users, CheckCircle, AlertCircle,
} from "lucide-react";
import { Admin, AdminRole } from "../types";
import { authHeaders, AuthUser } from "../auth";
import { roleRank, canAssignRole } from "../permissions";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

const ROLE_CONFIG: Record<AdminRole, { label: string; color: string; bg: string }> = {
  admin:    { label: "관리자",   color: "#7C3AED", bg: "#EDE9FE" },
  manager:  { label: "매니저",   color: "#2563EB", bg: "#DBEAFE" },
  operator: { label: "운영자",   color: "#059669", bg: "#D1FAE5" },
  viewer:   { label: "열람자",   color: "#64748B", bg: "#F1F5F9" },
};

const PAGE_SIZE = 10;

interface ManagersPageProps {
  admins: Admin[];
  setAdmins: Dispatch<SetStateAction<Admin[]>>;
  currentUser: AuthUser;
}

export function ManagersPage({ admins, setAdmins, currentUser }: ManagersPageProps) {
  const assignableRoles = (Object.keys(ROLE_CONFIG) as AdminRole[]).filter((r) => canAssignRole(currentUser.role, r));
  const [floorOptions, setFloorOptions] = useState<{ floor_id: number; floor_name: string }[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/floors/detail`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: { floor_id: number; floor_name: string; floor_label: string | null }[]) => {
        if (Array.isArray(data)) {
          setFloorOptions(data.map((f) => ({ floor_id: f.floor_id, floor_name: f.floor_label ?? f.floor_name })));
        }
      })
      .catch(() => {});
  }, []);

  const [search, setSearch] = useState("");
  const [searchFilter, setSearchFilter] = useState<"all" | "name" | "email" | "phone" | "floor">("all");
  const [sortField, setSortField] = useState<keyof Admin | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", role: "" as AdminRole | "", floor_id: "" });
  const [formSuccess, setFormSuccess] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return admins;
    return admins.filter((a) => {
      if (searchFilter === "name") return a.admin_name.toLowerCase().includes(q);
      if (searchFilter === "email") return a.email.toLowerCase().includes(q);
      if (searchFilter === "phone") return (a.phone_number ?? "").toLowerCase().includes(q);
      if (searchFilter === "floor") return (a.assigned_floor_name ?? "전체").toLowerCase().includes(q);
      return (
        a.admin_name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        (a.phone_number ?? "").toLowerCase().includes(q) ||
        (a.assigned_floor_name ?? "전체").toLowerCase().includes(q)
      );
    });
  }, [admins, search, searchFilter]);

  const sorted = useMemo(() => {
    if (!sortField) return filtered;
    return [...filtered].sort((a, b) => {
      const av = String(a[sortField]);
      const bv = String(b[sortField]);
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filtered, sortField, sortDir]);

  const pageCount = Math.ceil(sorted.length / PAGE_SIZE);
  const pageItems = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = (field: keyof Admin) => {
    if (sortField === field) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortField(null); setSortDir("asc"); }
    } else { setSortField(field); setSortDir("asc"); }
    setPage(0);
  };

  const toggleRow = (id: number) => {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const toggleAll = () => {
    if (selected.size === pageItems.length) setSelected(new Set());
    else setSelected(new Set(pageItems.map((a) => a.admin_id)));
  };

  const handleDelete = async (id: number) => {
    if (pendingDelete !== id) {
      setPendingDelete(id);
      setTimeout(() => setPendingDelete((cur) => (cur === id ? null : cur)), 3000);
      return;
    }
    setActionError("");
    try {
      const res = await fetch(`${API_BASE}/api/admins/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setActionError(typeof errBody?.detail === "string" ? errBody.detail : "삭제 권한이 없거나 삭제에 실패했습니다.");
        setPendingDelete(null);
        return;
      }
    } catch {
      setActionError("네트워크 오류가 발생했습니다. 서버 연결을 확인하세요.");
      setPendingDelete(null);
      return;
    }
    setAdmins((prev) => prev.filter((a) => a.admin_id !== id));
    setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
    setPendingDelete(null);
  };

  const handleBulkDelete = async () => {
    setActionError("");
    const ids = [...selected];
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`${API_BASE}/api/admins/${id}`, { method: "DELETE", headers: authHeaders() })
          .then((res) => ({ id, ok: res.ok }))
      )
    );
    const succeeded = new Set(
      results
        .filter((r): r is PromiseFulfilledResult<{ id: number; ok: boolean }> => r.status === "fulfilled" && r.value.ok)
        .map((r) => r.value.id)
    );
    if (succeeded.size < ids.length) {
      setActionError("일부 담당자는 권한이 없어 삭제되지 않았습니다.");
    }
    setAdmins((prev) => prev.filter((a) => !succeeded.has(a.admin_id)));
    setSelected(new Set());
  };

  const handleSubmit = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password || !form.phone.trim()) {
      setFormError("이름, 이메일, 비밀번호, 연락처를 모두 입력하세요.");
      return;
    }
    setSaving(true);
    setFormError("");

    const payload = {
      admin_name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      role: (form.role || "operator") as AdminRole,
      phone_number: form.phone.trim(),
      assigned_floor_id: form.floor_id ? parseInt(form.floor_id) : null,
    };

    try {
      const res = await fetch(`${API_BASE}/api/admins`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const detail = errBody?.detail;
        let msg: string;
        if (typeof detail === "string") {
          msg = detail;
        } else if (Array.isArray(detail)) {
          const FIELD_KO: Record<string, string> = { email: "이메일", admin_name: "이름", password: "비밀번호", phone_number: "연락처", role: "역할" };
          msg = detail.map((e: { loc?: string[]; msg?: string }) => {
            const field = e.loc?.at(-1) ?? "";
            const fieldKo = FIELD_KO[field] ?? field;
            if (field === "email") return "이메일 형식이 올바르지 않습니다.";
            return `${fieldKo}: ${e.msg ?? "입력값 오류"}`;
          }).join(" / ");
        } else {
          msg = `서버 오류 (${res.status})`;
        }
        setFormError(msg);
        setSaving(false);
        return;
      }
      const body = await res.json();
      const created: Admin = body.admin ?? body.data ?? body;
      setAdmins((prev) => [...prev, created]);
    } catch {
      setFormError("네트워크 오류가 발생했습니다. 서버 연결을 확인하세요.");
      setSaving(false);
      return;
    }

    setForm({ name: "", email: "", password: "", phone: "", role: "", floor_id: "" });
    setFormSuccess(true);
    setSaving(false);
    setTimeout(() => setFormSuccess(false), 3500);
    setPage(0);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "#F4F6F9" }}>
      <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0">
        <div>
          <h1 className="text-slate-800" style={{ fontSize: "17px", fontWeight: 800 }}>담당자 관리</h1>
          <p className="text-slate-400" style={{ fontSize: "11px" }}>Manager Management · 등록된 담당자 목록</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "#DBEAFE", border: "1px solid #2563EB20" }}>
          <Users size={13} style={{ color: "#2563EB" }} />
          <div>
            <p style={{ fontSize: "15px", fontWeight: 800, color: "#0F172A", lineHeight: "1" }}>{admins.length}</p>
            <p style={{ fontSize: "9px", color: "#94A3B8", lineHeight: "1" }}>전체</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 gap-5 px-6 pb-6 overflow-hidden min-h-0">
        {/* LEFT: Table */}
        <div
          className="bg-white rounded-2xl flex flex-col overflow-hidden"
          style={{ flex: "4 4 0%", boxShadow: "0 1px 8px rgba(0,0,0,0.06)", border: "1px solid #EEF2F7" }}
        >
          {actionError && (
            <div className="flex items-center gap-2 px-5 py-2.5 flex-shrink-0" style={{ background: "#FEE2E2", borderBottom: "1px solid #FECACA" }}>
              <AlertCircle size={13} style={{ color: "#DC2626", flexShrink: 0 }} />
              <p style={{ fontSize: "11px", color: "#991B1B" }}>{actionError}</p>
              <button onClick={() => setActionError("")} className="ml-auto text-red-400 hover:text-red-600">
                <X size={12} />
              </button>
            </div>
          )}
          <div className="flex items-center gap-3 px-5 py-3.5 flex-shrink-0" style={{ borderBottom: "1px solid #F1F5F9" }}>
            <div className="flex items-center bg-slate-50 rounded-xl border border-slate-100 flex-1 max-w-xs focus-within:border-blue-300 focus-within:bg-white transition-all overflow-hidden">
              <select
                value={searchFilter}
                onChange={(e) => { setSearchFilter(e.target.value as "all" | "name" | "email" | "phone" | "floor"); setPage(0); }}
                className="outline-none bg-transparent cursor-pointer text-slate-500 hover:text-slate-700 transition-colors"
                style={{ fontSize: "11px", fontWeight: 700, padding: "8px 6px 8px 10px", flexShrink: 0, borderRight: "1px solid #E2E8F0" }}
              >
                <option value="all">전체</option>
                <option value="name">이름</option>
                <option value="email">이메일</option>
                <option value="phone">연락처</option>
                <option value="floor">담당 층</option>
              </select>
              <div className="flex items-center gap-2 flex-1 px-2.5 py-2 min-w-0">
                <Search size={13} style={{ color: "#94A3B8", flexShrink: 0 }} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  placeholder={
                    searchFilter === "name"  ? "이름 검색…" :
                    searchFilter === "email" ? "이메일 검색…" :
                    searchFilter === "phone" ? "연락처 검색…" :
                    searchFilter === "floor" ? "담당 층 검색…" :
                    "이름, 이메일, 연락처, 층 검색…"
                  }
                  className="flex-1 bg-transparent outline-none text-slate-700 placeholder-slate-300 min-w-0"
                  style={{ fontSize: "12px" }}
                />
                {search && <button onClick={() => setSearch("")} className="text-slate-300 hover:text-slate-500"><X size={11} /></button>}
              </div>
            </div>
            <div className="flex-1" />
            {selected.size > 0 && (
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-red-600 transition-colors hover:bg-red-50"
                style={{ fontSize: "11px", fontWeight: 600, border: "1px solid #FEE2E2" }}
              >
                <Trash2 size={12} />
                {selected.size}명 삭제
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full border-collapse" style={{ height: "100%" }}>
              <thead className="sticky top-0" style={{ background: "#FAFBFC", borderBottom: "1px solid #EEF2F7", zIndex: 10 }}>
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.size > 0 && selected.size === pageItems.length}
                      onChange={toggleAll}
                      className="w-3.5 h-3.5 rounded accent-blue-500 cursor-pointer"
                    />
                  </th>
                  <Th label="#" align="center" />
                  <Th label="이름" field="admin_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <Th label="이메일" field="email" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <Th label="역할" field="role" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <Th label="연락처" field="phone_number" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <Th label="담당 층" field="assigned_floor_id" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="center" />
                  <Th label="등록일" field="created_at" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <Th label="작업" align="center" />
                </tr>
              </thead>
              <tbody>
                {pageItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-16 text-slate-300" style={{ fontSize: "13px" }}>
                      등록된 담당자가 없습니다
                    </td>
                  </tr>
                ) : (
                  <>
                    {pageItems.map((admin, idx) => {
                    const isChecked = selected.has(admin.admin_id);
                    const isPendingDel = pendingDelete === admin.admin_id;
                    const rowNum = page * PAGE_SIZE + idx + 1;
                    const roleCfg = ROLE_CONFIG[admin.role] ?? ROLE_CONFIG.viewer;
                    return (
                      <tr
                        key={admin.admin_id}
                        className="transition-colors"
                        style={{ height: `${100 / PAGE_SIZE}%`, background: isChecked ? "#F0F7FF" : "white", borderBottom: "1px solid #F8FAFC" }}
                        onMouseEnter={(e) => { if (!isChecked) (e.currentTarget as HTMLTableRowElement).style.background = "#FAFBFC"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = isChecked ? "#F0F7FF" : "white"; }}
                      >
                        <td className="w-10 px-4 py-3">
                          <input type="checkbox" checked={isChecked} onChange={() => toggleRow(admin.admin_id)} className="w-3.5 h-3.5 rounded accent-blue-500 cursor-pointer" />
                        </td>
                        <td className="px-2 py-3 text-center text-slate-300" style={{ fontSize: "11px" }}>{rowNum}</td>
                        <td className="px-4 py-3">
                          <span className="text-slate-800" style={{ fontSize: "12px", fontWeight: 700 }}>{admin.admin_name}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-500" style={{ fontSize: "11px" }}>{admin.email}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-md" style={{ fontSize: "10px", fontWeight: 700, background: roleCfg.bg, color: roleCfg.color }}>
                            {roleCfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-500" style={{ fontSize: "11px", fontFamily: "monospace" }}>{admin.phone_number}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-2 py-0.5 rounded-md" style={{ fontSize: "10px", fontWeight: 700, background: "#DBEAFE", color: "#2563EB" }}>
                            {admin.assigned_floor_name ?? "전체"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-400" style={{ fontSize: "11px" }}>{admin.created_at.slice(0, 10)}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {roleRank(admin.role) < roleRank(currentUser.role) ? (
                            <span className="text-slate-200" style={{ fontSize: "11px" }}>—</span>
                          ) : isPendingDel ? (
                            <div className="flex items-center gap-1 justify-center">
                              <button onClick={() => handleDelete(admin.admin_id)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-white" style={{ fontSize: "10px", fontWeight: 600, background: "#EF4444" }}>
                                <Check size={10} /> 확인
                              </button>
                              <button onClick={() => setPendingDelete(null)} className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200">
                                <X size={10} style={{ color: "#64748B" }} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleDelete(admin.admin_id)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center mx-auto transition-all hover:bg-red-50"
                              style={{ color: "#CBD5E1" }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = "#EF4444")}
                              onMouseLeave={(e) => (e.currentTarget.style.color = "#CBD5E1")}
                              title="담당자 삭제"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                    })}
                    {Array.from({ length: PAGE_SIZE - pageItems.length }, (_, i) => (
                      <tr key={`ph-${i}`} style={{ height: `${100 / PAGE_SIZE}%`, borderBottom: "1px solid #F8FAFC" }}>
                        <td colSpan={9} />
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderTop: "1px solid #F1F5F9", background: "#FAFBFC" }}>
            <p className="text-slate-400" style={{ fontSize: "11px" }}>
              {sorted.length > 0
                ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, sorted.length)} / 총 ${sorted.length}명`
                : "0명"}
            </p>
            <div className="flex items-center gap-1">
              <PageBtn disabled={page === 0} onClick={() => setPage(page - 1)} label="←" />
              {Array.from({ length: pageCount }, (_, i) => (
                <PageBtn key={i} active={i === page} onClick={() => setPage(i)} label={String(i + 1)} />
              ))}
              <PageBtn disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)} label="→" />
            </div>
          </div>
        </div>

        {/* RIGHT: Add Form */}
        <div
          className="bg-white rounded-2xl flex flex-col overflow-y-auto"
          style={{ flex: "0 0 280px", boxShadow: "0 1px 8px rgba(0,0,0,0.06)", border: "1px solid #EEF2F7" }}
        >
          <div className="px-6 pt-6 pb-5 flex-shrink-0" style={{ borderBottom: "1px solid #F1F5F9" }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, #2563EB, #60A5FA)" }}>
                <UserPlus size={16} color="white" />
              </div>
              <div>
                <p className="text-slate-800" style={{ fontSize: "14px", fontWeight: 800 }}>담당자 추가</p>
                <p className="text-slate-400" style={{ fontSize: "10px" }}>Add New Manager</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4 flex-1">
            {formError && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "#FEE2E2", border: "1px solid #FECACA" }}>
                <AlertCircle size={13} style={{ color: "#DC2626", flexShrink: 0 }} />
                <p style={{ fontSize: "11px", color: "#991B1B" }}>{formError}</p>
              </div>
            )}
            {formSuccess && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "#DCFCE7", border: "1px solid #BBF7D0" }}>
                <CheckCircle size={13} style={{ color: "#16A34A", flexShrink: 0 }} />
                <p style={{ fontSize: "11px", color: "#15803D", fontWeight: 600 }}>담당자가 추가되었습니다!</p>
              </div>
            )}

            <FormField label="이름" en="Name" required>
              <TextInput value={form.name} onChange={(v) => { setForm((f) => ({ ...f, name: v })); setFormError(""); }} placeholder="예: 홍길동" />
            </FormField>

            <FormField label="이메일" en="Email" required>
              <TextInput value={form.email} onChange={(v) => { setForm((f) => ({ ...f, email: v })); setFormError(""); }} placeholder="예: user@example.com" />
            </FormField>

            <FormField label="비밀번호" en="Password" required>
              <input
                type="password"
                value={form.password}
                onChange={(e) => { setForm((f) => ({ ...f, password: e.target.value })); setFormError(""); }}
                placeholder="초기 비밀번호"
                className="w-full px-3.5 py-2.5 rounded-xl outline-none transition-all"
                style={{ fontSize: "12px", border: "1.5px solid #E2E8F0", background: "#FAFBFC", color: "#334155" }}
                onFocus={(e) => { e.target.style.borderColor = "#93C5FD"; e.target.style.background = "white"; }}
                onBlur={(e) => { e.target.style.borderColor = "#E2E8F0"; }}
              />
            </FormField>

            <FormField label="연락처" en="Phone" required>
              <TextInput value={form.phone} onChange={(v) => { setForm((f) => ({ ...f, phone: v })); setFormError(""); }} placeholder="예: 010-1234-5678" mono />
            </FormField>

            <FormField label="역할" en="Role" required>
              <div className="relative">
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AdminRole | "" }))}
                  className="w-full px-3.5 py-2.5 rounded-xl outline-none appearance-none transition-all cursor-pointer"
                  style={{ fontSize: "12px", border: "1.5px solid #E2E8F0", background: "#FAFBFC", color: form.role ? "#334155" : "#94A3B8" }}
                  onFocus={(e) => { e.target.style.borderColor = "#93C5FD"; e.target.style.background = "white"; }}
                  onBlur={(e) => { e.target.style.borderColor = "#E2E8F0"; }}
                >
                  <option value="">역할 선택 (기본: 운영자)</option>
                  {assignableRoles.map((r) => (
                    <option key={r} value={r}>{ROLE_CONFIG[r].label}</option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <ChevronDown size={13} style={{ color: "#94A3B8" }} />
                </div>
              </div>
            </FormField>

            <FormField label="담당 층" en="Assigned Floor">
              <div className="relative">
                <select
                  value={form.floor_id}
                  onChange={(e) => setForm((f) => ({ ...f, floor_id: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl outline-none appearance-none transition-all cursor-pointer"
                  style={{ fontSize: "12px", border: "1.5px solid #E2E8F0", background: "#FAFBFC", color: form.floor_id ? "#334155" : "#94A3B8" }}
                  onFocus={(e) => { e.target.style.borderColor = "#93C5FD"; e.target.style.background = "white"; }}
                  onBlur={(e) => { e.target.style.borderColor = "#E2E8F0"; }}
                >
                  <option value="">층 선택 (미선택 시 전체 담당)</option>
                  {floorOptions.map((f) => <option key={f.floor_id} value={String(f.floor_id)}>{f.floor_name}</option>)}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <ChevronDown size={13} style={{ color: "#94A3B8" }} />
                </div>
              </div>
            </FormField>

            <div className="h-px bg-slate-100" />

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 rounded-xl text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)", fontSize: "13px", fontWeight: 700, boxShadow: "0 4px 14px rgba(37,99,235,0.35)" }}
            >
              <UserPlus size={15} />
              {saving ? "저장 중…" : "담당자 추가"}
            </button>

            <p className="text-center text-slate-300" style={{ fontSize: "10px" }}>
              <span style={{ color: "#EF4444" }}>*</span> 표시된 항목은 필수 입력 사항입니다
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, en, required, children }: { label: string; en: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block mb-1.5" style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>
        {label} {required && <span style={{ color: "#EF4444" }}>*</span>}
        <span className="ml-1 text-slate-300" style={{ fontSize: "10px", fontWeight: 400 }}>{en}</span>
      </label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, mono }: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3.5 py-2.5 rounded-xl outline-none transition-all"
      style={{ fontSize: "12px", fontFamily: mono ? "monospace" : undefined, border: "1.5px solid #E2E8F0", background: "#FAFBFC", color: "#334155" }}
      onFocus={(e) => { e.target.style.borderColor = "#93C5FD"; e.target.style.background = "white"; }}
      onBlur={(e) => { e.target.style.borderColor = "#E2E8F0"; }}
    />
  );
}

function Th({ label, field, sortField, sortDir, onSort, align = "left" }: {
  label: string; field?: keyof Admin; sortField?: keyof Admin | null; sortDir?: "asc" | "desc";
  onSort?: (f: keyof Admin) => void; align?: "left" | "center";
}) {
  const isActive = field && sortField === field;
  return (
    <th
      className={`px-4 py-3 ${align === "center" ? "text-center" : "text-left"} ${field && onSort ? "cursor-pointer select-none" : ""}`}
      style={{ fontSize: "10px", fontWeight: 700, color: isActive ? "#2563EB" : "#94A3B8", letterSpacing: "0.05em", whiteSpace: "nowrap" }}
      onClick={() => field && onSort && onSort(field)}
    >
      <div className={`flex items-center gap-1 ${align === "center" ? "justify-center" : ""}`}>
        {label.toUpperCase()}
        {field && onSort && (
          <span style={{ opacity: 0.5 }}>
            {isActive
              ? sortDir === "asc" ? <ChevronUp size={10} style={{ color: "#2563EB", opacity: 1 }} /> : <ChevronDown size={10} style={{ color: "#2563EB", opacity: 1 }} />
              : <ChevronsUpDown size={10} />}
          </span>
        )}
      </div>
    </th>
  );
}

function PageBtn({ label, active, disabled, onClick }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
      style={{
        fontSize: "11px", fontWeight: active ? 700 : 400,
        background: active ? "#2563EB" : disabled ? "transparent" : "#F8FAFC",
        color: active ? "white" : disabled ? "#CBD5E1" : "#475569",
        border: active ? "none" : "1px solid #E2E8F0",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}
