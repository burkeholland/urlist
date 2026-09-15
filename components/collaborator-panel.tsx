'use client';

import { useEffect, useState } from 'react';
import type { InviteRole, ListInvite, ListMembership, MembershipRole } from '@/lib/types';

type SafeInvite = Omit<ListInvite, 'tokenHash'>;

interface CollaboratorPanelProps {
  listId: string;
  currentUserId: string | null;
  userRole: MembershipRole | null | undefined;
}

function roleLabel(role: MembershipRole | InviteRole | null | undefined): string {
  if (!role) return 'No access';
  return role[0].toUpperCase() + role.slice(1);
}

function isActiveInvite(invite: SafeInvite): boolean {
  return !invite.revokedAt && !invite.acceptedAt && invite.expiresAt > Date.now();
}

export function CollaboratorPanel({ listId, currentUserId, userRole }: CollaboratorPanelProps) {
  const [members, setMembers] = useState<ListMembership[]>([]);
  const [invites, setInvites] = useState<SafeInvite[]>([]);
  const [inviteRole, setInviteRole] = useState<InviteRole>('editor');
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(userRole === 'owner');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isOwner = userRole === 'owner';

  useEffect(() => {
    if (!isOwner) return;

    async function loadCollaborators() {
      setLoading(true);
      setError(null);
      try {
        const [membersRes, invitesRes] = await Promise.all([
          fetch(`/api/lists/${listId}/members`, { credentials: 'include' }),
          fetch(`/api/lists/${listId}/invites`, { credentials: 'include' }),
        ]);
        if (!membersRes.ok || !invitesRes.ok) {
          setError('Failed to load collaborators.');
          return;
        }
        const membersBody = await membersRes.json();
        const invitesBody = await invitesRes.json();
        setMembers(Array.isArray(membersBody.members) ? membersBody.members : []);
        setInvites(Array.isArray(invitesBody.invites) ? invitesBody.invites : []);
      } catch {
        setError('Failed to load collaborators.');
      } finally {
        setLoading(false);
      }
    }

    void loadCollaborators();
  }, [isOwner, listId]);

  async function createInviteLink() {
    setBusy('create');
    setError(null);
    setInviteUrl(null);
    try {
      const res = await fetch(`/api/lists/${listId}/invites`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: inviteRole, expiresInDays }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error?.message || 'Failed to create invite.');
        return;
      }
      setInviteUrl(body.inviteUrl);
      setInvites((prev) => [body.invite, ...prev]);
    } catch {
      setError('Failed to create invite.');
    } finally {
      setBusy(null);
    }
  }

  async function revokeInvite(inviteId: string) {
    setBusy(inviteId);
    setError(null);
    try {
      const res = await fetch(`/api/lists/${listId}/invites/${inviteId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error?.message || 'Failed to revoke invite.');
        return;
      }
      setInvites((prev) => prev.map((invite) => (invite.id === inviteId ? body.invite : invite)));
    } catch {
      setError('Failed to revoke invite.');
    } finally {
      setBusy(null);
    }
  }

  async function rotateInvite(inviteId: string) {
    setBusy(`${inviteId}:rotate`);
    setError(null);
    setInviteUrl(null);
    try {
      const res = await fetch(`/api/lists/${listId}/invites/${inviteId}/rotate`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresInDays }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error?.message || 'Failed to rotate invite.');
        return;
      }
      setInviteUrl(body.inviteUrl);
      setInvites((prev) => [body.invite, ...prev.map((invite) => (
        invite.id === inviteId ? { ...invite, revokedAt: Date.now(), revokedBy: currentUserId } : invite
      ))]);
    } catch {
      setError('Failed to rotate invite.');
    } finally {
      setBusy(null);
    }
  }

  async function changeMemberRole(uid: string, role: InviteRole) {
    setBusy(uid);
    setError(null);
    try {
      const res = await fetch(`/api/lists/${listId}/members/${encodeURIComponent(uid)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error?.message || 'Failed to update collaborator.');
        return;
      }
      setMembers((prev) => prev.map((member) => (member.uid === uid ? body.member : member)));
    } catch {
      setError('Failed to update collaborator.');
    } finally {
      setBusy(null);
    }
  }

  async function removeMember(uid: string) {
    setBusy(uid);
    setError(null);
    try {
      const res = await fetch(`/api/lists/${listId}/members/${encodeURIComponent(uid)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error?.message || 'Failed to remove collaborator.');
        return;
      }
      setMembers((prev) => prev.filter((member) => member.uid !== uid));
    } catch {
      setError('Failed to remove collaborator.');
    } finally {
      setBusy(null);
    }
  }

  if (!userRole) {
    return null;
  }

  if (!isOwner) {
    return (
      <section className="collab-panel">
        <div>
          <h2>Collaborators</h2>
          <p className="muted small">Your role is <strong>{roleLabel(userRole)}</strong>. {userRole === 'viewer' ? 'You can view this management page but cannot edit content.' : 'You can update content, but only the owner can manage members or delete the list.'}</p>
        </div>
        <style jsx>{panelStyles}</style>
      </section>
    );
  }

  return (
    <section className="collab-panel">
      <div className="collab-head">
        <div>
          <h2>Collaborators</h2>
          <p className="muted small">Invite links are one-time use and expire automatically.</p>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="invite-row">
        <select className="input input-sm" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as InviteRole)}>
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>
        <input
          className="input input-sm"
          type="number"
          min={1}
          max={30}
          value={expiresInDays}
          onChange={(e) => setExpiresInDays(Math.max(1, Math.min(30, Number(e.target.value) || 7)))}
          aria-label="Invite expiry in days"
        />
        <button className="btn btn-primary btn-sm" disabled={busy === 'create'} onClick={createInviteLink}>
          {busy === 'create' ? 'Creating…' : 'Create invite'}
        </button>
      </div>

      {inviteUrl && (
        <div className="invite-url">
          <input className="input input-mono input-sm" readOnly value={inviteUrl} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn btn-outline" onClick={() => navigator.clipboard?.writeText(inviteUrl)}>Copy</button>
        </div>
      )}

      {loading ? (
        <p className="muted small">Loading collaborators…</p>
      ) : (
        <>
          <div className="member-list">
            {members.map((member) => (
              <div className="member-row" key={member.uid}>
                <div className="member-main">
                  {member.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={member.avatar} alt="" />
                  ) : <div className="avatar-fallback" />}
                  <div>
                    <div className="member-name">{member.username || member.name || member.uid}</div>
                    <div className="member-sub mono">{member.uid}</div>
                  </div>
                </div>
                {member.role === 'owner' ? (
                  <span className="role-pill">Owner</span>
                ) : (
                  <div className="member-actions">
                    <select
                      className="input input-sm"
                      value={member.role}
                      disabled={busy === member.uid}
                      onChange={(e) => changeMemberRole(member.uid, e.target.value as InviteRole)}
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button className="btn-danger-ghost" disabled={busy === member.uid} onClick={() => removeMember(member.uid)}>
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="invite-list">
            <h3>Invite links</h3>
            {invites.length === 0 ? (
              <p className="muted small">No invite links yet.</p>
            ) : (
              invites.map((invite) => (
                <div className="invite-item" key={invite.id}>
                  <div>
                    <span className="role-pill">{roleLabel(invite.role)}</span>
                    <span className="muted small"> Expires {new Date(invite.expiresAt).toLocaleDateString()}</span>
                    {!isActiveInvite(invite) && <span className="muted small"> · inactive</span>}
                  </div>
                  <div className="invite-actions">
                    {isActiveInvite(invite) && (
                      <button className="btn-danger-ghost" disabled={busy === invite.id} onClick={() => revokeInvite(invite.id)}>
                        Revoke
                      </button>
                    )}
                    <button className="btn-ghost" disabled={busy === `${invite.id}:rotate`} onClick={() => rotateInvite(invite.id)}>
                      Rotate
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <style jsx>{panelStyles}</style>
    </section>
  );
}

const panelStyles = `
  .collab-panel {
    background: var(--surface);
    border: 1px solid var(--surface-border);
    border-radius: var(--radius);
    padding: 14px;
    margin: 18px 0;
  }
  .collab-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  h2 {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 4px;
  }
  h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 14px 0 8px;
  }
  .error-text {
    color: var(--danger);
    font-size: 14px;
    margin: 8px 0;
  }
  .invite-row,
  .invite-url,
  .member-row,
  .member-actions,
  .invite-item,
  .invite-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .invite-row {
    margin-top: 12px;
  }
  .invite-row select {
    max-width: 130px;
  }
  .invite-row input[type='number'] {
    max-width: 90px;
  }
  .invite-url {
    margin-top: 10px;
  }
  .member-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 14px;
  }
  .member-row,
  .invite-item {
    justify-content: space-between;
    border-top: 1px solid var(--border);
    padding-top: 8px;
  }
  .member-main {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .member-main img,
  .avatar-fallback {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--bg-secondary);
    flex: none;
  }
  .member-name {
    font-size: 14px;
    font-weight: 500;
  }
  .member-sub {
    color: var(--text-muted);
    font-size: 11px;
  }
  .role-pill {
    background: var(--blue-bg);
    border: 1px solid var(--surface-border);
    border-radius: 999px;
    color: var(--accent);
    display: inline-flex;
    font-size: 12px;
    font-weight: 600;
    padding: 3px 8px;
  }
  .member-actions select {
    max-width: 110px;
  }
  @media (max-width: 640px) {
    .invite-row,
    .invite-url,
    .member-row,
    .invite-item {
      align-items: stretch;
      flex-direction: column;
    }
    .invite-row select,
    .invite-row input[type='number'],
    .member-actions select {
      max-width: none;
    }
    .member-actions {
      width: 100%;
      justify-content: space-between;
    }
  }
`;
