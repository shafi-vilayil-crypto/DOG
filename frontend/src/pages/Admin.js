import { useEffect, useState } from "react";
import { ShieldCheck, UserPlus } from "lucide-react";
import { getAdminMembers, removeAdminMember, updateAdminMember } from "../services/dogApi";

export default function Admin() {
  const [members, setMembers] = useState([]);
  const [error, setError] = useState("");
  const load = () => getAdminMembers().then(data => setMembers(data.members || [])).catch(err => setError(err.message));
  useEffect(load, []);
  const role = async (member, value) => { try { await updateAdminMember(member.id, value); await load(); } catch (err) { setError(err.message); } };
  const remove = async member => { if (!window.confirm(`Remove ${member.email} from this workspace?`)) return; try { await removeAdminMember(member.id); await load(); } catch (err) { setError(err.message); } };
  return <><div className="page-heading"><div><div className="eyebrow">Administration</div><h1 data-testid="page-title">Who has access to this workspace?</h1><p data-testid="page-description">Manage members, roles, and workspace permissions.</p></div><button className="primary-button" disabled><UserPlus size={16} /> Invite member</button></div>{error && <div className="playground-error">{error}</div>}<section className="panel"><div className="panel-header"><div><span className="eyebrow">Access control</span><h2>Workspace members</h2></div><ShieldCheck size={20} color="#2a9a6d" /></div><table className="data-table" data-testid="admin-members-table"><thead><tr><th>Member</th><th>Role</th><th>Joined</th><th /></tr></thead><tbody>{members.map(member => <tr key={member.id}><td><strong>{member.display_name || member.email}</strong><div className="muted">{member.email}</div></td><td><select value={member.role} disabled={member.role === "OWNER"} onChange={e => role(member, e.target.value)}><option>OWNER</option><option>ADMIN</option><option>MEMBER</option><option>VIEWER</option></select></td><td className="muted">{new Date(member.created_at).toLocaleDateString()}</td><td><button className="text-link danger" disabled={member.role === "OWNER"} onClick={() => remove(member)}>Remove</button></td></tr>)}</tbody></table></section></>;
}
