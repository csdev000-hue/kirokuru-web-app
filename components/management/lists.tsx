import Link from "next/link";
export function Members({ members }: { members: { userId: string; name: string; email: string; role: string }[] }) {
  return <section><h2>メンバー</h2><ul>{members.map((member) => <li key={member.userId}>{member.name} · {member.email} · {member.role}</li>)}</ul></section>;
}
export function Projects({ projects }: { projects: { id: string; name: string; status: string; role: string; updatedAt: Date }[] }) {
  return projects.length ? <ul className="resource-list">{projects.map((project) => <li key={project.id}><Link href={`/projects/${project.id}`}>{project.name}</Link><span>{project.status} · {project.role} · <time dateTime={project.updatedAt.toISOString()}>{project.updatedAt.toISOString().slice(0, 10)}</time></span></li>)}</ul> : <p>まだProjectがありません</p>;
}
