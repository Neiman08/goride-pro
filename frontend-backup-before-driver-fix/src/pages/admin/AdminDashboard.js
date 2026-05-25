import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import AppShell from '../../components/layout/AppShell';
import { Button, Card, Badge, Stat, StatusDot, Spinner, Alert } from '../../components/ui/UI';
import './AdminDashboard.css';

// ── Overview ───────────────────────────────────────────────────────────────
function AdminOverview() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminAPI.metrics().then(({ data }) => setMetrics(data.metrics)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page"><Spinner size={28} /></div>;
  if (!metrics)  return <div className="page"><p className="empty-state">Failed to load metrics</p></div>;

  const { users, rides, revenue } = metrics;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Operations Overview</h1>
        <p className="page-sub">Live platform metrics</p>
      </div>

      <p className="section-title">Revenue</p>
      <div className="stat-grid">
        <Stat label="Platform today"   value={`$${revenue.today.platform?.toFixed(2) || '0.00'}`} accent />
        <Stat label="Driver payouts today" value={`$${revenue.today.drivers?.toFixed(2) || '0.00'}`} />
        <Stat label="Platform this month" value={`$${revenue.month.platform?.toFixed(2) || '0.00'}`} accent />
        <Stat label="Total all-time"   value={`$${revenue.allTime.platform?.toFixed(2) || '0.00'}`} />
      </div>

      <p className="section-title">Rides</p>
      <div className="stat-grid">
        <Stat label="Live now"         value={rides.live}    accent />
        <Stat label="Today"            value={rides.today} />
        <Stat label="This week"        value={rides.week} />
        <Stat label="All-time"         value={rides.total} />
      </div>

      <p className="section-title">Users</p>
      <div className="stat-grid">
        <Stat label="Active drivers"   value={users.activeDrivers} />
        <Stat label="Online now"       value={users.drivers} />
        <Stat label="Pending approval" value={users.pendingDrivers} sub="drivers" />
        <Stat label="Passengers"       value={users.passengers} />
      </div>

      {metrics.recentLiveRides?.length > 0 && (
        <>
          <p className="section-title">Live rides</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th><th>Passenger</th><th>Driver</th>
                  <th>Type</th><th>Fare</th><th>Started</th>
                </tr>
              </thead>
              <tbody>
                {metrics.recentLiveRides.map((r) => (
                  <tr key={r._id}>
                    <td><StatusDot status={r.status} /> {r.status}</td>
                    <td>{r.passenger?.name || '—'}</td>
                    <td>{r.driver?.name || 'Unassigned'}</td>
                    <td><Badge variant="default">{r.rideType}</Badge></td>
                    <td className="mono">${r.estimatedPrice?.toFixed(2)}</td>
                    <td className="mono">{new Date(r.createdAt).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Rides ──────────────────────────────────────────────────────────────────
function AdminRides() {
  const [rides, setRides]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [status, setStatus]   = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    adminAPI.rides({ page, limit: 20, status: status || undefined })
      .then(({ data }) => { setRides(data.rides); setTotal(data.total); })
      .finally(() => setLoading(false));
  }, [page, status]);

  const STATUS_V = { completed: 'success', cancelled: 'danger', searching: 'warning', accepted: 'info', in_progress: 'accent' };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Rides</h1>
        <p className="page-sub mono">{total} total</p>
      </div>

      <div className="filter-row">
        {['', 'searching', 'accepted', 'in_progress', 'completed', 'cancelled'].map((s) => (
          <button key={s} className={`filter-btn ${status === s ? 'active' : ''}`} onClick={() => { setStatus(s); setPage(1); }}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? <Spinner size={24} /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Status</th><th>Passenger</th><th>Driver</th><th>Type</th><th>Fare</th><th>Platform</th><th>Driver</th><th>Date</th></tr>
            </thead>
            <tbody>
              {rides.map((r) => (
                <tr key={r._id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/admin/rides/${r._id}`)}>
                  <td><Badge variant={STATUS_V[r.status] || 'default'}>{r.status}</Badge></td>
                  <td>{r.passenger?.name || '—'}</td>
                  <td>{r.driver?.name || '—'}</td>
                  <td><Badge variant="default">{r.rideType}</Badge></td>
                  <td className="mono">${r.estimatedPrice?.toFixed(2)}</td>
                  <td className="mono accent">${r.platformCut?.toFixed(2) || '—'}</td>
                  <td className="mono">${r.driverPayout?.toFixed(2) || '—'}</td>
                  <td className="mono">{new Date(r.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pagination">
        <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</Button>
        <span className="mono">Page {page}</span>
        <Button variant="ghost" size="sm" disabled={rides.length < 20} onClick={() => setPage(p => p + 1)}>Next →</Button>
      </div>
    </div>
  );
}

// ── Drivers ────────────────────────────────────────────────────────────────
function AdminDrivers() {
  const [drivers, setDrivers]   = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [approving, setApproving] = useState(null);

  const load = () => {
    setLoading(true);
    adminAPI.drivers({ limit: 50 }).then(({ data }) => { setDrivers(data.drivers); setTotal(data.total); }).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggleApproval = async (driver) => {
    setApproving(driver._id);
    await adminAPI.updateUser(driver._id, { isApproved: !driver.isApproved });
    load();
    setApproving(null);
  };

  const toggleActive = async (driver) => {
    await adminAPI.updateUser(driver._id, { isActive: !driver.isActive });
    load();
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Drivers</h1>
        <p className="page-sub mono">{total} registered</p>
      </div>

      {loading ? <Spinner size={24} /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Driver</th><th>Vehicle</th><th>Status</th><th>Rides</th><th>Earnings</th><th>Rating</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d._id}>
                  <td>
                    <div className="user-cell">
                      <div className="user-avatar">{d.name?.[0]}</div>
                      <div>
                        <p className="user-name">{d.name}</p>
                        <p className="user-email">{d.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {d.vehicleInfo?.brand} {d.vehicleInfo?.model}<br/>
                    <span style={{ color: 'var(--text-3)' }}>{d.vehicleInfo?.plate}</span>
                  </td>
                  <td>
                    <div className="status-stack">
                      <StatusDot status={d.isOnline ? 'online' : 'offline'} />
                      {d.isApproved
                        ? <Badge variant="success">Approved</Badge>
                        : <Badge variant="warning">Pending</Badge>}
                      {!d.isActive && <Badge variant="danger">Suspended</Badge>}
                    </div>
                  </td>
                  <td className="mono">{d.totalRides}</td>
                  <td className="mono accent">${(d.totalEarnings || 0).toFixed(2)}</td>
                  <td className="mono">⭐ {d.rating}</td>
                  <td>
                    <div className="action-btns">
                      <Button
                        variant={d.isApproved ? 'danger' : 'success'}
                        size="sm"
                        loading={approving === d._id}
                        onClick={() => toggleApproval(d)}
                      >
                        {d.isApproved ? 'Revoke' : 'Approve'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(d)}>
                        {d.isActive ? 'Suspend' : 'Restore'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Passengers ─────────────────────────────────────────────────────────────
function AdminPassengers() {
  const [users, setUsers]   = useState([]);
  const [total, setTotal]   = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      adminAPI.users({ role: 'passenger', search, limit: 50 })
        .then(({ data }) => { setUsers(data.users); setTotal(data.total); })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Passengers</h1>
        <p className="page-sub mono">{total} registered</p>
      </div>
      <input className="search-input" placeholder="Search by name, email or phone…" value={search} onChange={(e) => setSearch(e.target.value)} />

      {loading ? <Spinner size={24} /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Passenger</th><th>Phone</th><th>Rides</th><th>Rating</th><th>Joined</th><th>Status</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id}>
                  <td>
                    <div className="user-cell">
                      <div className="user-avatar user-avatar--blue">{u.name?.[0]}</div>
                      <div>
                        <p className="user-name">{u.name}</p>
                        <p className="user-email">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>{u.phone || '—'}</td>
                  <td className="mono">{u.totalRides}</td>
                  <td className="mono">⭐ {u.rating}</td>
                  <td className="mono">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td><Badge variant={u.isActive ? 'success' : 'danger'}>{u.isActive ? 'Active' : 'Suspended'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Commissions ────────────────────────────────────────────────────────────
function AdminCommissions() {
  const [commissions, setCommissions] = useState([]);
  const [summary, setSummary]         = useState(null);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    adminAPI.commissions({ limit: 50 })
      .then(({ data }) => { setCommissions(data.commissions); setSummary(data.summary); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Commissions 70/30</h1>
      </div>

      {summary && (
        <div className="stat-grid">
          <Stat label="Total fare"     value={`$${summary.totalFare?.toFixed(2) || '0.00'}`} />
          <Stat label="Platform (30%)" value={`$${summary.platformCut?.toFixed(2) || '0.00'}`} accent />
          <Stat label="Drivers (70%)"  value={`$${summary.driverPayout?.toFixed(2) || '0.00'}`} />
        </div>
      )}

      {loading ? <Spinner size={24} /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Driver</th><th>Type</th><th>Total fare</th><th>Platform 30%</th><th>Driver 70%</th><th>Miles</th></tr>
            </thead>
            <tbody>
              {commissions.map((c) => (
                <tr key={c._id}>
                  <td className="mono">{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td>{c.driver?.name || '—'}</td>
                  <td><Badge variant="default">{c.rideType}</Badge></td>
                  <td className="mono">${c.totalFare?.toFixed(2)}</td>
                  <td className="mono accent">${c.platformCut?.toFixed(2)}</td>
                  <td className="mono">${c.driverPayout?.toFixed(2)}</td>
                  <td className="mono">{c.distanceMiles} mi</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tariffs ────────────────────────────────────────────────────────────────
function AdminTariffs() {
  const [tariffs, setTariffs] = useState([]);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving]   = useState(false);
  const [ok, setOk]           = useState('');

  useEffect(() => {
    adminAPI.tariffs().then(({ data }) => setTariffs(data.tariffs));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await adminAPI.updateTariff(editing._id, {
        baseFare: parseFloat(editing.baseFare),
        ratePerMile: parseFloat(editing.ratePerMile),
        ratePerMinute: parseFloat(editing.ratePerMinute),
        minimumFare: parseFloat(editing.minimumFare),
        surgeMultiplier: parseFloat(editing.surgeMultiplier),
        surgeActive: editing.surgeActive,
        platformCommissionPct: parseFloat(editing.platformCommissionPct),
        driverPayoutPct: parseFloat(editing.driverPayoutPct),
      });
      const { data } = await adminAPI.tariffs();
      setTariffs(data.tariffs);
      setEditing(null);
      setOk('Tariff updated');
      setTimeout(() => setOk(''), 3000);
    } finally { setSaving(false); }
  };

  const field = (k, label, type = 'number') => (
    <div className="tariff-field">
      <label>{label}</label>
      <input
        type={type}
        step="0.01"
        value={editing[k]}
        onChange={(e) => setEditing((t) => ({ ...t, [k]: type === 'checkbox' ? e.target.checked : e.target.value }))}
      />
    </div>
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Tariff Control</h1>
        <p className="page-sub">Adjust fares, surge and commission split</p>
      </div>

      {ok && <Alert message={ok} type="success" onClose={() => setOk('')} />}

      <div className="tariff-grid">
        {tariffs.map((t) => (
          <Card key={t._id} className="tariff-card">
            <div className="tariff-header">
              <span className="tariff-icon">{t.icon}</span>
              <div>
                <p className="tariff-name">{t.label}</p>
                <p className="tariff-desc">{t.description}</p>
              </div>
              {t.surgeActive && <Badge variant="warning">🔥 Surge ×{t.surgeMultiplier}</Badge>}
            </div>

            <div className="tariff-rates">
              <div><span>Base fare</span><span className="mono">${t.baseFare}</span></div>
              <div><span>Per mile</span><span className="mono">${t.ratePerMile}</span></div>
              <div><span>Per minute</span><span className="mono">${t.ratePerMinute}</span></div>
              <div><span>Minimum</span><span className="mono">${t.minimumFare}</span></div>
              <div><span>Commission</span><span className="mono">{t.driverPayoutPct}% driver / {t.platformCommissionPct}% platform</span></div>
            </div>

            <Button variant="secondary" size="sm" onClick={() => setEditing({ ...t })}>Edit tariff</Button>
          </Card>
        ))}
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Edit {editing.label}</h2>
            <div className="tariff-fields">
              {field('baseFare', 'Base fare ($)')}
              {field('ratePerMile', 'Rate per mile ($)')}
              {field('ratePerMinute', 'Rate per minute ($)')}
              {field('minimumFare', 'Minimum fare ($)')}
              {field('surgeMultiplier', 'Surge multiplier')}
              {field('platformCommissionPct', 'Platform % (must sum to 100)')}
              {field('driverPayoutPct', 'Driver %')}
              <div className="tariff-field">
                <label>Surge active</label>
                <input type="checkbox" checked={editing.surgeActive} onChange={(e) => setEditing((t) => ({ ...t, surgeActive: e.target.checked }))} />
              </div>
            </div>
            <div className="modal-actions">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button variant="primary" loading={saving} onClick={save}>Save changes</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Router ─────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  return (
    <AppShell>
      <Routes>
        <Route index element={<AdminOverview />} />
        <Route path="rides" element={<AdminRides />} />
        <Route path="drivers" element={<AdminDrivers />} />
        <Route path="passengers" element={<AdminPassengers />} />
        <Route path="commissions" element={<AdminCommissions />} />
        <Route path="tariffs" element={<AdminTariffs />} />
      </Routes>
    </AppShell>
  );
}
