import AppShell from "@/components/AppShell";

export default async function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <AppShell initialUsername={username.replace(/^@/, "").toLowerCase()} />;
}
