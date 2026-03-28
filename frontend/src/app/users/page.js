"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { api } from "@/lib/api";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  Shield,
  Eye,
  X,
  Check,
} from "lucide-react";

export default function UsersPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [resetUser, setResetUser] = useState(null);
  const [deleteUser, setDeleteUser] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem("rmm_user");
    if (!stored) return router.replace("/login");
    const u = JSON.parse(stored);
    if (u.role !== "admin") return router.replace("/dashboard");
    setUser(u);
  }, [router]);

  useEffect(() => {
    if (user) fetchUsers();
  }, [user]);

  async function fetchUsers() {
    try {
      const data = await api.get("/auth/users");
      setUsers(data);
    } catch (err) {
      if (err.status === 401) router.replace("/login");
    } finally {
      setLoading(false);
    }
  }

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  if (!user || user.role !== "admin") return null;

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar user={user} />
      <main className="flex-1 pl-64">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <Users className="h-7 w-7 text-blue-500" />
                User Management
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                Manage users, roles, and passwords
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
            >
              <Plus className="h-4 w-4" />
              Add User
            </button>
          </div>

          {/* Users Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800 bg-slate-900/50">
                  <th className="text-left py-3 px-4">User</th>
                  <th className="text-left py-3 px-4">Email</th>
                  <th className="text-left py-3 px-4">Role</th>
                  <th className="text-left py-3 px-4">Created</th>
                  <th className="text-right py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-slate-500">
                      Loading...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-slate-500">
                      No users found
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30 text-slate-300"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                            {u.username[0].toUpperCase()}
                          </div>
                          <span className="font-medium text-white">{u.username}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">{u.email}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            u.role === "admin"
                              ? "bg-red-500/10 text-red-400"
                              : "bg-blue-500/10 text-blue-400"
                          }`}
                        >
                          {u.role === "admin" ? (
                            <Shield className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditUser(u)}
                            className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setResetUser(u)}
                            className="p-1.5 text-slate-400 hover:text-yellow-400 hover:bg-slate-800 rounded-lg transition"
                            title="Reset Password"
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>
                          {u.id !== user.id && (
                            <button
                              onClick={() => setDeleteUser(u)}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div
            className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg text-sm font-medium shadow-lg z-50 ${
              toast.type === "success"
                ? "bg-green-600 text-white"
                : "bg-red-600 text-white"
            }`}
          >
            {toast.msg}
          </div>
        )}

        {/* Create User Modal */}
        {showCreate && (
          <CreateUserModal
            onClose={() => setShowCreate(false)}
            onCreated={() => {
              setShowCreate(false);
              fetchUsers();
              showToast("User created successfully");
            }}
          />
        )}

        {/* Edit User Modal */}
        {editUser && (
          <EditUserModal
            target={editUser}
            onClose={() => setEditUser(null)}
            onUpdated={() => {
              setEditUser(null);
              fetchUsers();
              showToast("User updated successfully");
            }}
          />
        )}

        {/* Reset Password Modal */}
        {resetUser && (
          <ResetPasswordModal
            target={resetUser}
            onClose={() => setResetUser(null)}
            onReset={() => {
              setResetUser(null);
              showToast("Password reset successfully");
            }}
          />
        )}

        {/* Delete Confirm Modal */}
        {deleteUser && (
          <DeleteUserModal
            target={deleteUser}
            onClose={() => setDeleteUser(null)}
            onDeleted={() => {
              setDeleteUser(null);
              fetchUsers();
              showToast("User deleted");
            }}
          />
        )}
      </main>
    </div>
  );
}

/* ─── Modals ─── */

function ModalShell({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ username: "", email: "", password: "", role: "viewer" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/register", form);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title="Create User" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Username" value={form.username} onChange={(v) => setForm({ ...form, username: v })} required />
        <Input label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
        <Input label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} required />
        <div>
          <label className="block text-sm text-slate-400 mb-1">Role</label>
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition">
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create User"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function EditUserModal({ target, onClose, onUpdated }) {
  const [form, setForm] = useState({ username: target.username, email: target.email, role: target.role });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.put(`/auth/users/${target.id}`, form);
      onUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title={`Edit — ${target.username}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Username" value={form.username} onChange={(v) => setForm({ ...form, username: v })} required />
        <Input label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
        <div>
          <label className="block text-sm text-slate-400 mb-1">Role</label>
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition">
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ResetPasswordModal({ target, onClose, onReset }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password !== confirm) return setError("Passwords do not match");
    if (password.length < 6) return setError("Password must be at least 6 characters");
    setLoading(true);
    try {
      await api.put(`/auth/users/${target.id}/password`, { password });
      onReset();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title={`Reset Password — ${target.username}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="New Password" type="password" value={password} onChange={setPassword} required />
        <Input label="Confirm Password" type="password" value={confirm} onChange={setConfirm} required />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition">
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {loading ? "Resetting..." : "Reset Password"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function DeleteUserModal({ target, onClose, onDeleted }) {
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      await api.delete(`/auth/users/${target.id}`);
      onDeleted();
    } catch {
      setLoading(false);
    }
  }

  return (
    <ModalShell title="Delete User" onClose={onClose}>
      <p className="text-slate-300 text-sm mb-6">
        Are you sure you want to delete <strong className="text-white">{target.username}</strong>?
        This action cannot be undone.
      </p>
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition">
          Cancel
        </button>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
        >
          {loading ? "Deleting..." : "Delete User"}
        </button>
      </div>
    </ModalShell>
  );
}

function Input({ label, type = "text", value, onChange, required }) {
  return (
    <div>
      <label className="block text-sm text-slate-400 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}
